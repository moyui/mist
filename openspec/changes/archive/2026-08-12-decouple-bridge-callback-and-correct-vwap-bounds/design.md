# Design — decouple-bridge-callback-and-correct-vwap-bounds

## 1. 桥回调解耦（A）—— TDX + QMT

### 1.1 当前架构（方案 B，要替换）

```
SDK subscribe_hq 回调线程
  → on_quote_update(data_str)
    → code = parse(data_str)
    → native = tq_wrapper.get_market_snapshot(code)   ← SDK 调用在回调线程（重入风险）
    → _push_snapshot(sender, native)                   ← TCP send 在回调线程
```

回调线程（SDK 持有）内调用 SDK 方法 + TCP send——违反 C0.1 "callback ONLY marks dirty"。

### 1.2 新架构（发布-订阅队列）

```python
from collections import deque

# 模块级有界队列（有界防积压；积压时 deque 自动丢旧 = latest-state 语义）
DIRTY_QUEUE: deque[str] = deque(maxlen=DIRTY_QUEUE_MAXLEN)  # 默认 1000

# --- 回调（SDK 线程，thin） ---
def on_quote_update(data_str: str) -> None:
    try:
        code = _format_code(json.loads(data_str).get("Code"))
        if code:
            DIRTY_QUEUE.append(code)           # GIL 原子，thin；不调 SDK
            counters["callback_count"] += 1
    except Exception:
        pass  # never raise in callback

# --- 主线程消费（替换当前主循环的 poll-only 段） ---
while True:
    # 1. 队列优先：有行情信号就 fetch + send（事件驱动，接近实时）
    drained = False
    while DIRTY_QUEUE:
        code = DIRTY_QUEUE.popleft()
        native = tq_wrapper.get_market_snapshot(code)  # SDK 调用在主线程
        if native is None:
            counters["fetch_none"] += 1
            continue
        counters["fetch_count"] += 1
        captured_at = _now_iso()
        _push_snapshot(owner, sender, counters, code, captured_at, native)
        drained = True

    # 2. 队列空了 → poll datasource（订阅同步 / reconcile）
    #    drained=True 时缩短等待（刚处理完，可能马上有新信号）
    poll_resp = _post_json(BRIDGE_ENDPOINT + "/poll", {**owner.request_identity(), ...})
    ...  # 现有 reconcile 逻辑不变
```

### 1.3 设计决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 队列类型 | `deque(maxlen=N)` | 有界（防积压 OOM）；`append`/`popleft` 线程安全（GIL）；stdlib |
| 合并 vs 逐消费 | **逐消费**（不合并） | 每个 tick 信号都触发 fetch → 采样最密；合并会降低采样密度 |
| 溢出策略 | deque maxlen 自动丢旧 | latest-state 语义（旧价格被新价格覆盖是可接受的）；vwap 修正兜底 |
| maxlen 值 | 1000（可配） | 100 只标的 × 10 次/s × 1s 缓冲 = 1000；正常消费速度远快于积压 |
| 主循环结构 | 队列优先 + poll 兜底 | 行情实时性（队列事件驱动）+ 订阅同步（poll）两不误 |
| threading | **不新增** Thread | 主线程消费；回调是 SDK 已有线程；guardrail 禁 `threading.Thread` |

### 1.4 重入消除证明

- 回调线程：`DIRTY_QUEUE.append(code)`——GIL 原子操作，**不调任何 SDK 方法** → 无重入
- 主线程：`get_market_snapshot` / `send`——**顺序执行**（单线程）→ 无并发 → 无重入
- 队列线程安全：`deque.append` / `deque.popleft` 在 CPython 下 GIL 保护 → 无锁安全

### 1.5 实时性分析

- 回调 → append → 主线程 popleft + fetch + send
- 延迟 = `popleft` 唤醒（µs）+ `get_market_snapshot`（SDK 调用 ~1-5ms）+ `send`（TCP ~0.1ms）
- **总延迟 ~1-5ms**（fetch 耗时主导）——接近方案 B（回调直调），远优于 3s 轮询
- 主线程 poll 段（订阅同步）不阻塞消费——poll 间隙（~3s）内队列正常积累 + 消费

