# Design: realtime-subscription-restart-recovery

## 决策点

### D1：共享状态机核心（窗口外 IDLE / 窗口内 PUSHING / VERIFIED）——算法统一、挂载点跟随架构

共享 `StallDetector`（datasource 仓 `src/datasource/realtime/stall_detector.py`）
纯逻辑类，无 I/O、fake clock 可测，双源各自实例化并喂入自己的活动信号与订阅
状态（TDX 挂 `TdxRealtimeGateway`，QMT 挂 `QmtSubscriptionController`——订阅
状态与活动信号本就住在各自宿主，不跨层穿线）。

**三态 + 升级**（用户拍板 2026-08-14：写死 A 股活动窗口，不做时段推断繁杂机制）：

```
IDLE（窗口外）：
   A 股活动窗口外（默认 09:15-11:30, 13:00-15:00，UTC+8）
   → 零重发、零检出、零告警（收盘/午休/夜间）
PUSHING（窗口内·轮询重发态）：
   窗口内初始化（有 desired 未验证推送）或从 VERIFIED 静默超 STALL_GRACE 进入
   → 每 PUSHING 重发（TDX 复用 poll 周期全量返回 / QMT 立即强制 sync）直到观察到快照流动
   → 观察到活动 → 切 VERIFIED
   → 重发 MAX_RECOVERY_CYCLES 轮无恢复 → escalated（告警，不自动重启）
VERIFIED（窗口内·稳定态）：
   观察到快照/回调流动
   → 停止重发（TDX poll 返回 diff / QMT sync 零 SDK 调用）——正常运行时零开销
   → 静默超 STALL_GRACE → 切 PUSHING（= stall 检出）
```

- **活动窗口判定**：datasource 按 `MIST_ACTIVITY_WINDOWS`（默认
  `09:15-11:30,13:00-15:00`）在 **UTC+8** 判定"当前是否窗口内"（datasource
  容器时区或显式 TZ 处理，实施计划细化）；窗口外强制 IDLE，不重连不检出。
  写死 A 股窗口即可（TDX/QMT 均 A 股），不搞"机制/策略彻底分离 + 凌晨退避
  重连"那套复杂化（用户拍板：想简单）。
- **"推送成功"信号 = datasource 收到快照**（TDX `post_snapshot`；QMT
  `accept_snapshot` 更新时间戳），回调进展（TDX observability 帧
  callback_count / QMT `_callback_last_seen`）作辅助活动信号——全部已在
  datasource 侧流经，零新增探测。
- **升级/告警**：PUSHING 内重发 `MAX_RECOVERY_CYCLES` 轮无恢复 →
  `stallEscalated` health + `stall_total{outcome=escalated}` + error 日志；
  不自动重启任何进程。
- **state 暴露**：`pushState`（`idle|pushing|verified`）+ `stallDetected` +
  `stallEscalated` 进 health 与 health_contract。

### D2：TDX 挂载（gateway）——poll 语义切换，桥零感知

- `TdxRealtimeGateway` 维护状态机实例；活动源 = `post_snapshot`（lastActivity
  更新）+ observability 帧 `callback_count` 进展（现在只打日志，新增
  `observe_bridge_activity` 入口喂入）。
- **poll 语义按状态切换**（gateway.py:349-355 现有 diff 计算处）：
  - PUSHING → `subscribe` 列表返回**全量 desired**（桥照常执行 = 全量重发）；
  - VERIFIED / IDLE → 返回 diff（现有语义，`desired − _last_reported_active`）。
- **桥 v3.1 无需感知状态**：只是照常执行 poll 下发的列表。恢复逻辑不落 bridge
  （用户拍板：终端内脚本高频 SDK 调用太重）。
- `register_owner` 重置收敛（gateway.py:231-239）本就使下轮 poll 返回全量
  subscribe——与 PUSHING 语义自然衔接（桥重启后重置 → 全量重发 → 快照恢复 →
  VERIFIED）。

### D3：QMT 挂载（controller）——sync 语义切换，桥完全不动

- `QmtSubscriptionController` 维护状态机实例；活动源 = `_callback_last_seen`
  （accept_snapshot 更新）+ collector `lastQuoteAt`。
- **sync 语义按状态切换**（controller 的 `execute("sync_subscriptions")` /
  `_sync` 路径）：
  - VERIFIED → 只对比 desired ↔ registry：一致则**零 SDK 调用**（消除既有
    每 60s 无条件全量重发的性能开销，用户拍板"QMT 也动/性能"）；
  - PUSHING → 强制全量重发（cancel + subscribe_whole_quote = QMT 的 re-arm
    本质），并**立即触发**（controller 内 watchdog，不等 backend 60s 周期）。
