# Proposal: rework-chan-channel-lifecycle-and-expansion

## Why

在回测 28（TDX 5 分钟数据，05-06 至 08-26）以及相关宽幅震荡行情中，`ChanCore.createChannels` 输出了跨越近 4 个月、包含 139 笔的超长复合“怪物中枢”（`expanded: true`），完全掩盖了 5 个月内行情真实的 20 多个独立中枢与买卖点。

经代码审计与缠论原典（第 20、29、41、52、57 课）对照，根本原因在于当前中枢计算的三重结构缺陷：
1. **延伸判据缺乏中枢触及与离开判据（第 20 课中心定理一）**：当前 `extendChannel` 只要全量公共交集有效即无限延伸，导致相隔数月的行情波动被持续吞并；
2. **贪婪滑窗重合合并（`mergeSpans`）**：Phase A 滑窗枚举产生了大量重叠候选，Phase B 强行按时间与价格重叠进行全局合并，这在缠论原典中属于无理论依据的自研拼凑；
3. **Phase C 级联多米诺扩张（违背第 41 课）**：`resolveCentralExpansions` 对所有相邻 $[dd, gg]$ 接触的中枢进行贪婪递归归并，把整个大箱体内的 23 个独立中枢链式串成了一个大中枢；
4. **缺失中枢终结与闭合机制（第 20 课第三类买卖点定理）**：中枢一旦确立，缺少“次级离开且回抽不进中枢即刻闭合”的状态机，导致已完成的历史中枢无法密封。

## What Changes

1. **重构中枢识别为顺序推进状态机（Sequential Confirmation）**：
   - 废除 Phase A 滑窗枚举（`enumerateChannels`）与 Phase B 的全局贪婪重合合并（`mergeSpans`）；
   - 采用顺序状态机扫描笔/段序列：寻找基础重叠 $\to$ 确立中枢 $[ZD, ZG]$ $\to$ 逐笔/段延伸判定 $\to$ 离开破坏确认闭合（Seal）；
   - 一旦当前中枢闭合，中枢全部属性（$ZD, ZG, DD, GG$、时间区间、包含笔）完全固化，从离开点向后推进寻找下一个独立中枢。

2. **落地第 20 课中枢延伸与终结判据**：
   - **延伸条件**：围绕中枢的后续次级别波动 $B_i = [low_i, high_i]$ 必须触及当前中枢区间 $[ZD, ZG]$（$high_i \ge ZD$ 且 $low_i \le ZG$）；
   - **闭合条件（三买卖点）**：出现脱离笔后，后续反向回抽笔依然脱离区间（回踩 $low > ZG$ 或反抽 $high < ZD$）时，确立第三类买卖点，当前中枢在离开前闭合；
   - **中枢扩展（9段/9笔结合）**：若持续震荡未离开且累计达到 9 笔（3+3+3），同级别中枢生命周期完成并标记/升级为更高一级别的中枢。

3. **规范中枢扩张判定（严格约束于相邻走势对，无级联吞并）**：
   - 落实第 20 课中心定理二：仅对**走势相邻的前后两个同级别独立中枢**判定；
   - 当后中枢 $[ZD, ZG]$ 与前中枢严格分离，但波动区间 $[DD, GG]$ 重叠/相切时，标记为扩张中枢；
   - 扩张不再作为多米诺骨牌将后续数十个中枢连锁串联。

4. **同步适配段级中枢（`DuanChannelCalculator`）**：
   - 段级中枢同构升级为顺序确认与对称重叠延伸，统一算法体系。

5. **版本升级与 Characterization 快照**：
   - `ChanCore.algorithmVersion` 由 `6` 递增至 `7`；
   - 更新全量 characterization 快照与回测验证。

## 影响范围

| 文件 / 模块 | 改动说明 |
|---|---|
| `libs/chancore/src/internal/channel.ts` | 笔级中枢重构为顺序确认状态机、触及延伸与三买卖点闭合 |
| `libs/chancore/src/internal/duan-channel.ts` | 段级中枢同构重构为顺序确认状态机 |
| `libs/chancore/src/internal/central-expansion.ts` | 相邻对中枢扩张约束，防止无界级联串联 |
| `libs/chancore/src/chan-core.ts` | `algorithmVersion` 6 $\to$ 7 |
| `libs/chancore/src/internal/*.spec.ts` | 单测套件更新与回测 28 验收 |
