# OpenSpec 实施计划：TradingView Lightweight Charts 专业级 Web 可视化改造

**Change 标识**：`integrate-lightweight-charts-web-visualization`  
**涉及仓库**：`mist-fe`、`mist`、`mist-deploy`  
**状态**：Active (Ready for Execution)  
**文档版本**：v1.0.0  

---

## 1. 当前基线与重构目标

### 1.1 现状与技术痛点
- **前端现状**：`mist-fe`（Next.js 16 + React 19 + Ant Design 6 + ECharts）内置了存量图表组件 `KPanel`；
- **核心痛点**：
  1. **网络请求碎片化**：单次查看 K 线并发调用 7 个独立接口（`fetchK`、`fetchMergeK`、`fetchBi`、`fetchFenxing`、`fetchChannel`、`fetchDuan`、`fetchDuanChannel`）；
  2. **前端逻辑严重臃肿（579 行对齐算法）**：[`dataProcessor.ts`](file:///Users/moyui/sean/mist/mist-fe/app/components/k-panel/utils/dataProcessor.ts) 在浏览器中执行大量 `byTime` / `byId` 索引构建与几何计算，极易发生时间戳对齐错位；
  3. **ECharts 金融手感缺陷**：ECharts 是统计图表库，在数万根金融 K 线的拖拽、平移、缩放、十字光标滑动上性能和体验不及专业金融图表引擎。

### 1.2 重构后预期形态
- **统一数据协议**：前端仅通过 `GET /v1/visual/commands`（或后续 WebSocket 推流）获取单一的 `VisualCommandPayload` 几何指令集；
- **专业金融图表引擎**：采用 **TradingView Lightweight Charts (Apache 2.0)** 纯 Canvas 硬件加速渲染（60 FPS 丝滑缩放）；
- **前端极简消费**：彻底移除 579 行复杂对齐逻辑，前端只需不到 60 行代码遍历绘制 `line`（笔/段）、`band`（中枢矩形）、`text`（1买/2买/3买徽标）；
- **存量三大页面平滑替换**：
  - `/k`：实时在线看盘与缠论分析工作台；
  - `/chan-tests`：缠论快照与回归测试画布；
  - `/backtests`：回测买卖点与信号复盘工作台。

---

## 2. 详细实施阶段规划

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 阶段一：依赖安装与基础图表容器搭建 (Phase 1)                                │
│ • pnpm add lightweight-charts                                              │
│ • 搭建 TradingViewChart.tsx 基础容器 (支持自适应缩放与暗黑/明亮主题)         │
│ • 编写容器初始化与销毁的单测门禁                                           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 阶段二：TradingView 缠论自定义系列与插件开发 (Phase 2)                       │
│ • 实现 ChanBoxPrimitive (基于 Canvas 绘制半透明天蓝/靛蓝笔与段中枢矩形框)    │
│ • 实现 ChanStrokeSeries (绘制黄色笔与洋红色线段折线)                         │
│ • 实现 ChanBspMarkers (在时间轴/K线上方或下方标记 1买/2买/3买/1卖/2卖/3卖)   │
│ • 编写自定义插件几何计算单元测试                                            │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 阶段三：数据层接入与存量三大页面平滑替换 (Phase 3)                          │
│ • 在 mist-fe/app/api/client.ts 封装 fetchVisualCommands() API               │
│ • 改造 /k (KLineLivePage.tsx)：废弃 7 个并发请求，接入 TradingViewChart     │
│ • 改造 /backtests (BacktestWorkspace.tsx)：接入新图表展示回测买卖点信号     │
│ • 改造 /chan-tests (ChanTestsPage.tsx)：接入新图表展示快照数据               │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 阶段四：死代码清理、全量测试门禁与生产部署 (Phase 4)                         │
│ • 移除 dataProcessor.ts 与旧版 ECharts 繁琐对齐代码                          │
│ • 执行 pnpm typecheck 与 pnpm test:ci 全量测试（100% PASS）                 │
│ • 构建 mist-fe Docker 镜像并通过 mist-deploy 发布至生产环境                 │
│ • 在线上真实环境完成 000001 / 600519 看盘与回测复盘验证                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 分阶段具体执行明细

### 阶段一：依赖安装与基础图表容器搭建 (Phase 1)
1. **依赖安装**：
   ```bash
   cd /Users/moyui/sean/mist/mist-fe
   pnpm add lightweight-charts@^4.2.0
   ```
2. **创建组件目录**：
   - 路径：`mist-fe/app/components/tv-chart/`
   - 文件：`TradingViewChart.tsx`
   - 支持属性：
     - `klines`: 基础 K 线数据（`time`, `open`, `high`, `low`, `close`）
     - `commands`: 通用绘图指令集（`VisualCommand[]`）
     - `height`: 图表高度（默认 600px）
     - `theme`: 自动适配 Ant Design 暗黑/明亮色彩体系
     - `onCrosshairMove`: 十字光标悬停回调（用于实时展示当前 K 线的指标与状态）
3. **编写容器单测**：
   - `TradingViewChart.spec.tsx`：验证 DOM 挂载、`createChart` 实例化与组件卸载时的 `chart.remove()` 清理。

---

### 阶段二：TradingView 缠论自定义系列与插件开发 (Phase 2)
1. **中枢矩形方框插件（`ChanBoxPrimitive`）**：
   - 利用 Lightweight Charts 的 `ISeriesPrimitive` 接口；
   - 监听价格坐标轴（`PriceScale`）和时间坐标轴（`TimeScale`）的投影转换；
   - 在 Canvas 渲染层使用 `ctx.fillRect` 绘制 `rgba(56, 189, 248, 0.15)` 半透明背景，使用 `ctx.strokeRect` 绘制 ZG/ZD 边界实线。
2. **笔与线段折线（`ChanStrokeSeries`）**：
   - 笔（`chan_bi`）：黄色折线（`#FACC15`，宽度 1px）；
   - 线段（`chan_duan`）：洋红色粗折线（`#E879F9`，宽度 2px）。
3. **买卖点标记（`ChanBspMarkers`）**：
   - 将 `TextVisualCommand` 转换为时间轴 `SeriesMarker`：
     - 买点（1买/2买/3买）：红色底标（`position: 'belowBar'`, `shape: 'arrowUp'`, `color: '#EF4444'`）；
     - 卖点（1卖/2卖/3卖）：绿色顶标（`position: 'aboveBar'`, `shape: 'arrowDown'`, `color: '#22C55E'`）。

---

### 阶段三：数据层接入与存量三大页面平滑替换 (Phase 3)
1. **封装统一数据请求（`mist-fe/app/api/client.ts`）**：
   ```ts
   export async function fetchVisualCommands(query: {
     code: string;
     period: number;
     source?: string;
     layers?: string;
     count?: number;
   }): Promise<VisualCommandPayloadVo> {
     return requestJson<VisualCommandPayloadVo>('/api/mist/v1/visual/commands', {
       params: query,
     });
   }
   ```
2. **重构 `/k`（`KLineLivePage.tsx`）**：
   - 将原本嵌套维护的 7 个 Promise 请求彻底替换为单一 `fetchVisualCommands` 调用；
   - 废弃 `KPanel`，直接传入 `TradingViewChart`；
   - 保留个股搜索、周期切换（1分/5分/15分/30分/60分/日线/周线）与数据源选择器。
3. **重构 `/backtests`（`BacktestWorkspace.tsx`）**：
   - 回测买卖点与信号结果无缝投影在同一张 TradingView 画布上。
4. **重构 `/chan-tests`（`ChanTestsPage.tsx`）**：
   - 快照对比数据转换为 VisualCommand 并在 TradingView 上复核。

---

### 阶段四：死代码清理、全量测试门禁与生产部署 (Phase 4)
1. **代码瘦身与清理**：
   - 彻底删除 `mist-fe/app/components/k-panel/utils/dataProcessor.ts`（579 行对齐代码）；
   - 移除不必要的旧 ECharts 复杂转换文件。
2. **全量静态检查与测试门禁**：
   - `pnpm typecheck`（0 errors）；
   - `pnpm lint`（0 warnings/errors）；
   - `pnpm test:ci`（确保已有测试与新增图表测试全部 100% PASS）。
3. **生产构建与发布**：
   - 提交代码至 `mist-fe` 远程仓库 master；
   - GitHub Actions 触发 `mist-fe` 镜像构建；
   - 通过 `mist-deploy` 部署最新 `mist-fe` 容器至 Windows API 宿主机；
   - 真实访问 `http://192.168.31.182/k` 验证 000001 和 600519 的丝滑看盘效果。

---

## 4. 风险与回滚预案

| 风险项 | 影响评估 | 防范与应对措施 |
|---|---|---|
| **K 线时间戳时区转换** | A 股交易时间以北京时间为准，如果时间戳格式不一致可能导致 K 线柱错位 | 统一使用 UTC/ISO 时间戳，经 `@app/timezone` 与 Lightweight Charts 的 `UTCTimestamp` 严格转换。 |
| **Next.js SSR 报错** | TradingView Lightweight Charts 依赖浏览器 `window` 与 `canvas` | 统一在组件顶部添加 `"use client"`，并使用 Next.js `dynamic(() => import(...), { ssr: false })` 懒加载。 |
| **回滚保障** | 纯前端组件重构，后端已部署的 `/v1/visual/commands` 接口保持向下兼容 | 如有异常，可秒级回滚 `mist-fe` 镜像至上一个稳定版本。 |
