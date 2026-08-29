# Design: 统一行情数据精度与补齐平台

## 1. 现状（分散）

```
MySQL k (DECIMAL 20,2) ── findKData ─┬─ indicator/k: Number() 透传（宽，不判精度不补齐）
                                   ├─ visual/commands: projectToChanK(KPriceProjector)→drop（严，不补齐）
                                   └─ (回测/实时策略) mapKToStrategyBar(KPriceProjector) → StrategySeriesImputer → toChanKSeries（严+补齐）

Redis candle ── Aggregator ── Finalizer(toSealed: roundToScale) ── 实盘 WindowStore ── Imputer（仅策略侧）
```

治理 §6.5 要求 `Chan/Indicator/Strategy` 前复用同一纯函数 projector，已只有策略侧遵守。

## 2. 目标架构（单一平台，历史+实时同码）

```
                        MarketDataPipeline（libs/strategy 内，历史/实时共用）
MySQL k / Redis candle ──→ ① 单根精度门控 ──→ ② StrategySeriesImputer 补齐 ──→ ③ 消费视图
                             KPriceProjector    hydrate(历史budget) 双向定死       toChanKSeries / StrategyBar effective
                             Decimal8.parse     append(窗口) 单向forwardFill     → ChanCore / 指标 / TradingView 共用
                             非法 fail closed   跨日重置，不跨日传染               同序列同窗同精度

调用点收敛：
  backtest: BacktestMarketDataAdapter → Pipeline
  signal实时: SharedStrategyWindowStore.prepare → Pipeline
  visual/indicator展示: VisualController / IndicatorController → Pipeline（本次补上漏的环节）
```

### 2.1 次序不变量（平台原子化）

`A′ = 精度门控 → Imputer → 视图`，多步不可打散：

1. 先单根精度门控：`KPriceProjector(DECIMAL 20,2)` / `Decimal8.parseCanonical(36,8)` / `normalizeExternalDecimalText`；`KVo` 的 `open/high/low/close/volume/amount` 单字段非法即该 bar 整根或该量额字段 `fail closed`（计 `dropped`，不进锚点）。
2. 再 Imputer 补齐：`isOhlcAnchor/isQuantityAnchor` 已含精度校验，非法不算锚点；`nearestAnchor` 仅复用合法锚点生成 `backfilled/forwardFilled`，`unavailable` 不虚构；`hydrate` 后冻结，`append` 仅 forwardFill。
3. 再评估/渲染比较：`Decimal8.compare / roundToScale` 与前端 `getKIndex` 均消费 `effective`。

该次序在平台内原子化，调用方不得自行拆开先补齐后判精度。

## 3. 平台契约

```ts
// libs/strategy/src/market-data/market-data-pipeline.ts（拟）
export interface MarketDataPipelineInput {
  rawBars: readonly K[] | readonly StrategyBar[]; // MySQL K 或 Redis 已转 StrategyBar
  period: Period;
  window: { startAt: Date; endAt: Date };
  requiredBars: number; // CHAN_BSP_WINDOW_BUDGET 等预算
  historyBars?: readonly StrategyBar[]; // 可选，分钟级 01:30Z 前置历史
}
export interface MarketDataPipelineOutput {
  projected: readonly ProjectedStrategyBar[]; // imputer.read()，含 raw/effective/resolution
  chanKlines: readonly ChanK[];               // toChanKSeries 投影，id=index+1
  requestedKlines: number; droppedKlines: number;
  diagnostics: { tradingDay: string; resolutionCounts: Record<StrategyImputationResolution, number> };
}
export function prepareMarketData(input: MarketDataPipelineInput): MarketDataPipelineOutput;
```

`VisualController` 的 `visualReplayStartFor` 镜像 `BacktestRunExecutor.replayStartFor`（`period<1440 → 01:30Z`，`>=1440 → startAt`），历史加载 `timestamp < visualReplayStart order DESC take requiredBars reverse mapKToStrategyBar` 后与窗口一起喂平台。

## 4. 分散收口清单（本变更必须收敛）

| 散点 | 文件 | 现状 | 收敛 |
|---|---|---|---|
| price projector | `libs/strategy/src/market-data/k-price-projector.ts` | 单源正确 | 平台唯一调用 |
| visual 独立 projector | `apps/mist/src/visual/visual.controller.ts:projectToChanK` | 独立 `KPriceProjector catch→null` drop | 删除，改调 Pipeline |
| k 透传 | `apps/mist/src/indicator/indicator.controller.ts:k()` | 直接 `item.open` | 改调 Pipeline |
| mapper | `libs/shared-data/src/mappers/k-strategy-bar.mapper.ts` | 正确但被绕过 | Pipeline 内唯一复用 |
| backtest hydrate | `apps/backtest/src/backtest-run.executor.ts:316/346` | 正确 | 改调 Pipeline |
| realtime window | `libs/signal/src/runtime/shared-strategy-window.store.ts:135/58` | 正确 | 改调 Pipeline |
| 指标直调 | `apps/mist/src/realtime/*` 部分 `Number()` | 漏精度 | 改调 Pipeline |

## 5. 不做事项

- 不在本变更确定 `1.2` vs `1.20`、超大数截断、`0` 是否锚点等最终阈值（下一轮精度讨论）。
- 不改 `dynamic-series-imputation` 的跨日/双向/冻结语义。
- 不改 `realtime/candle/open-candle-aggregator.ts` 聚合期不补零、封盘才 `toSealed` 截断的语义（该语义由平台消费侧统一，聚合本身不变）。

## 6. 风险与回滚

- 展示侧多一次历史查询，仅分钟级，可接受。
- 任一端点异常可独立回滚，双请求互为降级；平台为纯函数，无持久化，回滚即回退调用点。
