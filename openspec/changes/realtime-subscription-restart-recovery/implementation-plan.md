# Implementation Plan: realtime-subscription-restart-recovery

状态：spec 已确认（2026-08-20 门禁通过）。实施计划（代码级），经用户确认后落地。

## 0. 目标行为（一句话）

datasource 侧状态机（IDLE/PUSHING/VERIFIED）在 A 股活动窗口（默认
`09:15-11:30,13:00-15:00` UTC+8）内自动重连订阅：推送成功即停（VERIFIED 零额外
SDK 调用）、断流即重发（PUSHING）、恢复不了升级告警（escalated）；窗口外零动作。

## 1. 改动文件总览

### mist-datasource 仓
| 文件 | 改动 |
|---|---|
| `src/datasource/realtime/stall_detector.py` | **新增**：共享三态状态机 + 活动窗口 |
| `src/datasource/realtime/__init__.py` | 导出 StallDetector / ActivityWindow |
| `src/datasource/metrics.py` | 新增 3 个 instrument + 3 个记录函数 |
| `src/datasource/tdx/realtime/gateway.py` | 接 StallDetector、poll 语义切换、活动喂入、watchdog、generation 日志、health 字段 |
| `tdx/main.py` | lifespan 启动/停止 watchdog task |
| `tdx/routes/bridge.py` | observability 处理喂入 gateway.observe_bridge_activity |
| `src/datasource/qmt/realtime/subscription.py` | controller 接 StallDetector、_sync 状态机语义、force-sync、health 字段 |
| `src/datasource/qmt/realtime/gateway.py` | register_owner generation 日志 + owner_registration metric |
| `qmt/main.py` | 注册 snapshot_age gauge（对称性修复）+ watchdog task + collector snapshot_age |
| `tdx/builtin_bridge/mist_tdx_realtime_bridge.py` | REARM_ENABLED 配置门 + 启动上下文日志 + buildId→v3.1 |
| `qmt/builtin_bridge/mist_qmt_realtime_bridge.py` | （可选）启动日志对齐 |
| 测试 | 见 §6 |

### mist-deploy 仓
| 文件 | 改动 |
|---|---|
| `docker/compose.yaml` / `docker/.env.example` | tdx-datasource / qmt-datasource / mist-backend 设 `MIST_ACTIVITY_WINDOWS` |
| `oo-alerts/rules.json` + `scripts/sync-oo-alerts.ps1` | A1 拆分（source 维度）+ 新增 A7（stall_active） |
| `scripts/test-docker-compose-config.ps1` / `test-*` | 断言更新 |
| HIL scripts / workflows | Assert-BridgeIdentity 加 stall 字段；新增测试场景 |

## 2. 共享层 `stall_detector.py`

纯逻辑、无 I/O、时钟可 fake。

