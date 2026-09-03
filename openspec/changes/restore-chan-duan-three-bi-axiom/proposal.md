# Proposal: restore-chan-duan-three-bi-axiom

## Why

在多尺度缠论体系实证审计中发现：
1. **中枢被多段割裂的结构冲突**：
   - 2026-01-05 至 2026-01-14 是一轮从 3992.78 上涨至 4190.87 的单边大级别主升浪；
   - 在微观笔级别上，01-06 至 01-09 形成了一个标准完整的 9 笔上升中枢（Bi #05 ~ Bi #13，4056.87 进，4075~4093 震荡，4121.70 出）；
   - 但在现有段划分算法下，该中枢被人工切碎的 3 根线段（Duan #01, Duan #02, Duan #03）横穿切断，严重违背了“一段内包含同向笔中枢”的级别嵌套原则。
2. **根因溯源（2026-08-30 `add-duan-first-bi-break-rule` 的实现偏差）**：
   - 之前为解决“段跨过最高顶”问题时，引入了 71 课「第一笔破坏」判据，但在具体代码落地中做了一项致命妥协：允许判据直接输出 `originBis.length === 1` 的单笔 Complete 线段（`startBi === endBi`）；
   - 导致 01-07 的单笔中枢内部回踩（Bi #08: 4098.78 -> 4069.44）被硬生生判定为独立向下线段 Duan #02，从而将连续的大上升线段腰斩，并切碎了内部的笔中枢；
3. **缠论原典正本清源**：
   - 缠论第 65 课明确为公理：**「线段至少由三笔组成，线段不可能被单笔破坏」**；
   - 缠论第 71 课的第一笔破坏是用于研判前一线段是否延伸，若后续反弹破新高（如 Bi #13 冲上 4121.70），原线段从未结束、继续延伸；71 课绝不允许产出 1 笔的线段。

## What Changes

1. **恢复第 65 课线段至少三笔公理**：
   - 彻底废除 `duan.ts` 中产生单笔 Complete 线段的逻辑；
   - 任何确认完成的线段，其构成笔数必须 $\ge 3$ 笔（即 `endIdx - segStartIdx >= 2`）；
   - 单笔反弹/回调无法形成独立线段，原线段保持延伸或归入特征序列统一处理。
2. **保持 71 课转折点研判与大顶捕捉能力**：
   - 保留 71 课对第一笔破坏的转折点识别能力，但只有当转折点前累计满 $\ge 3$ 笔时，才允许将该转折点作为合法段端点终结前段。
3. **升级算法版本与测试基线**：
   - `ChanCore.algorithmVersion`: 7 $\to$ 8；
   - 更新 `duan.spec.ts` 与 `chan-core.spec.ts`；
   - 全量 chancore 16 个测试套件回归验证。

## 范围

| 文件 | 改动说明 |
|---|---|
| `libs/chancore/src/internal/duan.ts` | 严格执行线段完成 $\ge 3$ 笔约束，杜绝单笔 Complete 段 |
| `libs/chancore/src/chan-core.ts` | `algorithmVersion` 7 $\to$ 8 |
| `libs/chancore/src/internal/duan.spec.ts` | 更新单笔段用例为合规 $\ge 3$ 笔断言 |
| `libs/chancore/src/chan-core.spec.ts` | 更新 `algorithmVersion` 断言 |
| `openspec/changes/restore-chan-duan-three-bi-axiom/` | OpenSpec 变更文档集 |
