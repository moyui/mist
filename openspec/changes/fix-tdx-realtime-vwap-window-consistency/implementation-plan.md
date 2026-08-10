# 实施计划 — fix-tdx-realtime-vwap-window-consistency

> 第 2 步产物（代码级）。范围：A（检查分类，mist-deploy）+ B（窗口一致性，mist）+
> C2b（TDX 事件驱动，mist-datasource）+ E（socket 持久连接直推，mist-datasource）。
> 前置：E-0 全链路吞吐实测（08-11 交易时段 shadow，设计 §E.4）。
> 状态：**待 owner 确认后落地**（第 3 步）。

---

## 0. 执行顺序与依赖

### 0.1 终端单文件约束（2026-08-10 owner 确认，待处理）

**TDX/QMT 终端策略环境只支持加载单个脚本文件**——`socket_sender.py` 不能作为独立文件部署。
待办（下次落地统一处理）：

- [ ] 将 `SocketSender` 类内联进 `mist_tdx_realtime_bridge.py` / `mist_qmt_realtime_bridge.py`
      （删除 `from socket_sender import SocketSender`，同文件类）；
- [ ] 调整 guardrail 测试 `test_socket_sender_scripts_stay_identical_across_bridges`：
      合并后两份主文件结构不同（provider 历史部分差异），bit-identical 断言不再适用——
      改为结构对齐约定（或删除该测试，一致性靠代码审查）；
- [ ] 部署/加载清单更新：每个终端只加载一个脚本文件。

```
B（mist，独立） ─┐
A（mist-deploy）─┤ 可并行，无依赖
                 ▼
E-0 全链路实测（08-11 shadow）← C2b 的观测帧先行（实测数据来源）
                 ▼
C2b（TDX 事件驱动）→ E（socket 直推，TDX/QMT）→ 部署（productization=shadow）→ 验收
```

仓库/分支：
- mist：`feat/fix-tdx-quantity-precision`（worktree 从 master）
- mist-datasource：`feat/fix-tdx-bridge-quantity`（worktree 从 master `146d661` 系）
- mist-deploy：workflow 文件改动直接走 master 推送（不涉及部署代码）

---

## 1. B — canonical 窗口一致性（mist 仓）

### 文件：`apps/mist/src/realtime/candle/open-candle-aggregator.ts`

**改动 1：快照级量额可用性门控（价格帧规则）**

`updateCandidate`（现 393-402 行）量额更新段改为：

```ts
// Price-only frame rule: when either cumulative quantity is absent, neither
// quantity window advances (v/a must always span the same frame set).
if (
  snapshot.cumulativeVolume === null ||
  snapshot.cumulativeAmount === null
) {
  this.quantityMissingFrameCount++;
} else {
  const volume = applyQuantityUpdate(
    readQuantity(state, 'volume'),
    snapshot.cumulativeVolume,
  );
  const amount = applyQuantityUpdate(
    readQuantity(state, 'amount'),
    snapshot.cumulativeAmount,
  );
  writeQuantity(state, 'volume', volume);
  writeQuantity(state, 'amount', amount);
  if (volume.counterReset || amount.counterReset) {
    state.validity = 'invalid';
    state.invalidReason = 'counter_reset';
    if (isPrior) this.rebaseCurrent(owner);
    return { kind: 'invalidated', reason: 'counter_reset', bucket: bucketOf(state) };
  }
}
```

`openCandidate`（现 315-326 行）同样门控：任一字段 null → 双字段按 null 初始化
（价格照常入桶，量额待下个双字段帧）。

**改动 1b（审计修正，必须）：null 分支的伪 0 语义**

现状 `initializeQuantity(current=null, preceding≠null)` 返回 `delta: '0'`
（`open-candle-aggregator.ts:573-579`）——"字段缺失"被推进成伪 0 量额，与价格帧语义矛盾
（首帧缺字段的桶会被封存为 v='0' 伪零桶）。修正为：