```python
# src/datasource/realtime/stall_detector.py
from __future__ import annotations
import os, re  # noqa
from collections.abc import Callable
from datetime import datetime, time as dtime, timedelta, timezone
from typing import Literal

PushState = Literal["idle", "pushing", "verified"]

_UTC8 = timezone(timedelta(hours=8))
_DEFAULT_WINDOW = "09:15-11:30,13:00-15:00"  # MIST_ACTIVITY_WINDOWS 默认


class ActivityWindow:
    """A 股日内活动窗口（UTC+8）。env: MIST_ACTIVITY_WINDOWS，
    "HH:MM-HH:MM,HH:MM-HH:MM"（跨午休多段）。"""
    def __init__(self, env_value: str | None = None,
                 now: Callable[[], datetime] | None = None) -> None:
        self._now = now or (lambda: datetime.now(_UTC8))
        self._segments = self._parse(env_value or os.environ.get(
            "MIST_ACTIVITY_WINDOWS", _DEFAULT_WINDOW))

    @staticmethod
    def _parse(value: str) -> list[tuple[dtime, dtime]]:
        segments = []
        for part in value.split(","):
            start_s, end_s = part.split("-")
            segments.append((_parse_hhmm(start_s), _parse_hhmm(end_s)))
        return segments

    def in_window(self, now: datetime | None = None) -> bool:
        t = (now or self._now()).time()
        return any(start <= t < end for start, end in self._segments)


class StallDetector:
    """三态状态机，宿主喂活动事件，tick 推进。

    - IDLE（窗口外）: 零重发零告警
    - PUSHING（窗口内且数据不在流动）: 宿主执行全量重发恢复
    - VERIFIED（窗口内且数据在流动）: 宿主零动作
    - escalated: PUSHING 内恢复动作连续 N 轮无任何活动。
    """
    def __init__(self, *, source: str,
                 window: ActivityWindow,
                 stall_grace_seconds: float = 180.0,
                 max_recovery_cycles: int = 3,
                 now: Callable[[], float] | None = None,   # monotonic 秒（默认 time.monotonic）
                 on_change: Callable[[PushState], None] | None = None) -> None:
        self.source, self._window = source, window
        self._grace = stall_grace_seconds
        self._max_cycles = max_recovery_cycles
        self._now = now or time.monotonic
        self._last_activity: float | None = None   # 任意活动（快照/回调）
        self._cycle_count = 0                       # 当前 PUSHING 已执行的恢复轮数
        self._state: PushState = "idle"
        self._escalated = False

    # —— 宿主喂入 ——
    def observe_snapshot(self) -> None: self._touch()
    def observe_callback(self) -> None: self._touch()

    def _touch(self) -> None:
        self._last_activity = self._now()
        self._cycle_count = 0
        self._escalated = False
        if self._window.in_window(): self._set("verified")

    # —— 恢复动作宿主侧调用（每次全量重发/force-sync）——
    def note_recovery(self) -> None:
        if self._state == "pushing":
            n = self._last_activity_ago()
            if n is None or n <= self._grace:  # PUSHING 仍在宽限内不算失败轮（首次）
                pass
            self._cycle_count += 1

    # —— tick 推进（watchdog 每 ~5s 调用）——
    def evaluate(self) -> None:
        if not self._window.in_window():
            self._set("idle"); self._cycle_count = 0; return
        if self._last_activity is None:
            # 窗口内无任何历史活动：初始化 → PUSHING（让宿主全量重发直到推送成功）
            self._set("pushing")
            return
        ago = self._now() - self._last_activity
        if ago <= self._grace:
            self._set("verified")
        else:
            self._set("pushing")
            if self._cycle_count >= self._max_cycles:
                self._escalated = True

    def _set(self, s: PushState) -> None:
        if s == self._state: return
        self._state = s
        if self._on_change: self._on_change(s)

    # —— 宿主查询 ——
    @property
    def push_state(self) -> PushState: return self._state
    @property
    def stall_detected(self) -> bool: return self._state == "pushing"
    @property
    def stall_escalated(self) -> bool: return self._escalated
    @property
    def in_window(self) -> bool: return self._window.in_window()
    def _last_activity_ago(self) -> float | None:
        return (self._now() - self._last_activity) if self._last_activity is not None else None
```

> 说明：`note_recovery` 每个恢复周期宿主调用一次，`_cycle_count` 累计；窗口外
> evaluate 归位 IDLE 并清零。阈值全部构造注入，便于 fake-clock 测试。
> **边界**：`_set("idle")` 在窗口外由 evaluate 强制（不依赖 last_activity）。

## 3. metrics.py 扩展（双源共用，低基数）

```python
# init_metrics() 内新增
_INSTRUMENTS["stall_active"]   = m.create_gauge(
    "mist_datasource_subscription_stall_active",     # {source}
    description="Subscription stall active per source (1 pushing / 0 otherwise)")
_INSTRUMENTS["stall_total"]    = m.create_counter(
    "mist_datasource_subscription_stall_total",      # {source, outcome}: detected|recovered|escalated
    description="Subscription stall transitions per source")
_INSTRUMENTS["owner_registration"] = m.create_counter(
    "mist_datasource_owner_registration_total",      # {source, owner_changed}: true|false
    description="Bridge owner registrations per source")

def set_stall_active(source: str, active: bool) -> None: ...
def record_stall(source: str, outcome: str) -> None: ...
def record_owner_registration(source: str, owner_changed: bool) -> None: ...
```

