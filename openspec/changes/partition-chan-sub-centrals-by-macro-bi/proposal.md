# Proposal: partition-chan-sub-centrals-by-macro-bi

## Why

在传统缠论实现中，笔中枢（Bi Central）往往仅在单一周期的笔序列上通过滑动窗口和区间重叠进行单维度识别。
这种单周期孤立求值存在显著的理论与实践痛点：
1. **中枢跨大级别拐点撕裂**：单周期中枢很容易跨越宏观周期的主要峰谷（如 30 分钟顶底分型），导致上涨浪与暴跌浪被生硬揉合成同一个巨型中枢，破坏走势的物理意义；
2. **走势类型归属模糊**：缠论级别递归公理（第 35、53、65 课）明确指出：**“本级别的一笔，在次级别上必然是一个完整的走势类型（盘整或趋势）”**。次级别所孕育的中枢，其生命周期天然属于大级别某一笔的时空区间内部；
3. **计算复杂度与级联爆炸风险**：全级别展开的递归（如日线等 30m，30m 等 5m，5m 等 1m）会导致数据加载量成几何级数暴增。必须确立**“邻近双级别对（Adjacent Timeframe Pair：当前级别 + 直属父级别）”**机制，使回测与实时系统保持 $O(1)$ 依赖深度，零级联包袱。

## What Changes

1. **`libs/chancore` 增加跨级别笔约束切分中枢能力**：
   - 增加纯函数接口 `ChanCore.createAdjacentBoundedChannels({ subBis, macroBis })`：
   - 遍历 `macroBis` 中所有已确认的有效大笔（`status === BiStatus.Valid`），提取时段 $[T_{start}, T_{end}]$；
   - 筛选属于该大笔时段内的次级别 `subBis` 子集；
   - 在该子集内部独立运行中枢生命周期状态机，保证次级别中枢的生命周期（起点、延伸、闭合）不溢出父级别笔的边界；
   - 合并各时段独立产出的中枢列表，输出时序自洽的次级别中枢序列。
2. **`libs/visual-command` 绘图层联动支持**：
   - 在 `ChanVisualOptions` 中支持传入 `macroBis` 或父级别参考；
   - 在生成次级别图层指令时，优先以父级别大笔为时间边界投影次级别中枢。
3. **架构与性能保障**：
   - 单周期 `ChanCore.createChannels(klines)` 保持 100% 向后兼容；
   - 实盘（`apps/signal`）采用多级别内存状态总线（In-Memory Bi Bus）直接复用同一标的已计算的高级别大笔，零额外数据拉取；
   - 回测（`apps/backtest`）仅加载目标级别 + 父级别两组 K 线，计算耗时严格控制在 $\le 5\text{ms}$。

## 影响范围

| 文件/模块 | 说明 |
|---|---|
| `libs/chancore/src/chan-core.ts` | 暴露 `createAdjacentBoundedChannels` API |
| `libs/chancore/src/internal/channel-bounded.ts` | 实现基于大级别笔边界切片次级别中枢的纯函数逻辑 |
| `libs/chancore/src/internal/channel-bounded.spec.ts` | 邻近双级别切分中枢的单元测试套件 |
| `libs/visual-command/src/adapters/chan-visual.adapter.ts` | 支持传入父级别笔做联立中枢指令投影 |