```ts
// current === null && preceding !== null
return {
  baseline: preceding,
  first: null,
  last: preceding,
  delta: null,          // was '0' — price-only frames must not fabricate zero quantity
  counterReset: false,
};
```

`rebaseQuantity` 的 `first === null` 分支（`:650-651`，内部调 initializeQuantity(null, …)）
随上述修正自动对齐——落地时用单测锁定两处行为。

**改动 2：缺字段帧计数 + 日志**

- 类新增 `private quantityMissingFrameCount = 0;`，并入 `diagnostics()` 返回
  （对齐现有 skipCounts 模式，Otel 观测可读）；
- 日志在 `realtime-market-data-product.service.ts` 的 snapshot 处理路径打（该处有
  pinoTraceMixin trace_id）：聚合前检查 `cumulativeVolume/Amount === null` →
  `logger.warn({ trace_id, securityId, source }, 'candle quantity_missing_frame')`，
  并记 `candle.quantityMissingFrameTotal` counter（O1 体系内，metrics 配日志）。

**改动 3：单测（`open-candle-aggregator.spec.ts` 追加，design §B.4 六用例）**

1. 正常帧流 sealed 记录与改动前字节级一致（回归基线——先跑旧代码存 fixture 值）；
2. 帧缺 Volume（Amount 齐全）→ 双字段都不推进，下一双字段帧恢复，窗口误差 = 0；
3. 帧缺 Amount（Volume 齐全）→ 同上；
4. 连续多帧缺量额 → 窗口保持，恢复后一次到位；
5. 桶边界帧缺字段 → 邻桶基线不受污染；
6. `quantityMissingFrameCount` 计数与日志断言；
7. **（审计补充）首帧缺字段 → 桶 v/a 为 null（不产生伪 0 桶）——锁定改动 1b 的 null 语义**；
8. **（审计补充）缺字段帧不触发 counter_reset 误判（价格帧跳过量额更新）**。

**验证命令**（含 mock 回放，按 owner 要求）：
```bash
# 1) 单测全量——现有用例必须全过（重点：spec:241-276 的 volume:'0' 是真实零增量，不受影响；
#    spec:278-291 无基线 null 用例不受影响；改动只影响"有基线+首帧缺字段"未覆盖场景）
npx jest apps/mist/src/realtime/candle/open-candle-aggregator.spec.ts --runInBand
# 2) mist 全基线
npm run lint:check && npm run typecheck && TZ=UTC npm run test:ci   # mist 基线（治理 §11）
# 3) 本地 mock-env 全链路回放（mist-datasource tools/mock-env）：
#    a. 正常帧流 sealed 记录字节级对比（改动前 vs 改动后）
#    b. 注入缺字段帧 → v/a 窗口一致性 + 无伪 0 桶
# 4) 08-11 shadow：生产分布对比（正常路径不变）
```

---

## 2. A — vwap 检查分类（mist-deploy 仓）

### 文件：`.github/workflows/read-windows-realtime-candle-closed.yml`（72-119 行 PowerShell 段）

**改动**：

1. 每桶取 `c`（close）、`cv`/`ca`（累计，判据 4 需要）；现只取 `v/a/l/h`；
2. 容差：`$tol = [math]::Max(0.006 * [double]$rec.c, 5 * ([double]$rec.h - [double]$rec.l))`；
3. 分类（出界时）：`$dev = if ($vwap -lt $l) { $l - $vwap } else { $vwap - $h }`；
   `$class = if ($dev -le $tol) { 'sampling_noise' } else { 'quantity_anomaly' }`；
4. 真异常判据 4 条（design §A.3）：
   - null v/a 但价格存在 → `quantity_anomaly`（skipped 不再单独归）；
   - `|dev| > tol` → `quantity_anomaly`；
   - 连续 ≥3 桶同方向出界 → `quantity_anomaly`（遍历排序后的桶序列）；
   - `cv/ca` 相对前桶不自洽（单调性破坏）→ `quantity_anomaly`；