- 挂点：watchdog 每次 evaluate 后调 `set_stall_active(source, detector.stall_detected)`
  与 `record_stall(..., "escalated")`（首次进入 escalated 时）。
- `record_owner_registration` 在 register_owner（TDX/QMT gateway）调用。

## 4. TDX datasource

### 4.1 `gateway.py`
- `__init__`（69）新增构造参数：`stall: StallDetector | None`（None 时按
  `source="tdx"` + `ActivityWindow()` + env 阈值自建），保存 `self._stall`。
- `post_snapshot`（440）：成功路径（近 479 `_last_snapshot_monotonic = ...`
  处）后调 `self._stall.observe_snapshot()`。
- 新增：
  ```python
  async def observe_bridge_activity(self, *, callback_count: int | None,
                                    fetch_count: int | None) -> None:
      """observability 帧回调进展 —— 活动辅助信号。"""
      if (callback_count is not None and callback_count != self._last_cb_count):
          self._last_cb_count = callback_count
          self._stall.observe_callback()   # 或仅 observe_snapshot 足够则省略
  ```
  （`tdx/routes/bridge.py:235-264` observability 处理处调用。）
- `poll`（328-356）：subscribe 计算改为
  ```python
  if self._stall.push_state == "pushing":
      subscribe = list(self._desired_symbols)   # 全量重发
  else:
      subscribe = [s for s in self._desired_symbols
                   if s not in self._last_reported_active]  # 原 diff
  ```
  `unsubscribe` 仍按原逻辑（desired − _last_reported_active）。
- 新增 watchdog：
  ```python
  async def run_stall_watchdog(self) -> None:
      while True:
          await asyncio.sleep(self._stall_tick_seconds)   # 默认 5s
          self._stall.evaluate()
          _set_stall_active("tdx", self._stall.stall_detected)
          if self._stall.stall_escalated:
              _record_stall("tdx", "escalated")
              log.error("tdx subscription stall escalated; no auto-restart")
  ```
- `register_owner`（149-250）：在 generation 递增处（216-217）之后加
  ```python
  log.info("bridge re-registered source=tdx gen=%d->%d ownerId=%r",
           prev_gen, generation, owner_id)   # prev_gen 为 _owner.generation 或 0
  record_owner_registration("tdx", owner_changed=(prev_owner_id != owner_id))
  ```
- `health()`（796-837）返回新增：`pushState` / `stallDetected` / `stallEscalated`。

### 4.2 `tdx/main.py`
- `lifespan`（64）：`create_task(app_gateway.run_stall_watchdog())`，
  `finally` 里 `cancel()`。snapshot_age gauge 注册保持（191-193）。
- health_contract（`src/ws/health_contract.py` TdxBridgeHealth）加三字段断言。

## 5. QMT datasource

### 5.1 `subscription.py`（controller）
- `__init__`（731）新增 `stall: StallDetector | None`，保存 `self._stall`（None 时
  按 `source="qmt"` 自建）。
- `accept_snapshot`（855）：成功分支（897 更新 `_callback_last_seen` 处）调
  `self._stall.observe_snapshot()`；另一处 `_cancel/wholes` 清理也调用以刷新活动。
- `_sync`（1393）状态机语义：
  ```python
  async def _sync(self, symbols) -> int | None:
      if self._stall.push_state == "verified" and not self._desired_changed(symbols):
          return None  # VERIFIED 且 desired 未变 → 零 SDK 调用（退役 60s 循环重发）
      # 否则现状：cancel 旧 handle + subscribe_whole_quote(全量)（即 re-arm 本质）
      ...
  ```
  `_desired_changed` 以 registry 与 desired 对比（现有 comparison 逻辑提取）。
