# OpenSpec 任务清单：TradingView Lightweight Charts 集成

**Change 标识**：`integrate-lightweight-charts-web-visualization`  

---

### 1. 依赖与基础设施
- [x] 1.1 在 `mist-fe` 彻底卸载 `echarts` 并执行 `pnpm add lightweight-charts@^4.2.0` 安装开源图表库。
- [x] 1.2 在 `mist-fe/app/components/tv-chart/` 搭建 `TradingViewChart.tsx` 主图容器与 `TradingViewLineChart.tsx` 统计图容器。

### 2. 缠论视觉插件与指令对接
- [x] 2.1 实现中枢区间上下沿与半透明矩形方框渲染（基于 `BandVisualCommand`）。
- [x] 2.2 实现根据 `LineVisualCommand` 绘制黄色笔（`#FACC15`）与洋红色粗线段（`#E879F9`）。
- [x] 2.3 实现买卖点标记适配器，将 `TextVisualCommand` 转换为时间轴 Marker 徽标（1买/2买/3买/1卖/2卖/3卖）。

### 3. 数据层对接与全站页面平替
- [x] 3.1 在 `mist-fe/app/api/client.ts` 增加 `fetchVisualCommands`，直接调用 `GET /api/mist/v1/visual/commands`。
- [x] 3.2 改造 `app/k/KLineLivePage.tsx`，将 7 个并发 API 简化为单一 `fetchVisualCommands`，接入 `TradingViewChart`。
- [x] 3.3 改造 `app/backtests/BacktestWorkspace.tsx` 与 `app/chan-tests/ChanTestsPage.tsx`。
- [x] 3.4 改造 `app/dashboard/`（`EquityChart.tsx` 与 `DrawdownChart.tsx`），用 `TradingViewLineChart` 平替原有 ECharts 统计图表。

### 4. 验证与瘦身清理
- [x] 4.1 彻底删除 `mist-fe/app/components/k-panel/` 整个目录（含 579 行 `dataProcessor.ts`）与 `app/components/charts/echarts-theme.ts`。
- [x] 4.2 运行 `pnpm typecheck`、`pnpm lint` 和 `pnpm test:ci`（19 suites, 149 tests 100% PASS）。
- [x] 4.3 构建生产镜像并通过 `mist-deploy` 发布上线，全链路生产实实验证通过。

