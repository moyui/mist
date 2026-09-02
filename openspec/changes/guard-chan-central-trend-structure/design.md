# Design: guard-chan-central-trend-structure

## 1. 架构目标

规范化缠论笔级中枢（Bi Channel）的生命周期演进模型，确保：
1. **基础中枢首末笔拓扑准确**：进入笔与离开笔的外部端点必须在 $[ZD, ZG]$ 之外，内部端点允许与边界重合。
2. **震荡延伸严格受制于走势极值结构**：向下中枢延伸不得被高于中枢起始顶 $GG$ 的反弹破坏；向上中枢延伸不得被低于中枢起始底 $DD$ 的回调破坏。

## 2. 详细算法设计

### 2.1 首末笔进出约束（validateChannelGeometry）

对于 5 笔序列 $bis = [A, B, C, D, E]$：
- 核心 3 笔为 $B, C, D$（`bis.slice(1, 4)`）。
- 计算中枢区间 $[ZD, ZG]$：
  - $isUp \implies ZG = \min(B.high, D.high), ZD = \max(B.low, D.low)$
  - $!isUp \implies ZG = \min(B.high, D.high), ZD = \max(B.low, D.low)$
- 有效性门禁：
  1. $ZG > ZD$（区间非空）
  2. 边界进出判定：
     - 若为上升中枢（$isUp$）：进入笔 $A.low < ZD$（从下方进入），离开笔 $E.high > ZG$（向上突破离开）。
     - 若为下跌中枢（$!isUp$）：进入笔 $A.high > ZG$（从上方进入），离开笔 $E.low < ZD$（向下跌破离开）。

### 2.2 走势极值结构破坏守卫（Trend Structure Guard）

在中枢成对延伸循环 `while (nextIdx + 1 < biCount)` 中：
- 设待测成对笔为 $b_1 = data[nextIdx], b_2 = data[nextIdx + 1]$。
- **守卫判据**：
  ```typescript
  if (isUp) {
    if (b1.low < curDd || b2.low < curDd) {
      break; // 跌破起始底，向上结构破坏
    }
  } else {
    if (b1.high > curGg || b2.high > curGg) {
      break; // 突破起始顶，向下结构破坏
    }
  }
  ```
- 若守卫触发，中枢立即在此密封终结，不吸纳破坏笔；指针 `cursor` 推进到中枢密封终点，开启下一个新走势的独立中枢探测。

## 3. 测试与验证策略

1. **单测验证**：
   - 测试端点重合时（$A.high === ZG$ 或 $A.low === ZD$）基础中枢能够正确被识别。
   - 测试反弹冲破 $GG$ 或回调跌破 $DD$ 时中枢能被及时阻断。
2. **回测 29 号（000001 5m）验证**：
   - 2026-01-07 09:55 起始笔 Bi #06 正确成为首个中枢进入笔。
   - 2026-01-13 14:50 最低点 4126.23 正确终结第 2 个中枢，14:50 后的 4190.87 强力反弹不再被吞噬。