- 新增 watchdog + force-sync：
  ```python
  async def run_recovery_watchdog(self) -> None:
      while True:
          await asyncio.sleep(self._stall_tick_seconds)
          self._stall.evaluate()
          if self._stall.push_state == "pushing":
              await self.execute("sync_subscriptions", symbols=list(desired))  # 立即全量
              self._stall.note_recovery()
          sync_state()
  ```
  与 journal 边界：`execute` 内部 `reconciliation_required` 时返回
  `QMT_JOURNAL_RECONCILIATION_REQUIRED` 且不触发 SDK（既有语义，天然跳过）。
- `health()`（954-983）新增：`pushState` / `stallDetected` / `stallEscalated` /
  `callbackLastSeenAgeSeconds`（`now - max(_callback_last_seen.values())`，无则 None）。

### 5.2 `qmt/main.py`
- lifespan（118-156）里 `create_task(subscription_controller.run_recovery_watchdog())`，
  `finally` cancel。
- 对称修复：注册 snapshot_age gauge
  ```python
  ds_metrics.register_snapshot_age_callback(
      "qmt", lambda: collector.snapshot_age_seconds())
  ```
  `QmtRealtimeCollector`（`runtime.py`）若缺 `snapshot_age_seconds()`（现只有
  lastQuoteAt/lastSnapshotAgeSeconds）则补一个等价方法（与 TDX gateway 同名）。

### 5.3 `gateway.py`（qmt）
- `register_owner`（172-208）加 generation 转换日志 + `record_owner_registration("qmt", ...)`。

## 6. TDX 桥脚本 v3.1（`mist_tdx_realtime_bridge.py`）

- `BRIDGE_BUILD_ID = "mist-tdx-realtime-bridge-v3.1"`（版本号）。
- 启动上下文日志（run_bridge 入口，约 524）：
  ```
  print("[mist-bridge] starting pid=... parent=... 启动时刻=... transport=... build=v3.1")
  ```
- `REARM_ENABLED` 配置门：`REARM_ENABLED = os.environ.get(...) == "true"`（默认 false）。
- re-arm 路径（poll 处理 588-651 处）：桥维护 `_last_cb_count`（来自 counters 帧）——
  当 `REARM_ENABLED` 且本次 poll 下发**全量 desired**（PUSHING 语义）+ 距离上次执行
  subscribe 后 callback_count 无增长 → 对全量 desired 执行一轮
  `unsubscribe_hq(全量)` + `subscribe_hq(全量, callback)`（强制重挂），再走原 native
  probe / result。
  **桥零状态机感知**：只根据"poll 下发的 subscribe 列表规模 + 自身 callback 基线"
  判断，不读取 PUSHING/VERIFIED 概念本身。
- 其余（poll/result/probe/TCP/observability）不动。

## 7. QMT 桥脚本

- 启动上下文日志与 TDX 对齐：`init`（137）已打 `_log_control("build", ...)` 含
  buildId + ownerId + artifactSha256；如需 pid / 父进程 / transport 补一条 print。
  **评估既有 build 日志已满足则 5.1 跳过**（tasks 5.1 标可选）。

## 8. mist-deploy

- `docker/compose.yaml`：`tdx-datasource` / `qmt-datasource` 的 env 加
  `MIST_ACTIVITY_WINDOWS=09:15-11:30,13:00-15:00`；`mist-backend` 同（若 receiver
  需要窗口语义则消费，D7 说明 datasource 窗口即告警时段）。
- `docker/.env.example` 同步。
- `oo-alerts/rules.json`：
  - A1 → 拆 `A1_tdx_data_flow_stalled` / `A1_qmt_data_flow_stalled`
    （`from mist_datasource_snapshot_accepted_total where source='tdx'|'qmt'`），
    或先验证 OO label 谓词尊重时间窗口后选 label 过滤（二选一，验证后定）。
  - 新增 `A7_subscription_stall`：`select max(value) from
    mist_datasource_subscription_stall_active where source=...` ≥ 1 → P1（双源
    两条或一条 label 过滤）。