### 1.6 guardrail 兼容

- `test_terminal_bridge.py` / `test_bigqmt_bridge_guardrails.py`：
  - 禁 `threading.Thread`：✅ 本方案不开新线程
  - 禁 SDK 调用在回调：**新增强 guardrail**——`assert "get_market_snapshot" not in callback body`
  - socket_sender bit-identical：✅ 不变

### 1.7 TDX / QMT 函数对齐（延续 77e5cf7 / 52a2848 / 7cb8630 对齐基线）

本次新增的队列相关符号在两桥间保持命名/结构对齐（延续既有 `_push_snapshot` /
`_make_subscription_callback` / `_register_owner` / `_compute_artifact_sha256` 对齐）：

| 对齐符号 | TDX | QMT |
|---|---|---|
| 队列变量 | `BRIDGE_QUEUE: deque[str]`（code） | `BRIDGE_QUEUE: deque[dict]`（payload） |
| 回调入队 | `_make_subscription_callback` 内 `BRIDGE_QUEUE.append(code)` | `_make_subscription_callback` 内 `BRIDGE_QUEUE.append(payload)` |
| 主线程消费 | `_drain_bridge_queue(sender, owner, counters)` → fetch + `_push_snapshot` | `_drain_bridge_queue(sender, counters)` → `_push_snapshot`（数据已在 payload） |
| 回调 thin 断言 | guardrail：回调内不含 `get_market_snapshot`/`_push_snapshot` | guardrail：回调内不含 `_push_snapshot`/`sender.send` |

**统一队列名 `BRIDGE_QUEUE`**（取代 design §1.2 的 `DIRTY_QUEUE` 和 §2.0 的
`SNAPSHOT_QUEUE`）——单文件内单一队列，两桥命名一致；元素类型不同（TDX str / QMT dict）
由消费函数签名区分。

## 2. vwap 反向修正（B）

### 2.0 QMT 桥队列化（与 TDX 的差异）

QMT 桥当前（`99d2eab` 方案 B）：回调（`_make_subscription_callback`）里直接
`_prepare_callback_native`（bounded_copy，内存操作）+ `_push_snapshot`（`sender.send`）。
回调不调 SDK（数据在参数），但 **socket send 在 SDK 回调线程**（IO 阻塞回调分发）+
**SocketSender 回调/tick 双线程竞态**（回调 send + tick reconnect）。

队列化：

```python
# QMT 模块级有界队列（放完整 payload，不是 Code）
SNAPSHOT_QUEUE: deque = deque(maxlen=SNAPSHOT_QUEUE_MAXLEN)

# 回调（SDK 线程，thin）—— 与 TDX 对称，但 payload 内容不同
def callback(native_value: Any) -> None:
    accepted = _prepare_callback_native(native_value)   # bounded_copy（内存，不调 SDK）
    if accepted is not None:
        payload = {
            "subscriptionId": holder.get("subscriptionId"),
            "capturedAt": datetime.datetime.now().astimezone().isoformat(),
            "native": accepted,
        }
        SNAPSHOT_QUEUE.append(payload)   # thin：不 send，只 put；立即返回
        STATE.callback_count += 1

# 主线程（tick 或独立循环）消费
while SNAPSHOT_QUEUE:
    payload = SNAPSHOT_QUEUE.popleft()
    _push_snapshot_from_payload(payload)   # sender.send 在主线程（单线程，无竞态）
```

**TDX vs QMT 队列差异**：

| | TDX | QMT |
|---|---|---|
| 队列元素 | `code`（str，信号） | `payload`（dict，完整帧） |
| 主线程消费后 | fetch `get_market_snapshot(code)` + send | **直接 send**（数据已在 payload） |
| 不丢中间状态 | 有限（fetch 拿当前快照，非回调时刻） | **完整保留**（每个 tick 的真实数据都在 payload） |