5. 输出扩展：`vwapClassification: { samplingNoise, quantityAnomaly, skipped }`，
   每出界桶附 `classification` 字段（保持旧字段向后兼容）。

**验证命令**：
```bash
gh workflow run "Read Windows Realtime Candle Closed Hash" -f trading_day=20260810 -f source=tdx -f security_id=1
gh workflow run "Read Windows Realtime Candle Closed Hash" -f trading_day=20260810 -f source=tdx -f security_id=10
# 验收：36/10 桶全 sampling_noise、quantityAnomaly = 0
```

---

## 3. C2b — TDX 事件驱动（mist-datasource 仓）

### 文件：`tdx/builtin_bridge/mist_tdx_realtime_bridge.py`

**改动 1：事件信号**

- 全局 `DIRTY_EVENT = threading.Event()`；`on_quote_update` 里 `mark_dirty` 后
  `DIRTY_EVENT.set()`（回调内仍是锁内最小操作，不破 C0.1）；
- 新增 `SNAPSHOT_MIN_INTERVAL_SECONDS = 0.3`（防抖，环境变量可配）。

**改动 2：主循环拆双线程**

- **reconcile 线程**（现 1-3 步：poll / reconcile / result 上报）：保持 3s 周期
  （与行情无关，现有逻辑不动）；
- **行情线程**（新，替代现第 4 步的周期 dirty 处理）：
  ```python
  def _quote_loop():
      while True:
          DIRTY_EVENT.wait()          # 事件驱动，无兜底轮询（owner 拍板）
          DIRTY_EVENT.clear()
          time.sleep(SNAPSHOT_MIN_INTERVAL_SECONDS)   # 防抖
          dirty = dirty_queue.swap_and_clear()
          with SDK_LOCK:              # tqcenter 线程安全未知，串行化 SDK 调用
              for code in dirty & converged:
                  native = tq_wrapper.get_market_snapshot(code)
                  ...
                  _send_snapshot(code, native)   # E 前 HTTP，E 后 socket
  ```
- `SDK_LOCK = threading.Lock()`：reconcile 线程的 subscribe/unsubscribe/probe 与
  行情线程的 get_market_snapshot 共用（串行化 SDK 调用，E-0 实测验证必要性）。

**改动 3：观测帧（E-0 数据来源，先行落地）**

- 进程内累加：回调计数、get_market_snapshot 耗时（`time.monotonic` 均值）、
  POST/socket 失败计数、dirty 丢弃计数；
- 每 30s 组装观测帧 → `POST /tdx/bridge/observability`（新端点，datasource 侧接收后
  经 O2a 埋点转 OTel counter/gauge → OO）；
- 端点：`tdx/routes/bridge.py` 加 `post_observability` 路由（校验 owner/epoch，
  指标记录复用 `ds_metrics`）。

**验证命令**：
```bash
# mist-datasource 基线（治理 §11）
uv run pytest && ruff check . && pyright
# E-0（08-11 shadow）：OO 查询观测帧指标（回调频率/拉取耗时/失败计数）
```

---

## 4. E — socket 持久连接直推（mist-datasource 仓）

### 4.1 datasource TCP 接收端点

**新文件**：`src/datasource/realtime_tcp.py`（TDX/QMT 共用协议模块）：
```python
# 协议：[uint32 BE length][JSON]
# 帧类型: register / snapshot / observability / error
async def handle_connection(reader, writer, gateway, ws_manager, provider): ...
def frame_encode(payload: dict) -> bytes: ...   # struct.pack('>I', len) + json
def frame_decode(data: bytes) -> dict: ...
```
- 挂载：`tdx/main.py` lifespan（62-63 行）+ `qmt/main.py` lifespan（117-118 行）
  内 `asyncio.start_server`（tdx 端口 9003、qmt 端口 9004，环境变量可配）；
- **register 帧**：校验 leaseToken/streamEpoch（复用 gateway owner 逻辑）→ 连接绑定
  `(ownerId, generation, streamEpoch)`；失败发 error 帧 + 关连接；
