# 实施计划 — decouple-bridge-callback-and-correct-vwap-bounds

> 第 2 步产物（代码级）。三仓改动：mist-datasource（TDX+QMT 桥 + guardrail）、
> mist（aggregator vwap 修正）、mist-deploy（workflow 扩展）。
> 前置：spec 已确认（1845fa9）。

---

## 1. mist-datasource — TDX 桥（`tdx/builtin_bridge/mist_tdx_realtime_bridge.py`）

### 1.1 buildId bump（L70）

```python
# L70 当前
BRIDGE_BUILD_ID = "mist-tdx-realtime-bridge-v2.1"
# 改为
BRIDGE_BUILD_ID = "mist-tdx-realtime-bridge-v3.0"
```

### 1.2 新增模块级队列（imports 段 + 模块级常量段）

```python
# 顶部 imports 加（L34 附近，已有 import 结构）
from collections import deque

# 模块级常量段（L65 附近，MIST_TDX_TCP_PORT 之后）
BRIDGE_QUEUE: deque[str] = deque(maxlen=1000)  # thin callback → main-thread drain
```

### 1.3 重写 `_make_subscription_callback`（L404-428）—— 回调 thin

```python
def _make_subscription_callback(tq_wrapper: TqCenterWrapper, counters: dict):
    """Subscribe callback: append the changed code to BRIDGE_QUEUE (thin).

    No SDK calls, no send — the main loop drains the queue and owns
    get_market_snapshot + _push_snapshot (C0.1 reentry-safe invariant).
    """

    def on_quote_update(data_str: str) -> None:
        try:
            data = json.loads(data_str)
            code = data.get("Code")
            if code:
                code = _format_code(code)
                BRIDGE_QUEUE.append(code)  # GIL-atomic; thin
                counters["callback_count"] += 1
        except Exception:
            pass  # Never raise in callback.

    return on_quote_update
```

**关键变化**：签名去掉 `owner`/`sender`（回调不再直接用）；删除回调内的
`get_quote` + `_push_snapshot` 调用。

### 1.4 新增 `_drain_bridge_queue`（放在 `_make_subscription_callback` 之后）

```python
def _drain_bridge_queue(
    tq_wrapper: TqCenterWrapper, owner: BridgeOwner, sender, counters: dict
) -> int:
    """Main-thread: drain BRIDGE_QUEUE → fetch + push. Returns drained count."""
    drained = 0
    while BRIDGE_QUEUE:
        code = BRIDGE_QUEUE.popleft()
        native = tq_wrapper.get_quote(code)
        if native is None:
            counters["fetch_none"] += 1
            continue
        counters["fetch_count"] += 1
        captured_at = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime())
        captured_at += _tz_offset_suffix()
        _push_snapshot(owner, sender, counters, code, captured_at, native)
        drained += 1
    return drained
```

### 1.5 主循环改造（`run_bridge` L515+）

```python
# L512: quote_callback = _make_subscription_callback(tq_wrapper, owner, sender, counters)
# 改为（回调不再需要 sender/owner）
quote_callback = _make_subscription_callback(tq_wrapper, counters)

# L515 while True 循环内，现有段：
#   0. Reconnect TCP
#   1. Poll desired state
# 改为：
#   0. Reconnect TCP（保留 register_frame 刷新 e686b25）
#   0.5 NEW: drain queue（队列优先，事件驱动）
if MIST_TDX_TRANSPORT == "tcp":
    register_frame = _make_register_frame(owner)
    sender.reconnect_if_needed(register_frame)
    _drain_bridge_queue(tq_wrapper, owner, sender, counters)  # ← 新增
    ...  # observability（现有）
#   1. Poll desired state（现有 poll 逻辑不变）
```

---

## 2. mist-datasource — QMT 桥（`qmt/builtin_bridge/mist_qmt_realtime_bridge.py`）

### 2.1 buildId bump（L114）

```python
# L114 当前
BRIDGE_BUILD_ID = "mist-qmt-realtime-bridge-v2.0"
# 改为
BRIDGE_BUILD_ID = "mist-qmt-realtime-bridge-v3.0"
```

### 2.2 新增模块级队列

```python
# imports 段加
from collections import deque

# 模块级（L115 附近）
BRIDGE_QUEUE: deque = deque(maxlen=1000)  # thin callback → main-thread drain
```

### 2.3 重写 `_make_subscription_callback`（L500-515）—— 回调 thin

