# Spec Delta: market-data-pipeline（精度与补齐统一平台）

## ADDED Requirements

### Requirement: Market Data Pipeline Shall Unify Precision Gate Then Imputation For History And Realtime

统一行情管线平台 SHALL 对历史（MySQL `k`）与实时（Redis `candle` / Realtime Snapshot）共用同一份 `先单根精度门控 → 再 StrategySeriesImputer 补齐` 原子化管线，不得分散为各 controller / adapter 自行 `KPriceProjector` / `Decimal8` / `StrategySeriesImputer` 调用。

#### Scenario: 历史与实时共用同一管线

- **WHEN** 调用方为回测 `BacktestMarketDataAdapter`、实盘 `SharedStrategyWindowStore.prepare`、或展示 `VisualController` / `IndicatorController`
- **THEN** 必须经同一平台 `MarketDataPipeline` 进入
- **AND** 实时与历史的 `KPriceProjector` / `Decimal8.parseCanonical` 精度门控与 `imputeSeries` / `hydrate + append` 补齐逻辑必须同码

#### Scenario: 先精度后补齐的次序不可打散

- **WHEN** 平台处理一批 `rawBars`
- **THEN** 必须先对每根 `open/high/low/close/volume/amount` 做单根精度门控（`KPriceProjector(DECIMAL 20,2)` / `Decimal8.parseCanonical(36,8)` / `normalizeExternalDecimalText`），非法该 bar/字段 `fail closed` 并计 `dropped`，不得将其作为补齐锚点
- **AND** 再以合法锚点经 `StrategySeriesImputer`（`isOhlcAnchor` / `isQuantityAnchor` 含精度校验、`nearestAnchor` 复制为 `backfilled` / `forwardFilled`、`unavailable` 不虚构、跨日不补、`hydrate` 后冻结、`append` 仅 `forwardFill`）生成 `effective` 视图
- **AND** 调用方不得绕过平台自行先补齐后判精度

#### Scenario: 展示侧复用同一管线且同序列同窗

- **WHEN** `IndicatorController.k` 或 `VisualController.getCommands` 提供 `KVo` / `ChanK` 给前端或 `ChanCore`
- **THEN** 必须复用平台的 `requestedKlines / droppedKlines / effectiveKlines` 与 `resolutionCounts` 可观测字段，且两端点同窗口的 `effective` 长度必须一致
- **AND** 视觉侧 `visualReplayStartFor` 必须镜像回测 `BacktestRunExecutor.replayStartFor`（`period < 1440 → Asia/Shanghai 当日 01:30Z`，`period >= 1440 → startDate`），历史加载 `timestamp < visualReplayStart order DESC take requiredBars reverse mapKToStrategyBar` 后与窗口一起喂平台

### Requirement: Market Data Pipeline Shall Be The Single Source Of Truth For Dispersed Implementations

平台 SHALL 收敛当前分散在各处的 `KPriceProjector` / `Decimal8` 精度与 `StrategySeriesImputer` 补齐调用，成为唯一真源。

#### Scenario: 分散收口

- **WHEN** 存在以下任一散点：`apps/mist/src/visual/visual.controller.ts:projectToChanK` 独立 `KPriceProjector catch→null`、`apps/mist/src/indicator/indicator.controller.ts:k()` 直接 `Number()` 透传、`libs/shared-data/src/mappers/k-strategy-bar.mapper.ts` 被绕过、`apps/backtest/src/backtest-run.executor.ts` 与 `libs/signal/src/runtime/shared-strategy-window.store.ts` 各自独立 `hydrate / append`、`libs/strategy/src/market-data/k-price-projector.ts` 未被展示侧复用
- **THEN** 必须收敛到平台唯一调用，删除或收口重复实现
- **AND** 平台 SHALL 输出 `requested / dropped / effective` 可观测，且未命中索引 `getKIndex` 必须 `null` 丢弃该 command，不回退到 `0`

### Requirement: Dynamic Series Imputation Semantics SHALL Be Preserved And Reused

The system SHALL preserve the existing imputation semantics and SHALL only converge call sites to the unified platform.

#### Scenario: 语义保持不变

- **WHEN** 平台调用 `StrategySeriesImputer`
- **THEN** 必须保持 `backfilled / forwardFilled / unavailable`、OHLC 四元组与量额独立、交易日 `Asia/Shanghai 00:00` 与 `KBoundaryCalculator 00:00` 同分区、`hydrate` 后冻结、`append` 仅 `forwardFill` 的全部语义
- **AND** 不得为展示侧新增插值、均值或跨日补齐语义
