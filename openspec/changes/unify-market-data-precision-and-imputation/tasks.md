# Tasks: 统一行情数据精度与补齐平台

## 1. Spec 收口（本 change）

- [x] 1.1 起草 `specs/market-data-pipeline/spec.md` 的 delta（`精度门控 → Imputer 补齐` 次序不变量、历史/实时同码、分散收口清单与可观测契约）。
- [x] 1.2 与 `fix-dual-request-visual-alignment` 的 `visual`/`indicator` 约束对齐：本平台作为其历史/实时底层落地载体，不重复约束。

## 2. 平台实现（libs/market-data 全局库，一口气搬入，无过渡）

- [x] 2.1 新建 `libs/market-data/src/market-data-pipeline.ts`（纯函数 `prepareMarketData`，见 design §3），封装 `KPriceProjector`/`Decimal8` 精度门控 + `StrategySeriesImputer(hydrate/append)` + `toChanKSeries`，输出 `requested/dropped` 可观测。`KPriceProjector` 已按 `多零不算脏(1.200→1.20) / 超最大整数clamp / 0可锚` 冻结。
- [x] 2.2 定 `VisualController.visualReplayStartFor` 镜像 `BacktestRunExecutor.replayStartFor`（`period<1440 → 01:30Z`，`>=1440 → startAt`）与 `loadVisualHistory`，与平台对接。实际 `visual` 已切 `prepareMarketData`，`requiredBars` 按窗口自适应。

## 3. 调用点收敛（已直删存量，无 shim）

- [x] 3.1 `apps/mist/src/indicator/indicator.controller.ts:k()` 改调 Pipeline（收敛 `Number()` 透传；已落地 `prepareMarketData` + `K len 48` 真机一致）。
- [x] 3.2 `apps/mist/src/visual/visual.controller.ts` 删除独立 `projectToChanK`，改调 Pipeline（已落地 `prepareMarketData` + `totalKlines 48`）。
- [x] 3.3 `apps/backtest/src/backtest-*` 与 `libs/signal/src/runtime/shared-strategy-window.store.ts` 改调 Pipeline（语义不变，仅收口分散调用；`mapKToStrategyBar` 已从 `@app/market-data`，`StrategySeriesImputer` 已搬 `libs/market-data/projection`）。
- [x] 3.4 `libs/visual-command` 的展示投射复用 Pipeline 的 `chanKlines`，`getKIndex` 唯 `time` 定位收敛保留（待 `fix-dual` 3 另补）。

## 4. 校验门禁

- [x] 4.1 `openspec validate --change unify-market-data-precision-and-imputation` 通过（`is valid`）。
- [x] 4.2 平台单元测试：同窗口 `indicator/k` vs `visual/commands` vs 回测 `imputer` 的 `length` 一致；脏K不传染为锚点；成功变更的 PR 描述贴本 change 四件套与决策记录。（本地 `libs/market-data 31/31` + `visual|indicator 11/11` 已过，真机 `600519 48根对账 CONSISTENT`）。
