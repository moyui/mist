# OpenSpec 规范：TradingView Lightweight Charts Web 可视化契约

**Feature**: Lightweight Charts Web 可视化看板  
**Change 标识**: `integrate-lightweight-charts-web-visualization`  

---

## 场景 1: 单一接口拉取并完成 60FPS 硬件加速渲染

```gherkin
Given 用户在前端页面查看证券代码 "000001" 周期为 "5m" 的 K 线分析
When 前端向后端发送单一请求 "GET /v1/visual/commands?code=000001&period=5&source=qmt&layers=chan"
Then 后端在 50ms 内返回统一 envelope 结构与 VisualCommandPayload
And 前端 TradingView Lightweight Charts 成功初始化主图 Candlestick Series
And 在同一画布上准确绘制:
  | 图层名称       | 指令类型 | 几何表现                              |
  | chan_bi       | line    | 黄色笔连接各分型极值点                |
  | chan_duan     | line    | 洋红色加粗线段连接特征序列极值点      |
  | chan_zs_bi    | band    | 天蓝色半透明笔中枢矩形方框            |
  | chan_zs_duan  | band    | 靛蓝色半透明段中枢矩形方框            |
  | chan_bsp      | text    | 1买/2买/3买 (红色底标) 与 1卖/2卖/3卖 (绿色顶标) |
```

---

## 场景 2: 切换股票与周期时零坐标错位

```gherkin
Given 用户从 "000001" 切换到 "600519" 或从 "5m" 切换到 "1d"
When 前端重新请求对应周期的 visual commands
Then 图表画布清空历史序列并在 100ms 内平滑载入新数据
And 所有的笔、线段和中枢的起止时间戳与底层 K 线严格对齐
And 无任何控制台报错、无时间戳缺失、无 0 值伪造
```

---

## 场景 3: 回测复盘与缠论快照无缝兼容

```gherkin
Given 用户在回测工作区 (/backtests) 或快照测试页 (/chan-tests)
When 传入回测执行生成的买卖点信号或回归快照数据
Then Lightweight Charts 复用同一套 VisualCommand 消费组件
And 准确在 K 线柱上方或下方标记回测买入/卖出气泡与中枢演化过程
```
