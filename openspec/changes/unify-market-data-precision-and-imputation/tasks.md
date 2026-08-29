# Tasks: 统一行情数据精度与补齐平台

## 1. Spec 收口（本 change）

- [ ] 1.1 起草 `specs/market-data-pipeline/spec.md` 的 delta（`精度门控 → Imputer 补齐` 次序不变量、历史/实时同码、分散收口清单与可观测契约）。
- [ ] 1.2 与 `fix-dual-request-visual-alignment` 的 `visual`/`indicator` 约束对齐：本平台作为其历史/实时底层落地载体，不重复约束。

## 2. 平台实现（libs/strategy 内，待实施计划确认后编码）

- [ ] 2.1 新建 `libs/strategy/src/market-data/market-data-pipeline.ts`（纯函数 `prepareMarketData`，见 design §3），封装 `KPriceProjector`/`Decimal8` 精度门控 + `StrategySeriesImputer(hydrate/append)` + `toChanKSeries`，输出 `requested/dropped` 可观测。
- [ ] 2.2 定 `VisualController.visualReplayStartFor` 镜像 `BacktestRunExecutor.replayStartFor`（`period<1440 → 01:30Z`，`>=1440 → startAt`）与 `loadVisualHistory`，与平台对接。

## 3. 调用点收敛（待实施计划确认后编码）

- [ ] 3.1 `apps/mist/src/indicator/indicator.controller.ts:k()` 改调 Pipeline（收敛 `Number()` 透传）。
- [ ] 3.2 `apps/mist/src/visual/visual.controller.ts` 删除独立 `projectToChanK`，改调 Pipeline。
- [ ] 3.3 `apps/backtest/src/backtest-*` 与 `libs/signal/src/runtime/shared-strategy-window.store.ts` 改调 Pipeline（语义不变，仅收口分散调用）。
- [ ] 3.4 `libs/visual-command` 的展示投射复用 Pipeline 的 `chanKlines`，`getKIndex` 唯 `time` 定位收敛保留。

## 4. 校验门禁

- [ ] 4.1 `openspec validate --change unify-market-data-precision-and-imputation` 通过。
- [ ] 4.2 平台单元测试：同窗口 `indicator/k` vs `visual/commands` vs 回测 `imputer` 的 `length` 一致；脏K不传染为锚点；成功变更的 PR 描述贴本 change 四件套与决策记录。