```python
def _make_subscription_callback(holder: Dict[str, Any]) -> Any:
    def callback(native_value: Any) -> None:
        try:
            if not holder.get("active", False):
                return
            subscription_id = holder.get("subscriptionId")
            if type(subscription_id) is not int:
                return
            accepted = _prepare_callback_native(native_value)
            if accepted is not None:
                payload = {
                    "subscriptionId": subscription_id,
                    "capturedAt": datetime.datetime.now().astimezone().isoformat(),
                    "native": accepted,
                }
                BRIDGE_QUEUE.append(payload)  # thin: no send
                STATE.callback_count += 1
        except Exception as exc:
            _bounded_diagnostic("callback_error", str(exc))

    return callback
```

**关键变化**：回调不再调 `_push_snapshot`/`sender.send`——只 bounded_copy + append。

### 2.4 新增 `_drain_bridge_queue`

```python
def _drain_bridge_queue() -> int:
    """Main-thread: drain BRIDGE_QUEUE → push. Returns drained count."""
    drained = 0
    while BRIDGE_QUEUE:
        payload = BRIDGE_QUEUE.popleft()
        _push_snapshot(
            payload["subscriptionId"],
            payload["capturedAt"],
            payload["native"],
        )
        drained += 1
    return drained
```

### 2.5 tick 改造（`mist_qmt_realtime_bridge_tick` L276+）

```python
def mist_qmt_realtime_bridge_tick(ContextInfo: BridgeContextInfo) -> None:
    # ... 现有 init 检查 ...
    if STATE.sender is not None and STATE.register_frame is not None:
        STATE.register_frame = _make_register_frame()  # ← 刷新（对齐 TDX e686b25）
        STATE.sender.reconnect_if_needed(STATE.register_frame)
        _drain_bridge_queue()  # ← 新增：队列优先消费
        # observability（现有，条件触发）
        ...
```

---

## 3. mist-datasource — guardrail 测试（`tests/unit/test_terminal_bridge.py`）

### 3.1 TDX 回调 thin 断言

```python
def test_tdx_callback_is_thin() -> None:
    """TDX subscribe callback must not call SDK methods or send."""
    source = Path(...).read_text(encoding="utf-8")
    # 提取 _make_subscription_callback 函数体
    callback_body = _extract_function(source, "_make_subscription_callback")
    assert "get_market_snapshot" not in callback_body
    assert "get_quote" not in callback_body
    assert "_push_snapshot" not in callback_body
    assert "BRIDGE_QUEUE.append" in callback_body
```

### 3.2 QMT 回调 thin 断言

```python
def test_qmt_callback_is_thin() -> None:
    """QMT subscribe callback must not call send."""
    source = Path(...).read_text(encoding="utf-8")
    callback_body = _extract_function(source, "_make_subscription_callback")
    assert "_push_snapshot" not in callback_body
    assert "sender.send" not in callback_body
    assert ".send(" not in callback_body
    assert "BRIDGE_QUEUE.append" in callback_body
```

### 3.3 函数对齐断言

```python
def test_bridge_queue_alignment() -> None:
    """Both bridges use BRIDGE_QUEUE and _drain_bridge_queue."""
    for path in [TDX_BRIDGE_PATH, QMT_BRIDGE_PATH]:
        source = path.read_text(encoding="utf-8")
        assert "BRIDGE_QUEUE" in source
        assert "_drain_bridge_queue" in source
```

### 3.4 队列溢出单测

```python
def test_bridge_queue_maxlen_drops_oldest() -> None:
    from collections import deque
    q = deque(maxlen=3)
    for i in range(5):
        q.append(i)
    assert list(q) == [2, 3, 4]  # oldest dropped
```

---

## 4. mist — vwap 反向修正（`apps/mist/src/realtime/candle/open-candle-aggregator.ts`）

### 4.1 `toSealed` 函数改造（L595-625）

```ts
function toSealed(state: OpenCandleState): SealedCandle {
  let high = state.high;
  let low = state.low;

  // VWAP bound correction: sealed high/low are sampled-band extrema; the
  // authoritative VWAP (amount/volume) may fall outside when intrabucket
  // price spikes land between samples. Clamp the band to include VWAP.
  if (state.volumeDelta && state.amountDelta) {
    const volume = Number(state.volumeDelta);
    const amount = Number(state.amountDelta);
    if (volume > 0 && amount > 0) {
      const vwap = amount / volume;
      high = Math.max(high, vwap);
      low = Math.min(low, vwap);
    }
  }

  return {
    tradingDay: state.tradingDay,
    source: state.source,
    providerSymbol: state.providerSymbol,
    securityId: state.securityId,
    session: state.session,
    bucketStartMs: state.bucketStartMs,
    bucketEndMs: state.bucketEndMs,
    open: state.open,
    high,   // ← 修正后
    low,    // ← 修正后
    close: state.close,
    volume: state.volumeDelta,
    amount: state.amountDelta,
    // ... 其余字段不变
  };
}
```

