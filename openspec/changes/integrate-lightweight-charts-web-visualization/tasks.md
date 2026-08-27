# OpenSpec 任务清单：TradingView Lightweight Charts 集成

**Change 标识**：`integrate-lightweight-charts-web-visualization`  

---

### 1. 依赖与基础设施
- [ ] 1.1 在 `mist-fe` 根目录执行 `pnpm add lightweight-charts` 安装开源图表库。
- [ ] 1.2 在 `mist-fe/app/components/tv-chart/` 搭建 `TradingViewChart.tsx` 核心渲染容器。

### 2. 缠论视觉插件实现
- [ ] 2.1 实现 `ChanBoxPrimitive`（TradingView Custom Series Primitive），用于绘制半透明天蓝/靛蓝笔与段中枢。
- [ ] 2.2 实现 `ChanStrokePlugin`，用于根据 `LineVisualCommand` 绘制黄色笔与洋红色线段。
- [ ] 2.3 实现买卖点标记转换器，将 `TextVisualCommand` 转换为时间轴 Marker 徽标（1买/2买/3买）。

### 3. 数据层对接与页面平替
- [ ] 3.1 在 `mist-fe/app/api/client.ts` 增加 `fetchVisualCommands`，直接调用 `GET /api/mist/v1/visual/commands`。
- [ ] 3.2 改造 `app/k/KLineLivePage.tsx`，将 7 个并发 API 简化为单个 `fetchVisualCommands`，接入 `TradingViewChart`。
- [ ] 3.3 改造 `app/backtests/BacktestWorkspace.tsx` 与 `app/chan-tests/ChanTestsPage.tsx`。

### 4. 验证与瘦身清理
- [ ] 4.1 移除 `mist-fe/app/components/k-panel/utils/dataProcessor.ts` 中的冗余对齐逻辑。
- [ ] 4.2 运行 `pnpm typecheck` 和 `pnpm test`，确保前端所有测试用例 100% 通过。
- [ ] 4.3 构建生产镜像并通过 `mist-deploy` 进行上线与真实验证。