- **snapshot 帧**：连接级身份免 token → 调用 gateway 现有 `post_snapshot` +
  `ws_manager.broadcast`（抽共享函数 `_publish_frame(gateway, ws_manager, ...)`，
  HTTP 路由 `tdx/routes/bridge.py:210` 与 TCP handler 共用）；
- **背压**：默认无队列（design §E.5 要点 3）；处理延迟/连接计数观测；
- **observability 帧**：→ `ds_metrics` 指标。

### 4.2 TDX bridge socket 发送器

**新文件**：`tdx/builtin_bridge/socket_sender.py`（stdlib：socket/struct/json）：
```python
class SocketSender:
    def connect(self, host, port, register_payload) -> None: ...   # 重试退避
    def send(self, frame: dict) -> None: ...        # 断连自动重连 + 重发 register
    def send_snapshot(self, symbol, captured_at, native) -> None: ...
    # 写满/失败 → dropped 计数（观测帧上报）；断连重连后重发最新（latest-state）
```
- `_send_snapshot` 从 urllib POST 切换为 `SocketSender`（C2b 改动 2 的同一调用点）；
- HTTP POST 代码保留（回滚开关，环境变量 `MIST_TDX_TRANSPORT=http|tcp`，默认 tcp）。

### 4.3 QMT bridge

**文件**：`qmt/builtin_bridge/mist_qmt_realtime_bridge.py`：
- 删除：`snapshot_queue`（4MB/16 条/5s 超龄/8 条-tick 全删）；
- 新增：`latest: dict[str, item]`（锁内单槽覆盖——回调 `_enqueue_callback_snapshot`
  改为覆盖写入）+ 事件通知；
- tick（`mist_qmt_realtime_bridge_tick`）内：取 latest 全部 → socket 发送（1s tick
  保留为发送节拍，QMT 运行时机制；threading 事件驱动为可选优化，HIL 验证 QMT 环境）；
- 合并/失败计数 → 观测帧（走 TCP observability 帧）。

### 4.4 HTTP 端点过渡

- TCP 上线后 HTTP `/snapshot` 端点保留一个交易日（回滚保险）→ 观察后退役
  （tasks 勾选 + 四仓 fixture/契约测试同步）。

---

## 5. 跨仓同步与验证基线

| 仓 | 改动 | 验证 |
|---|---|---|
| mist | B：aggregator + product service 日志/计数 | `npm run lint:check && typecheck && TZ=UTC npm run test:ci`；`openspec validate --all --strict` |
| mist-datasource | C2b + E：bridge ×2 + gateway TCP + 观测端点 | `uv run pytest && ruff check . && pyright`；新 TCP 协议单测（长度前缀/register 鉴权/错误帧/重连） |
| mist-deploy | A：workflow 分类逻辑 | 复跑 workflow（A4 验收） |
| monitoring | 连接/丢弃/处理延迟指标（O2a 体系内扩展） | 随 datasource 部署验证 |

**fixture sha256**：E 的 wire 帧内容不变（schema-v2 native map），fixture 不需改；
新增 TCP 协议测试的 fixture 单独管理。

## 6. 部署与验收

1. **部署顺序**：
   - B + A：无生产行为变化（B 正常路径字节级不变；A 是工具）——可先部署/推送；
   - E-0 实测（08-11 shadow，观测帧先行）；
   - C2b + E：datasource 容器 + bridge 脚本（**bridge 是终端侧手动加载**——
     TDX/QMT 策略脚本更新 + datasource 镜像同批部署，`productization=shadow` 必传）；
2. **验收**：
   - A4：复跑 vwap 检查 → 36/10 桶全 `sampling_noise`、`quantityAnomaly = 0`；
   - 生产复跑分布不变（B 不改正常路径数据）；
   - E-0 判定标准（各段 p95<100ms、驱逐=0、写失败=0）通过；
   - HIL：TDX/QMT 终端负载、帧数对比、断连重连。
