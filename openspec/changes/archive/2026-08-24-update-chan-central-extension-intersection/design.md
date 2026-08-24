# Design: update-chan-central-extension-intersection

## 1. 背景与核心问题

- **历史背景**：在 `fix-chan-central-expansion-condition` 中，为了修复 600519 日线因区间漂移与错误扩张判定合并出 2 年全区间巨型中枢的问题，将 `extendChannel` 临时改为“保持基础中枢初始 $zd/zg$ 永久不变”。
- **现有问题**：
  - 一个 7 笔或 9 笔中枢，输出的 $zd/zg$ 依然是最早 5 笔的值，后续 4 笔的重叠形态完全被忽略。
  - 前端渲染出来的中枢矩形上下沿无法体现这 7 笔/9 笔的真实共同震荡箱体。
  - 实际上，历史 Bug 的真正元凶是旧版 `isCentralExpansion` 缺乏中枢区间严格分离检查，如今该判定已被彻底修复，恢复多笔中枢延伸的公共交集算法是安全的，并且具有严格单调性（交集只收窄不漂移）。

## 2. 算法详细设计

### 2.1 段级中枢延伸（`duan-channel.ts`）

- **初始 3 段**（$D_0, D_1, D_2$）：
  $$zg = \min(D_0.high, D_1.high, D_2.high), \quad zd = \max(D_0.low, D_1.low, D_2.low)$$
  $$gg = \max(D_0.high, D_1.high, D_2.high), \quad dd = \min(D_0.low, D_1.low, D_2.low)$$
  成立条件：$zg > zd$。
- **延伸成对段（尾部 +2 段 $D_{k+1}, D_{k+2}$ / 头部 -2 段）**：
  计算包含新增 2 段在内的全量段窗口 $W$：
  $$zg_{new} = \min_{d \in W}(d.high), \quad zd_{new} = \max_{d \in W}(d.low)$$
  $$gg_{new} = \max_{d \in W}(d.high), \quad dd_{new} = \min_{d \in W}(d.low)$$
  **延伸合法性条件**：$zg_{new} > zd_{new}$（即所有段存在公共有效重叠区间）。
  - 若 $zg_{new} > zd_{new}$：采纳新几何参数，窗口推进 2 段，继续循环尝试延伸。
  - 若 $zg_{new} \le zd_{new}$：公共交集为空，停止延伸。

### 2.2 笔级中枢延伸（`channel.ts`）

- **初始 5 笔**（$B_0 \sim B_4$）：
  沿用方向性 5 笔几何计算 $zg, zd, gg, dd$。
- **延伸成对笔（尾部 +2 笔 / 头部 -2 笔）**：
  全量笔窗口 $W$ 的公共交集：
  - 内部震荡全量笔的高点最小值与低点最大值：
    $$zg_{new} = \min_{b \in W}(b.high), \quad zd_{new} = \max_{b \in W}(b.low)$$
    $$gg_{new} = \max_{b \in W}(b.high), \quad dd_{new} = \min_{b \in W}(b.low)$$
  **延伸合法性条件**：$zg_{new} > zd_{new}$。
  - 若有效：以公共交集更新中枢几何参数，推进窗口。
  - 若失效：停止延伸。

### 2.3 重合合并（`mergeTwoChannels`）

- 当两个在时间上重叠且 zone 兼容的中枢在 Phase B 发生重合合并时，合并后的中枢区间 $[zd, zg]$ 同样更新为合并后所有笔/段的公共有效重叠交集：
  $$zg = \min_{u \in allUnits}(u.high), \quad zd = \max_{u \in allUnits}(u.low)$$
  $$gg = \max_{u \in allUnits}(u.high), \quad dd = \min_{u \in allUnits}(u.low)$$

## 3. 防漂移与安全性证明

1. **数学单调性（Monotonicity）**：
   对集合 $S \subseteq S'$，必有 $\min_{s \in S'}(high) \le \min_{s \in S}(high)$ 且 $\max_{s \in S'}(low) \ge \max_{s \in S}(low)$。
   因此，中枢区间 $[zd, zg]$ 随延伸只能收窄或维持，绝不会像自由滑动窗口那样向上或向下整体漂移！
2. **扩张门禁隔离（Expansion Guard）**：
   Phase C 的 `isCentralExpansion` 必须满足 $\max(zd_1, zd_2) > \min(zg_1, zg_2)$。收窄后的中枢区间如果与其他中枢分离但波动重叠，才会合法触发扩张，同一震荡区内的候选因重叠被彻底阻断，绝无巨型中枢风险。

## 4. 算法版本与 Characterization

- `ChanCore.algorithmVersion` 从 `3` 递增到 `4`。
- `chan-full-output.characterization.fixture.ts` 快照重新生成，差异为多笔/段中枢的 $zd/zg$ 精确收敛到全量交集。
