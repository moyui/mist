# Design: partition-chan-sub-centrals-by-macro-bi

## 核心架构原则

1. **局部邻近双级别对（Adjacent Timeframe Pair）**：
   任何级别的笔中枢计算，只依赖该级别自身的构件笔（`subBis`）以及直接上一层父级别的走势笔（`macroBis`）。
   - 5m 笔中枢 $\leftarrow$ 30m 笔约束
   - 30m 笔中枢 $\leftarrow$ 日线（1d）笔约束
   - 日线笔中枢 $\leftarrow$ 周线（1w）笔约束
   依赖深度严格为 1，杜绝级联展开。

2. **边界切片与生命周期封闭性**：
   对于每一根有效的宏观笔 $M_k \in \text{macroBis}$，其时间区间为 $[T_s, T_e]$：
   - 提取所有落入该区间的次级别笔 $S_{k, j} \in \text{subBis}$；
   - 判定标准：$S_{k, j}.\text{startTime} \ge T_s$ 且 $S_{k, j}.\text{endTime} \le T_e$；
   - 在该切片上运行标准的 `ChannelCalculator.getChannels(slice)`；
   - 切片内计算出的中枢保证天然在 $M_k$ 内部，绝不横跨到 $M_{k-1}$ 或 $M_{k+1}$；
   - 若 $M_k$ 内部的次级别笔不足 5 笔（或不足以构成有效中枢），则该大笔内部无次级别中枢（呈现强单边走势）。

3. **双轨共存与纯函数实现**：
   - `ChannelCalculator.getChannels(bis)` 维持原有单周期全局计算；
   - 新增 `ChannelCalculator.getAdjacentBoundedChannels(subBis, macroBis)` 实现切片组合；
   - 纯内存计算，无 I/O 副作用，便于单测与回测。

## 接口设计

```typescript
export interface AdjacentBoundedChannelsInput {
  readonly subBis: readonly ChanBi[];
  readonly macroBis: readonly ChanBi[];
}

export class ChanCore {
  // ...
  static createAdjacentBoundedChannels(
    input: AdjacentBoundedChannelsInput,
  ): ChanChannelTwoPhaseResult {
    return new ChannelCalculator().getAdjacentBoundedChannels(
      input.subBis,
      input.macroBis,
    );
  }
}
```