### 4.2 单测（`open-candle-aggregator.spec.ts`）—— 4 用例

```ts
describe('toSealed VWAP bound correction', () => {
  function makeState(overrides: Partial<OpenCandleState>): OpenCandleState {
    return { /* 基线 state: high=1355, low=1350, volumeDelta='10000', amountDelta='13525000' */ };
  }

  it('corrects high when VWAP exceeds sampled high', () => {
    const state = makeState({ high: 1355, low: 1350, volumeDelta: '10000', amountDelta: '13560000' });
    const sealed = toSealed(state);
    expect(sealed.high).toBe(1356);     // vwap=1356 > high=1355
    expect(sealed.low).toBe(1350);
  });

  it('corrects low when VWAP below sampled low', () => {
    const state = makeState({ high: 1355, low: 1350, volumeDelta: '10000', amountDelta: '13494000' });
    const sealed = toSealed(state);
    expect(sealed.low).toBe(1349.4);    // vwap=1349.4 < low=1350
    expect(sealed.high).toBe(1355);
  });

  it('does not modify when VWAP within band', () => {
    const state = makeState({ high: 1355, low: 1350, volumeDelta: '10000', amountDelta: '13525000' });
    const sealed = toSealed(state);
    expect(sealed.high).toBe(1355);     // vwap=1352.5 within [1350,1355]
    expect(sealed.low).toBe(1350);
  });

  it('does not correct when quantity is zero or null', () => {
    const state = makeState({ volumeDelta: null, amountDelta: null });
    const sealed = toSealed(state);
    expect(sealed.high).toBe(1355);     // unchanged
    expect(sealed.low).toBe(1350);
  });
});
```

---

## 5. mist-deploy — workflow 扩展

### 5.1 `update-windows-tdx-bridge-script.yml` → 扩展为支持 QMT

新增 `source` 输入（tdx|qmt），根据 source 选 datasource 源文件路径 + 终端目标路径：

```yaml
inputs:
  source:
    description: Bridge source (tdx or qmt)
    required: true
    default: tdx
    type: choice
    options: [tdx, qmt]
  datasource_ref: ...  # 现有
  verify_sha: ...      # 现有
```

run 步骤根据 source 选路径：
- tdx: `tdx/builtin_bridge/mist_tdx_realtime_bridge.py` → `F:\quant\tdx\PYPlugins\user\`
- qmt: `qmt/builtin_bridge/mist_qmt_realtime_bridge.py` → `F:\quant\qmt\python\`

**注意**：QMT 终端脚本是加密/GBK 场景——SHA 校验可能不匹配（已知）；复制仍有效（字节复制）。

---

## 6. 验证命令

```bash
# mist-datasource（TDX+QMT 桥 + guardrail）
cd mist-datasource
uv run ruff check tdx/builtin_bridge/ qmt/builtin_bridge/ tests/unit/test_terminal_bridge.py
uv run pytest tests/unit/test_terminal_bridge.py -v
uv run pytest  # 全量（非 live）

# mist（aggregator vwap 修正）
cd mist
npm run lint:check && npm run typecheck
npx jest apps/mist/src/realtime/candle/open-candle-aggregator.spec.ts --runInBand
TZ=UTC npm run test:ci

# mist-deploy（workflow 扩展）
cd mist-deploy
pwsh-preview -NoProfile -File scripts/test-workflow-config.ps1

# openspec
cd mist && openspec validate decouple-bridge-callback-and-correct-vwap-bounds --strict
```

## 7. 部署序列（落地后）

1. datasource 镜像构建（push 触发 CI）→ 新 tag
2. 部署 datasource 新 tag（productization=shadow + lifecycle 部署后补设 on）
3. 桥脚本更新（`update-windows-bridge-script` workflow × 2：TDX + QMT）
4. 用户重启 TDX/QMT 终端
5. 生产 HIL：观测帧 + vwap 检查复跑
