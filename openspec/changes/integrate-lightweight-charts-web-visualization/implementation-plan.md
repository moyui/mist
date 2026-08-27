# OpenSpec 实施计划：TradingView Lightweight Charts 前端集成

**Change 标识**：`integrate-lightweight-charts-web-visualization`  
**预计阶段**：4 个阶段  

---

## 阶段一：依赖安装与组件基础骨架搭建 (Phase 1)
- 在 `mist-fe` 运行 `pnpm add lightweight-charts@^4.2.0`；
- 在 `mist-fe/app/components/` 创建 `tv-chart/` 目录，封装基础的 React 容器组件与响应式 Resize Hook。

## 阶段二：缠论与指令绘图插件实现 (Phase 2)
- 实现通用中枢矩形方框插件（`ChanBoxPrimitive`），基于 Canvas `ctx.fillRect` 与 `ctx.strokeRect` 绘制半透明中枢与 ZG/ZD 边框；
- 实现笔与线段连接线插件（`ChanStrokePrimitive`）；
- 实现买卖点标记适配器（`ChanBspMarkers`）。

## 阶段三：接口集成与存量页面平滑迁移 (Phase 3)
- 在 `mist-fe/app/api/client.ts` 增加 `fetchVisualCommands(...)` API 请求函数；
- 重构 `/k`（`KLineLivePage.tsx`），用新的 `TradingViewChart` 替换原有笨重的 `KPanel`；
- 重构 `/chan-tests` 和 `/backtests` 页面，验证图表正常渲染。

## 阶段四：测试验证与瘦身清理 (Phase 4)
- 运行 `mist-fe` 单元测试与 Jest 门禁（`pnpm test:ci`）；
- 清理废弃的 579 行 `dataProcessor.ts` 与旧 ECharts 遗留代码；
- 本地构建与生产部署上线验证。
