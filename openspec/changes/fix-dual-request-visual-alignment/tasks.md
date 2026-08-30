# Tasks: fix-dual-request-visual-alignment

> 3 步工作流 - Spec 阶段产物。实施计划与落地另起步骤，本文件仅列 Spec 层验收任务。

## 1. Mist 后端 Spec 对齐
- [x] 1.1 在 `openspec/changes/fix-dual-request-visual-alignment/specs/` 下为 `web-visualization` 与 `visual-command` 产出 delta，明确**双请求同参同源**（`code/period/source/startDate/endDate` 同 `findKData` WHERE/ORDER）、**纯时间窗口**（移除 `count=500 slice(-count)` 默认裁剪）、**价格投射一致**（`KPriceProjector` 前后端一致，不静默丢弃）、**索引零伪造**（`getKIndex→null` 丢弃）。
- [x] 1.2 与 `openspec/specs/web-visualization/spec.md`（若已提升为 live）或 `integrate-lightweight-charts-web-visualization` 的场景 1/2 对齐，将“单一接口”修正为“双请求同参并发”。

## 2. Mist-FE 前端 Spec 对齐
- [x] 2.1 修订 `mist-fe/openspec/changes/add-backtest-visualizer-workspace/specs/backtest-visualizer-workspace/spec.md` 的 2.1/3.2 节，将 7 请求旧契约更新为 `fetchK + fetchVisualCommands` 双请求同参并发，并约束 `TradingViewChart {k, commands}` 的时间轴对齐不变量。
- [x] 2.2 将 `BacktestWorkspace` 的 `substring(0,10)` 日期截断记为 Bug，并在 Spec 中要求精确到秒（`app/lib/time.ts` 统一 `Asia/Shanghai`）。

## 3. 校验门禁
- [x] 3.1 `openspec validate --change fix-dual-request-visual-alignment`（或等价 `validate --specs`）通过。
- [x] 3.2 在 PR 描述中贴四件套链接与本 proposal 的 5 决策确认记录，等待二次确认后再进实施计划。