- `scripts/test-docker-compose-config.ps1`：断言 `MIST_ACTIVITY_WINDOWS` 存在。
- HIL：`Assert-DatasourceBridgeReady` / `Assert-BridgeIdentity` 断言后续版本加
  `pushState` 校验（实施末期再定）；新增 TDX 终端重启 / QMT 重启 / stall 告警验证
  流程（§9 场景）。

## 9. 测试用例清单

### 9.1 共享层（新 `tests/unit/test_stall_detector.py`）
- 窗口解析：`ActivityWindow._parse`（`09:15-11:30,13:00-15:00`、午休边界 11:30-13:00
  之间 in_window=False）
- 窗口外 → idle；进窗口且有活动 → verified
- verified 静默超 grace → pushing
- observed snapshot 恢复 → verified + escalated 清零
- note_recovery × max_cycles → escalated=True
- 窗口外 evaluate 强制回 idle、cycle 清零

### 9.2 TDX（`tests/unit/test_tdx_realtime_gateway.py` 扩展）
- fake clock（既有 monkeypatch `time.monotonic` 模式）：
  - pushing 态 poll 返回全量 subscribe；verified/idle 返回 diff（现有逻辑回归）
  - post_snapshot → verified；静默（不喂 snapshot）→ pushing
  - re-register（register_owner）后下一 poll 全量（现有隐式行为补测）
- health 含 pushState/stallDetected/stallEscalated

### 9.3 QMT（`tests/unit/test_qmt_subscription_control.py` 扩展）
- verified + desired 未变 → `_sync` 返回 None（零 SDK 调用断言：poll_command 无输出）
- pushing → watchdog 触发 force sync（inFlight 出现 subscribe_whole_quote）
- reconciliation_required=true 时 watchdog 跳过（QMT_JOURNAL_RECONCILIATION_REQUIRED）
- health 含 callbackLastSeenAgeSeconds / pushState

### 9.4 桥脚本（`tests/unit/test_terminal_bridge.py` 扩展）
- REARM_ENABLED 默认 false；true 时"全量 subscribe + callback 无增长"→ 一轮
  unsubscribe+subscribe（静态/行为断言）
- 启动日志含 pid/父进程/transport

### 9.5 deploy（`test-docker-compose-config.ps1` 等）
- `MIST_ACTIVITY_WINDOWS` 存在于两 datasource + backend env
- oo-alerts rules 断言（A1 拆分 + A7）

## 10. 验证命令

```bash
# mist-datasource 仓（worktree）
cd mist-datasource && uv sync && uv run pytest tests/unit/test_stall_detector.py -q
uv run pytest tests/ -q          # 全量（含回归）
uv run pyright .                 # 必须全仓（QMT 死锁教训：CI 只抓单文件漏检）

# mist 仓（openspec）
cd mist && /Users/moyui/Library/pnpm/bin/openspec validate realtime-subscription-restart-recovery --strict
   && /Users/moyui/Library/pnpm/bin/openspec validate --all --strict

# mist-deploy 仓
pwsh -File scripts/test-docker-compose-config.ps1
```

## 11. 部署顺序（桥 + datasource + deploy 一起）

1. datasource + 桥 v3.1 一起部署（memory 安全：新 poll 字段为叠加 semantics）。
2. TDX 桥 scp 到终端 + 用户重启终端加载；QMT 桥（如需）手动 copy。
3. compose/env 更新（MIST_ACTIVITY_WINDOWS）。
4. OO 规则 A7 上线（A1 拆分先验证 OO label 能力）。
5. HIL：TDX 终端重启 → callback/ingest 恢复；QMT 重启 → 恢复；窗口内模拟断流 →
   A7 触发；窗口外无样本实证。

## 12. 未决小项（实施时定，不阻塞计划确认）

- OO label 谓词是否尊重时间窗口（决定 A1 拆分 vs label 过滤形态）——6.1 任务先验证。
- QMT collector `snapshot_age_seconds()` 方法名与 `runtime.py` 现状对齐。
- re-arm 是否在 `REARM_ENABLED` 之外需要 poll 侧显式旗标——先按"桥自判断"落地，
  HIL 若证明需要 datasource 参与再加旗标（spec R3 已允许）。
