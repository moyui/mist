# OpenSpec 技术设计：TradingView Lightweight Charts 前端集成与渲染架构

**Change 标识**：`integrate-lightweight-charts-web-visualization`  
**模块**：`mist-fe`、`libs/visual-command`  
**版本**：v1.0.0  

---

## 1. 全链路架构图

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │ Mist Backend 计算核心                                        │
                    │ (IndicatorService + libs/chancore + libs/indicators)       │
                    └──────────────────────────────┬──────────────────────────────┘
                                                   │
                                                   ▼
                    ┌─────────────────────────────────────────────────────────────┐
                    │ 通用绘图指令引擎 (libs/visual-command)                      │
                    │ 输出标准 Line / Band / Text / Icon 原语                    │
                    └──────────────────────────────┬──────────────────────────────┘
                                                   │
                                                   ▼
                                    GET /v1/visual/commands
                                                   │
                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ mist-fe: Next.js 16 + React 19 前端渲染看板                                                     │
│                                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ TradingView Lightweight Charts (Canvas 60 FPS 渲染容器)                                   │  │
│  │                                                                                           │  │
│  │  1. 主图 K 线层 (Candlestick Series)                                                      │  │
│  │     时间戳、OHLC、涨跌配色                                                                │  │
│  │                                                                                           │  │
│  │  2. 缠论笔 / 线段层 (Line Series / Custom Line Primitive)                                │  │
│  │     • 笔 (chan_bi): 黄色实线 (#FACC15, width=1)                                           │  │
│  │     • 线段 (chan_duan): 洋红色粗线 (#E879F9, width=2)                                     │  │
│  │                                                                                           │  │
│  │  3. 缠论中枢区间带 (Custom Box Primitive / Band Series)                                  │  │
│  │     • 笔中枢 (chan_zs_bi): 天蓝半透明矩形 (#38BDF820, ZG/ZD 上下沿)                        │  │
│  │     • 段中枢 (chan_zs_duan): 靛蓝半透明矩形 (#818CF825, ZG/ZD 上下沿)                      │  │
│  │                                                                                           │  │
│  │  4. 买卖点徽标层 (Markers & Tooltip Primitive)                                            │  │
│  │     • 1买 / 2买 / 3买: 红色气泡 (#EF4444, belowBar)                                       │  │
│  │     • 1卖 / 2卖 / 3卖: 绿色气泡 (#22C55E, aboveBar)                                       │  │
│  │                                                                                           │  │
│  │  5. 联动副图指标 (MACD / KDJ / Volume Series)                                             │  │
│  └───────────────────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心组件与数据流设计

### 2.1 依赖引入与包管理
- `mist-fe` 使用 `pnpm add lightweight-charts@^4.2.0`；
- 移除复杂的客户端数据对齐文件（`mist-fe/app/components/k-panel/utils/dataProcessor.ts` 中的 579 行对齐计算直接淘汰）。

### 2.2 前端消费适配器（`useVisualCommandChart.ts`）
前端仅需极简映射遍历：
```ts
// 伪代码：极简消费 VisualCommand 数组
for (const cmd of payload.commands) {
  switch (cmd.type) {
    case 'line':
      // 笔/线段
      strokeSeries.setData(formatLinePoints(cmd));
      break;
    case 'band':
      // 中枢方框 (Custom Primitive / 填充矩形)
      boxPrimitive.addBox({
        from: cmd.startTime,
        to: cmd.endTime,
        top: cmd.top,
        bottom: cmd.bottom,
        color: cmd.color,
      });
      break;
    case 'text':
      // 1买/2买/3买 Marker
      markers.push({
        time: cmd.time,
        position: cmd.position === 'below' ? 'belowBar' : 'aboveBar',
        color: cmd.color,
        shape: cmd.position === 'below' ? 'arrowUp' : 'arrowDown',
        text: cmd.text,
      });
      break;
  }
}
```

### 2.3 存量页面平滑替换
- **`app/k/KLineLivePage.tsx`**：将原本嵌套的 7 个 API 请求统一合并为 1 个 `fetchVisualCommands({ code, period, source, count })` 调用；
- **`app/chan-tests/ChanTestsPage.tsx`**：快照对比直接转换为 `VisualCommandPayload` 格式送入通用图表渲染；
- **`app/backtests/BacktestWorkspace.tsx`**：回测买卖点与 K 线主图共用同一套 Lightweight Charts 画布。
