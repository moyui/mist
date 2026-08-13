## Why

段（Duan）已就绪（`add-chan-duan-segment` 已合 master 并经真实数据验证）。缠论依赖链
`笔 → 段 → 段级中枢 → 背驰 → 买卖点` 中，**段级中枢**是"高级别分析"的下一步——以段为构成单元的
中枢，几何定义与笔级中枢同构（zg/zd/gg/dd、5 单元滑窗、延伸、重合合并）。

`ChannelLevel.Duan` 枚举至今是**死值**（`add-chan-duan-segment` 明确不接线）。本 change **接线它**：
段级中枢输出 `level = ChannelLevel.Duan`，缠论能力从"笔级中枢"升级为"笔级 + 段级中枢"双级别。

## What Changes

- `ChanCore` 新增 `createDuanChannels(duans)`：**入参 = `createDuan` 的返回值 `ChanDuan[]`**
  （组合方式 `createDuanChannels(createDuan(createBi(k).phaseB))`，与 `createDuan` 收 `createBi` 返回值的 `phaseB`（ChanBi[]）的模式一致）。
- 段级中枢算法与笔级中枢**结构同构**：Phase A 3 段滑窗枚举 + Phase B 延伸（±2 段）+ 重合合并；
  **复用 `mergeSpans`** 不动点驱动器。**几何为对称重叠（无方向）**——`zg = min(段高点)`、
  `zd = max(段低点)`、`gg/dd` 极值，无首末段突破约束（缠论原典：中枢 = "至少三个连续次级别走势
  类型所重叠的部分"，是区域，方向属于趋势而非中枢）。
- 输出 = **独立 `ChanDuanChannel`**（`duans/zg/zd/gg/dd/level=Duan/type/status/startId/endId/
  displayStartId/displayEndId`，**无 `trend` 字段**），**零破坏**现有 `/v1/chan/channel` 的 `bis` 递归契约。
- **接线 `ChannelLevel.Duan`**：段级中枢 `level=duan`（放松 `add-chan-duan-segment` 的 "stays unwired" 约束）。
- 实现路径（design 决策点）：**独立 `DuanChannelCalculator`**（对称几何与笔级方向性几何不同，
  泛化收益低；笔级零风险、无需 differential）。
- 新增 HTTP 端点 `POST /v1/chan/duan-channel`，递归遵守 `high/low` 契约。
- **不做**：背驰、买卖点、持久化、数据库 migration、改现有算法输出。
- `algorithmVersion` 保持 1（纯增量）。

## Capabilities

### New Capabilities

- `chan-duan-channel`：定义段级中枢算法（与笔级中枢同构的两阶段）与 `ChanDuanChannel` 输出契约。

### Modified Capabilities

- `chan-analysis-core`：facade 增加 `createDuanChannels`；**接线 `ChannelLevel.Duan`**（放宽
  "Duan 级不得启用新算法"与 "Duan-level Channel enum stays unwired" 约束）。
- `chan-analysis-http-contract`：`/v1/chan/duan-channel` 纳入 `high/low` 递归契约。
- `chan-duan-segment`：段级中枢从"延后/死枚举"改为"由本 change 接线"。

## Impact

- **`mist`**：`libs/chancore` 段级中枢算法（泛化 `ChannelCalculator` 或新增 `duan-channel.ts`）、
  `ChanDuanChannel` 类型、barrel 导出、pure 单测；`apps/mist/src/chan` 新端点 + VO/mapper + OpenAPI。
- **Backtest/Realtime/Signal/Alert**：不受影响（不依赖 `chan.*`）。
- **现有算法**：段级中枢是纯增量；若泛化 `ChannelCalculator`，以 full-output differential 证明
  笔级中枢 byte-identical（否则回退独立 calculator）。
- **数据库 / 部署**：无 migration、无部署拓扑变化。
- **后续依赖**：背驰（笔/段复用）、买卖点（依赖段+中枢+背驰）各自独立 change。
