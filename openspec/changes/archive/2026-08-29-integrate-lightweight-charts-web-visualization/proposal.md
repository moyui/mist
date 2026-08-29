# OpenSpec 提案：集成 TradingView Lightweight Charts 专业级 Web 可视化看板

**Change 标识**：`integrate-lightweight-charts-web-visualization`  
**关联系统**：`mist-fe`、`mist`（`libs/visual-command`）、`mist-deploy`  
**状态**：Active (In Design Review)  
**日期**：2026-08-27  

---

## 1. 为什么发起本变更（Context & Motivation）

在之前的探索中，我们深入分析了传统桌面终端（通达信 / QMT 内嵌）与现代量化可视化（Web Push 流）的本质差异，并对 `mist-fe` 现存的绘图模块（基于 Apache ECharts）进行了全面摸底：

1. **现存 `mist-fe` 架构的三大痛点**：
   - **请求极其碎片化**：看一只股票需要并发发起 7 个独立 HTTP 接口（`fetchK`、`fetchMergeK`、`fetchBi`、`fetchFenxing`、`fetchChannel`、`fetchDuan`、`fetchDuanChannel`），任何一个请求延迟都会导致渲染残缺；
   - **前端逻辑严重臃肿（579 行手动对齐）**：`dataProcessor.ts` 在客户端用 JS 频繁做 `byTime` / `byId` 索引映射与几何坐标计算，极易发生时间戳错位；
   - **ECharts 金融手感欠缺**：ECharts 是通用统计图表库，在数万根金融 K 线的拖拽、平移、缩放、十字光标捕捉上远不及专用金融图表引擎。

2. **为什么选择 TradingView Lightweight Charts（开源 Apache 2.0）**：
   - **行业事实标准**：国内外 85%+ 的顶级量化框架（CZSC、Chan.py、Binance、Bybit 等）均采用其作为核心渲染看板；
   - **极致性能与轻量**：仅 ~45KB，纯 HTML5 Canvas 硬件加速，万根 K 线 60FPS 满帧丝滑缩放；
   - **完全无缝对接后端新引擎**：直接消费后端已上线的 **`libs/visual-command`**（`line`、`band`、`text`、`icon` 原语），前端只需不到 60 行代码即可完成全量几何渲染，彻底告别 500 多行的客户端手工对齐计算！

---

## 2. 核心设计目标

1. **单点清晰契约**：前端仅通过单一接口 `GET /v1/visual/commands` 获取所有绘图图层（笔、段、中枢、买卖点、副图指标），消除 7 次并发请求的冗余与抖动；
2. **专业级 Canvas 渲染**：利用 Lightweight Charts 的 Series & Custom Primitives 体系，原生绘制半透明中枢方框（ZG/ZD/GG/DD）、高对比度笔/线段以及 1买/2买/3买 徽标；
3. **无缝平替存量三大页面**：
   - `/k`：在线实时分析看盘主工作台；
   - `/chan-tests`：缠论快照与回归测试画布；
   - `/backtests`：回测买卖点与信号复盘工作台。
4. **实时推流能力就绪**：图表架构天然支持 WebSocket 增量更新，为后续实盘行情跳动时动态生长笔与中枢打下坚实基础。