- **QMT 桥完全不动**：命令下发机制（poll_command / post_result 槽位协议）不变，
  改的是 controller 的 sync 语义。
- 状态机与 journal 交互：reconciliation_required=true 时跳过强制全量重发
  （既有 execute 拒绝语义）；全量重发走既有 `_sync` journaled 路径（D4 后半）。

### D4：re-arm（TDX 配置门 / QMT 本质）

- **TDX**：`REARM_ENABLED`（桥脚本 env，默认 false）。HIL 证实 `subscribe_hq`
  对已订阅标的是 **no-op**（08-14 实证暗示）→ 翻 true → 桥在 PUSHING 态
  "全量重发后 callback_count 无增长"路径执行一轮 `unsubscribe_hq(全量) →
  subscribe_hq(全量, callback)` 强制重挂。**不常驻**（只在 PUSHING 无恢复路径
  混入，避免无谓的投递空隙）。HIL 证实幂等重挂 → 保持 false。
- **QMT**：PUSHING 态全量重发本就是 cancel + subscribe_whole_quote（re-arm
  本质），无需单独开关。
- **升级语义**：双源 escalated = health + metric + 日志（告警走 metrics，
  datasource Python 日志不进 OO）。

### D5：活动窗口配置——写死 A 股窗口，单点 env

用户拍板：datasource **写死 A 股活动窗口**（09:15 集合竞价起，去午休），
不做"datasource 零时段 + 告警侧过滤"的机制/策略彻底分离（想简单）。

- **窗口定义**：`MIST_ACTIVITY_WINDOWS`，默认 `09:15-11:30,13:00-15:00`（UTC+8）。
  含义 = **重试/检出窗口**：仅窗口内 datasource 才进 PUSHING 重连 + stall 检出；
  窗口外（收盘后/午休/夜间）强制 IDLE，零动作。08-14 盘前 08:44 断流场景：
  09:15 进窗口时"数据未流动"立即构成 stall → 重连/告警（09:20 前响起，远优于
  09:25 人工恢复）——窗口对盘前断流自然兜底，无需把起点提前。
- **单点不漂移**：同一 env 名 `MIST_ACTIVITY_WINDOWS` 由 compose 传给双容器
  （tdx-datasource / qmt-datasource 与 mist-backend 的 receiver）——一份定义，
  两处消费，不存在两处各自硬编码漂移的问题（用户最初的关切）。
- **不做**节日历/夏令时（A 股节假日休市日历另处处理，本 change 仅日内窗口）；
  不建"标准时段服务"（港股/美股未接入，YAGNI）；不把窗口放
  `libs/constants/trade-sessions.ts`（那是跨仓 TS 配置，datasource 读不了；
  用 compose env 单点表达更贴合"datasource 写死窗口"的决策）。

### D6：可观测性（双源对齐）

- `mist_datasource_owner_registration_total{source, owner_changed}`：TDX 每次
  `register_owner` 递增（无条件递增，owner_changed=owner_id 是否变化）；QMT
  gateway generation 变化时递增（owner 不同/stale 才递增——语义差异记录在案）。
- **generation 转换日志**：old→new generation + 时间戳 + owner_id（TDX/QMT
  gateway register_owner）。
- **桥启动上下文日志**：桥脚本 load 时打印 pid / 父进程 / 启动时刻 / transport
  / buildId——重启原因调查（08-14 为什么无人工自动重启）。
- **QMT 观测对称性修复**：`qmt/main.py` 注册 snapshot_age gauge（与 TDX
  对称）；QMT health 暴露 `callbackLastSeenAgeSeconds` + `pushState` +
  `stallDetected/stallEscalated`。
- health 字段命名统一：`pushState` / `stallDetected` / `stallEscalated`
  （TDX bridge health 与 QMT controller/collector health 同构）。

### D7：告警（mist-deploy 仓）

- **A1 盲区**：`oo-alerts/rules.json` A1 `select count(*) from
  mist_datasource_snapshot_accepted_total` 不区分 source——TDX 与 QMT 两个
  datasource 进程往同一流名推样本，TDX 正常时 QMT 单独断流不触发。
  修复二选一（**先验证 OO label 查询能力**再定）：
  (a) 按 source 拆两条规则（A1_tdx / A1_qmt）；
  (b) SQL 加 label 过滤（验证 OO metrics label 谓词是否尊重时间窗口——O3
  教训：value 谓词绕过时间窗口，label 谓词需实测）。
