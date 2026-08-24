# Proposal: update-chan-central-extension-intersection

## Why

在 `fix-chan-central-expansion-condition` 中，为了防范历史因区间漂移导致的误判扩张，笔级与段级中枢延伸（`extendChannel`）被实现为“冻结初始区间的 `zd/zg` 不变”。
但这引入了新的语义缺陷：
1. **矩形失真**：当一个中枢延伸到 5 笔/7 笔/9 笔（或 5 段/7 段）时，中枢输出的 `[zd, zg]` 矩形框仍然死锁在最开始的数值上，后续延伸进来的走势没有参与中枢核心区间的计算，导致前端绘制的箱体无法覆盖所有内部震荡走势。
2. **公共交集违背**：多笔/多段中枢的核心特征是“所有构成单元共同震荡于一个公共重叠区间 $[zd, zg]$ 内”。
3. **买卖点与背驰基准失真**：三类买卖点与离开段判定依赖中枢真实的 $[zd, zg]$ 箱体。

## What Changes

1. **修正笔级与段级中枢延伸算法（全量公共重叠交集）**：
   - `channel.ts` 与 `duan-channel.ts` 的 `extendChannel` 修正为：每次延伸时，新的中枢区间 $[zd, zg]$ 更新为**当前全部构成单元的公共重叠交集**（$zd = \max(\text{所有低点}), zg = \min(\text{所有高点})$）。
   - 延伸门禁：新增单元必须与当前走势维持有效的公共重叠区间（$zg > zd$），一旦公共交集为空，延伸立即终止。
   - 波动极值 $[dd, gg]$ 与时间边界同步更新为全量构成单元的极值。
   - `mergeTwoChannels` 采用合并后全量单元的公共交集更新 `zd/zg`。
2. **升级算法版本与 Characterization 快照**：
   - `ChanCore.algorithmVersion` 3 → 4。
   - `chan-full-output.characterization.spec.ts` 验证通过。

## 范围

| 项 | 说明 |
|----|------|
| `channel.ts` | 笔级 `extendChannel` 与 `mergeTwoChannels` 采用全量笔公共交集更新 `zd/zg` |
| `duan-channel.ts` | 段级 `extendChannel` 与 `mergeTwoChannels` 采用全量段公共交集更新 `zd/zg` |
| `chan-core.ts` | `algorithmVersion` 3 → 4 |
| `chan-central-extension` spec delta | 场景更新为动态公共交集计算 |
| 单测套件 | `channel.spec.ts`, `duan-channel.spec.ts`, `chan-core.spec.ts` 适配与验证 |
