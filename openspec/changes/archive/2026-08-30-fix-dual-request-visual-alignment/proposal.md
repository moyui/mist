# Proposal: 双请求可视化对齐修复（fix-dual-request-visual-alignment）

## 变更标识
`fix-dual-request-visual-alignment` | 关联仓库 `mist`、`mist-fe` | 类型 `spec-driven` 修复型变更

## 背景与问题
- `mist-fe` 的两大看盘/复盘页面 `KLineLivePage` 与 `BacktestWorkspace` 已落地为**双请求并发**架构：`fetchK`（K 线蜡烛，`POST /v1/indicators/k`，`apps/mist`）与 `fetchVisualCommands`（缠论几何，`GET /v1/visual/commands`，`apps/mist`）并发请求后合并渲染于同一 `TradingViewChart`。
- 溯源发现，虽两请求最终同调 `IndicatorService.findKData`，但在**查询边界解析、结果裁剪、价格投射容错、索引映射回退**四处分叉，导致大数据窗口（如 2928 根 5m）下“`K 线正常、笔段中枢不贴线/数量不对”：
  1. `VisualController` 默认 `count=500` 并 `slice(-count)`，而 `IndicatorController.k` 全量返回；
  2. `projectToChanK` 使用 `KPriceProjector` 严格校验 `DECIMAL(20,2)` 并静默丢弃 `catch→null`，`IndicatorController.k` 仅透传；
  3. `ChanVisualAdapter.getKIndex` 未命中时 `return 0` 伪造对齐；
  4. 前端 `BacktestWorkspace` 对 `run.startDate/endDate` 做 `substring(0,10)` 截断，丢失时分秒精度。
- 现有活跃 Spec（`integrate-lightweight-charts-web-visualization` 的“单一接口”、`add-backtest-visualizer-workspace` 的 7 请求旧契约）与落地已不一致，需一次**跨仓 Spec 对齐修复**而非单仓补丁。

## 目标（确认后冻结）
1. **保留双请求**：`K` 与 `Visual` 职责分离、缓存与权限独立演进，且复用同一 `libs/visual-command` 哑执行器契约。
2. **统一时间语义**：两端点查询均以**时间窗口**为唯一真源，`count` 裁剪语义移除（你的确认2）；大数据窗口不再尾部截断。
3. **前后端价格投射一致**（你的确认3）：`KPriceProjector` 的 `DECIMAL(20,2)` 严格性在前后端对齐，不再一端静默丢弃一端透传。
4. **修复日期截断 Bug**（你的确认4）：`substring(0,10)` 截断纳入本次 Spec 修复范围。
5. **跨仓同步更新**（你的确认5）：`mist` 与 `mist-fe` 两仓 Spec 同步修订。

## 非目标
- 不合并 `K` 与 `Visual` 为单一聚合接口；不新增 WebSocket 推流；不改变 `libs/chancore` 算法本身。
- 本变更仅修 Spec，代码落地另起实施计划（按三步工作流第二步产出）。

## 影响范围
- `mist`: `apps/mist/src/visual/*`（`VisualController`、`QueryVisualCommandsDto`、`VisualCommandVo`）、`libs/visual-command/src/adapters/chan-visual.adapter.ts`、`apps/mist/src/indicator/*`（对照）、`openspec/specs/*`（`web-visualization` 等）。
- `mist-fe`: `app/backtests/BacktestWorkspace.tsx`、`app/k/KLineLivePage.tsx`、`app/api/client.ts`、`app/components/tv-chart/*`、`openspec/specs/*`（`backtest-visualizer-workspace`）。

## 关键决策（已与用户确认）
| # | 决策 | 结论 |
|---|------|------|
| 1 | Change 形态 | 新建 `fix-dual-request-visual-alignment`，不污染旧 Change |
| 2 | count 语义 | 移除 `count=500 slice(-count)` 默认裁剪，改为**纯时间窗口**查询 |
| 3 | 价格投射 | `KPriceProjector` 前后端一致，不再单端静默丢弃；丢弃必须可观测 |
| 4 | 日期截断 | `substring(0,10)` 记为 Bug，本次 Spec 约束并在实施中修复 |
| 5 | 跨仓 | `mist` + `mist-fe` 两仓 Spec 同步修订 |