**QMT 队列的额外价值**：QMT 回调带完整数据 → 队列里每个元素都是真实 tick → 逐消费 = 每个
tick 都发 → **不丢任何中间价格变化**（TDX 队列只能保留 Code 信号，fetch 拿当前快照；QMT
队列保留的是历史 tick 本身）。

### 2.1 修正位置

`open-candle-aggregator.ts` 的 seal 路径——aggregator 输出 `SealedCandle` 之前（L605-606
`high: state.high, low: state.low` 之前）。

### 2.2 修正逻辑

```ts
// 在 toSealedCandle() 或 seal 输出处
private seal(state: OpenCandleState): SealedCandle {
  let { high, low, volume, amount, ...rest } = state;

  // vwap bound correction: the sealed high/low are sampled-band extrema
  // (last-price min/max); the authoritative VWAP (amount/volume) may fall
  // outside when intrabucket price spikes land between samples. Clamp the
  // band to include VWAP so the sealed candle is self-consistent.
  if (volume > 0 && amount > 0) {
    const vwap = amount / volume;
    high = Math.max(high, vwap);
    low = Math.min(low, vwap);
  }

  return { high, low, volume, amount, ...rest };
}
```

### 2.3 修正条件

- `volume > 0 && amount > 0`：只在双字段有效时修正（缺字段桶 v/a=null 不修正——已经分类
  为 missing_quantity_with_prices）
- vwap = amount/volume（Decimal8 精确运算的浮点投影——用于范围比较足够）

### 2.4 不修正的情况

- `volume == 0 || amount == 0`：无效量额（不修正——vwap 无意义）
- 量额缺失（price-only 帧）：v/a=null——不修正（B 修复已处理 null 语义）

### 2.5 high/low 语义变更

| | 修正前 | 修正后 |
|---|---|---|
| 含义 | 采样带 last-price 极值 | 采样带极值 ∪ {vwap} |
| 可靠性 | 可能漏瞬变尖峰 | 至少包含真实成交均价 |
| 自洽性 | vwap 可能出界 | **vwap 一定在 [low, high] 内** |

**对下游策略的影响**：策略看到的 high/low 不再是"采样观测极值"，而是"保证包含 vwap
的范围"。波动率/突破检测等依赖 high/low 精确极值的策略需要知晓这一语义——但修正后
的值**比采样带更可靠**（vwap 是真实成交数据）。

### 2.6 与 fix-tdx-vwap 的关系

fix-tdx-vwap（`61f5e88`）在**检查侧**分类出界（sampling_noise / quantity_anomaly）——
是离线工具，不改 sealed 数据。本 change 在**实时聚合侧**修正——sealed 数据自洽。
两者互补：
- fix-tdx-vwap 检查侧：**离线分类**（不改数据，标记出界类型）
- 本 change 聚合侧：**实时修正**（sealed 数据自洽，vwap 不出界）

## 3. 影响链（governance §1）

```
producer（桥回调 → queue.put）           ← A：回调 thin
  → wire（TCP snapshot 帧，不变）
  → decoder（datasource converter，不变）
  → state/persistence（backend aggregator seal + vwap 修正）  ← B：sealed 自洽
  → consumer（策略，看到自洽 candle）     ← vwap 不再出界 → 准入不再阻塞
  → deploy（桥脚本更新，update-windows-tdx-bridge-script workflow）
```

## 4. governance §5 停下来讨论项

- **high/low 语义变更**（"provider 字段含义"）：本 design §2.5 已详述——修正前/后含义、
  对下游影响、信任方向。需 owner 确认接受"high/low = 至少包含 vwap 的范围"语义。
- 不涉及：数据库字段改名/改类型、wire contract 变更、新 provider/市场。

## 5. 验证

- 单测（datasource）：回调 thin（不调 SDK）+ queue put/get + maxlen 溢出
- 单测（mist）：vwap 修正逻辑（vwap>high / vwap<low / vwap 在范围内 / 量额缺失不修正）
- 生产 HIL：vwap 检查复跑——出界率应大幅下降（修正后理论为 0）
- 生产 HIL：观测帧 callback/fetch/send 计数 + droppedFrames（队列溢出）
