# Proposal — decouple-bridge-callback-and-correct-vwap-bounds

## Why

2026-08-11 生产实测暴露两个独立但叠加的生产问题：

1. **桥回调重入风险（架构）**：方案 B（`99d2eab`）在 `subscribe_hq` 回调内直接调用
   `get_market_snapshot` + `send`。TDX 官方文档（`tdxquant-live-datasource-smoke.md:245`）
   与桥 C0.1 frozen 不变量（`mist_tdx_realtime_bridge.py:8-10`）均要求 "keep the callback
   thin"——回调内不调 SDK。SDK 内部线程/锁模型不透明（C 扩展，GIL 管不到），重入风险
   无法从外部排除。低频（2 只标的）今天未暴露，高频（上限 100 只）不可预测。

2. **vwap 出界 / 策略准入失败（数据质量）**：sealed candle 的 `high/low` 是 aggregator 从
   `last-price` 序列取 min/max（`open-candle-aggregator.ts:442-443`），本质是**采样带**。
   SDK 回调只给 `{Code, ErrorId}`（不含价格），fetch 拿到的是"处理时刻"快照——瞬变价格
   尖峰落在采样间隙时，正确的 vwap 也会落在 `[low, high]` 之外（fix-tdx-vwap evidence
   M1：3s 采样下 16.9% 出界，偏差 ≤0.55%）。无论 fetch 频率多高都无法消除（尖峰可在
   任意间隙发生）。出界导致下游策略准入失败。

## What

两个改动，各自解决一个问题，组合后三层覆盖：

### A. 桥回调解耦（datasource 仓，TDX + QMT 桥）

**TDX 桥**（`mist_tdx_realtime_bridge.py`）：回调（SDK 线程）只 `queue.append(code)`——
**thin，不调 SDK**；主线程消费：`queue.popleft() → get_market_snapshot → send`。
SDK 调用全部在主线程，重入消除。

**QMT 桥**（`mist_qmt_realtime_bridge.py`）：回调（SDK 线程）只 `queue.append(payload)`——
**thin，不 send**；主线程消费：`queue.popleft() → send`。QMT 回调不调 SDK（数据在参数），
但当前回调内直接 socket send（IO 在 SDK 回调线程 + SocketSender 回调/tick 双线程竞态）——
队列化后回调立即返回 + send 单线程无竞态。

```
TDX:                              QMT:
SDK 回调 → queue.append(code)     SDK 回调 → queue.append(payload)  ← thin
主线程 → fetch + send             主线程 → send（数据已在 payload）
```

- 事件驱动（不等轮询周期），延迟 ≈ fetch 耗时（ms 级）——接近实时
- 有界 `deque(maxlen=N)`：积压时丢旧信号（latest-state 语义）
- 无 `threading.Thread`（guardrail 兼容；主线程消费，回调是 SDK 的线程）
- **不改变 wire contract**（TCP snapshot 帧格式不变）

### B. vwap 反向修正（mist 仓，`open-candle-aggregator.ts` seal 路径）

sealed 时，用 vwap（`amount / volume`——交易所真实成交数据，精确 Decimal8）兜底
`high/low`：

```ts
// seal 输出 SealedCandle 前
const vwap = volume > 0 ? amount / volume : null;
if (vwap !== null) {
  high = Math.max(high, vwap);
  low = Math.min(low, vwap);
}
```

修正后 **vwap 一定在 `[low, high]` 内** → sealed 数据自洽 → 策略准入不再阻塞。
精度上：修正后的 high/low 不是真实极值（vwap 是均价），但**比采样带更接近真实**
（vwap 证明价格确实到了那里），且自洽。

### high/low 语义变更（governance §5 "provider 字段含义"）

- **修正前**：`high/low` = 采样带的 last-price 极值（可能漏瞬变尖峰）
- **修正后**：`high/low` = 至少包含 vwap 的范围（采样带极值 ∪ vwap）

信任方向：**vwap（真实成交）> high/low（采样带）**——用最可信的约束不可靠的。

## Scope

| 仓 | 改动 |
|---|---|
| mist-datasource | `mist_tdx_realtime_bridge.py`：回调 thin + queue(code) + 主线程 fetch+send |
| mist-datasource | `mist_qmt_realtime_bridge.py`：回调 thin + queue(payload) + 主线程 send（替换回调直发） |
| mist | `open-candle-aggregator.ts`：seal 路径加 vwap 反向修正（统一覆盖 TDX/QMT）；单测 |
| mist-deploy | bridge 脚本更新走 `update-windows-tdx-bridge-script` workflow（需扩展支持 QMT 路径）；无 compose 变化 |

## Out of scope

- vwap 修正的精度提升（真实极值恢复——需要 SDK 提供 tick 级数据，不在本 change 范围）
- 桥 buildId bump（v3.0 改进项，下次部署）