- **新规则（如 A7）**：`select max(value) from
  mist_datasource_subscription_stall_active` ≥ 1 → P1，frequency 300s，双源
  一条（按 source label 区分）。datasource 窗口外已 IDLE（stall_active=0），
  规则在收盘/午休/夜间自然安静——**告警时段由 datasource 窗口恰好对齐**，
  不需要 receiver 再做时段推断（数据期望即窗口，简单一致）。

### D8：部署与版本耦合

- TDX 桥脚本 v3.1 与 datasource 新版本**一起部署**；`bridgeArtifactSha256`
  断言同步更新（HIL 脚本 Assert-BridgeIdentity / health-check）。
- compose：`MIST_ACTIVITY_WINDOWS` 加进 tdx-datasource / qmt-datasource /
  mist-backend（receiver）的 env（单点定义，D5）。
- TDX 桥脚本部署走既有 scp 通道（UTF-8 OK）；QMT 桥脚本如需更新走**手动 copy**
  （GBK 编码敏感，不 scp；本 change QMT 桥仅加启动日志，可选）。
- HIL：扩展 `run-windows-realtime-*-hil` 系列——TDX 终端重启场景（用户手动
  重启终端 + 自动化断言 callback/ingest 恢复，无 datasource 操作）；QMT 终端
  重启验证；stall 告警验证（窗口内模拟断流 → O3 A7 触发 → 投递）。

## 阈值参数表（env 可配，默认值初定，HIL 校准）

| 参数 | env | 默认 | 说明 |
|---|---|---|---|
| 活动窗口 | `MIST_ACTIVITY_WINDOWS` | `09:15-11:30,13:00-15:00` | A 股重试/检出窗口（UTC+8）；compose 单点传双容器 |
| 静默宽限 | `MIST_*_STALL_GRACE_SECONDS` | 180s | VERIFIED 中无活动超此值 → 切 PUSHING |
| 重发轮数上限 | `MIST_*_STALL_MAX_RECOVERY_CYCLES` | 3 | PUSHING 内重发 N 轮无恢复 → escalated |
| watchdog tick | `MIST_*_STALL_WATCHDOG_TICK_SECONDS` | 5s | 状态机 tick |
| TDX PUSHING 重发 | 复用 poll 周期（3s） | — | PUSHING 态 poll 返回全量，桥每轮全量重发（窗口内，量小） |
| re-arm 开关 | `REARM_ENABLED`（桥 env） | false | HIL 证实 no-op 后启用 |

## 影响链（producer → wire → decoder → state → consumer → deploy/monitoring）

- **producer**：TDX 终端 SDK（批量 subscribe_hq）→ 桥 v3.1（照 poll 执行 +
  启动日志）→ datasource gateway；QMT 终端 → 桥（命令驱动，不变）→ controller。
- **state**：共享 StallDetector（TDX 挂 gateway / QMT 挂 controller）+ 活动窗口
  （MIST_ACTIVITY_WINDOWS）→ 状态机切换 poll/sync 语义；TDX 四态收敛语义保持。
- **detector（新组件）**：StallDetector 三态 + escalated → health/metric/日志。
- **consumer**：backend ingest 不变（memory-only 约束不动）。
- **deploy**：桥 v3.1 + artifactSha256 断言；compose 加 MIST_ACTIVITY_WINDOWS；
  O3 规则（A1 拆分 + A7）；HIL workflow。
- **monitoring**：新 gauge/counter → OO → O3 规则 → 通知投递（既有 receiver；
  时段与窗口对齐，不另作推断）。

## 长期维护成本

- 共享 StallDetector 单实现双源复用（无重复逻辑），纯逻辑 + fake clock 测试。
- 活动窗口写死 A 股默认 + env 可配，单点定义（compose 一处），维护成本低。
- 状态机为 datasource 内部叠加组件：正常路径（VERIFIED）零行为变化，风险低；
  REARM_ENABLED 配置门避免未经验证的 provider 语义变更上线。
- QMT 稳定期零 SDK 调用——比现状（常驻 60s 全量重发）更轻，性能净收益。
- 风险点：PUSHING 全量重发 SDK 耐受性未知（HIL 校准）；窗口定义依赖 UTC+8
  判定（datasource 容器时区需确认/显式 TZ，实施计划细化）。
