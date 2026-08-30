# Proposal: 统一行情数据精度与补齐平台（unify-market-data-precision-and-imputation）

## 变更标识
`unify-market-data-precision-and-imputation` | 关联仓库 `mist` | 类型 `refactor + spec-driven`

## 背景与问题

当前行情数据存在两类分散问题，叠加后直接导致「策略吃的K ≠ 图上看到的K ≠ 回测算的K」：

1. **精度分散**：`KPriceProjector`（`DECIMAL(20,2)` 严格校验）的落点分散在 `visual.controller:projectToChanK`、`k-strategy-bar.mapper:mapKToStrategyBar`、`signal-strategy-market-data.adapter` 等 5 处，各自 `try/catch→null` 或直接透传 `Number()`，策略侧严、可视化侧严但静默、指标侧宽。
2. **补齐分散**：唯一的统一补充算法 `StrategySeriesImputer`（`imputeSeries` / `hydrate + append`，`backfilled/forwardFilled/unavailable`）只被回测 `BacktestRunExecutor` 与实时 `SharedStrategyWindowStore` 消费，`IndicatorController.k` 与 `VisualController` 的展示链完全没走它，导致展示侧丢K后序列断层、中枢索引错位（25任务该时间点）。
3. **次序未收口**：两层尚未固化为单一管线的不变量，部分链路隐含“先补齐后判精度”（把脏K当锚点传染），部分为“先判精度后补齐”，未统一。用户已拍板：**先确定精度，再补齐**，且**实时与历史同一份代码**。

后续精度口径（`1.20` vs `1.2` 是否算脏、`999...` 截断、`0` 是否锚点）另议，本变更先做平台收口与次序固化。

## 目标（冻结）

1. **单一平台**：新建/收敛统一行情管线平台（`MarketDataPipeline`），历史读与实时读共用同一份 `精度门控 → 补齐` 代码。
2. **次序不变量**：全链路固化 `先单根精度门控 → 再 StrategySeriesImputer 补齐 → 再评估/渲染比较`，不得把非法K当补齐锚点。
3. **展示侧对齐**：`IndicatorController.k` 与 `VisualController` 复用同一平台出口，与回测/实盘策略同序列同窗同精度。
4. **分散收口**：盘点并收敛现有分散实现到平台单一真源，不再各写各的 projector/imputer 调用。

## 非目标

- 不在本变更确定最终精度口径阈值与舍入规则（另起讨论）。
- 不改 `libs/chancore` 算法本身与 `dynamic-series-imputation` 的补齐规则语义，仅收口调用点。
- 不引入 Redis 缓存或合并 `K` 与 `Visual` 为单聚合接口（由 `fix-dual-request-visual-alignment` 约束）。

## 关联与复用

- 复用 `dynamic-series-imputation` 的 Spec 语义（`backfilled/forwardFilled/unavailable`、跨日不补、双向后冻结）。
- 复用 `fix-dual-request-visual-alignment` 的 `双请求同参同源 + 投射可观测 + 零伪造` 约束，本平台作为其历史/实时底层落地载体。
- 治理约束：`project-quality-governance-guide.md` §6.5 K线缺失与精度（`DECIMAL(20,2)` projector、缺失不补零、量额特例、日线约束等）。

## 影响范围

- `mist`: `libs/strategy`（`k-price-projector.ts`、`strategy-series-imputer.ts`、`strategy-market-data.port.ts` 等）、`libs/shared-data/src/mappers/k-strategy-bar.mapper.ts`、`apps/mist/src/indicator/*`、`apps/mist/src/visual/*`、`apps/backtest/src/backtest-*`、`libs/signal/src/runtime/*`、`libs/visual-command`。
- `mist` 不涉及 DB migration。

## 关键决策（待确认）

| # | 决策 | 拟定结论 |
|---|------|----------|
| 1 | 平台选址 | `libs/strategy` 内收敛（复用现有 `KPriceProjector` + `StrategySeriesImputer`），或单开 `libs/market-data`；本 proposal 倾向 `libs/strategy` 内 `MarketDataPipeline` |
| 2 | 展示侧是否复用 Imputer | 复用，`VisualController` 封 `visualReplayStartFor + loadVisualHistory + StrategySeriesImputer.hydrate/append`（与回测 `replayStartFor` 同 `01:30Z`） |
| 3 | 精度口径是否本变更定 | 不定，本变更仅固化次序与平台，分散收口；最终阈值另议 |

## 风险

- 展示侧接入 Imputer 后增加一次历史 `DESC take=requiredBars` 查询，仅分钟级触发，可接受。
