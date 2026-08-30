# Proposal: add-duan-first-bi-break-rule

## Why

生产数据实证（`security_id=5` 000001 5m/qmt 全量 2832 根 K → 158 笔 → 25 段，只读复现）：

- 用户肉眼发现两处「段跨过顶」：06-23 10:40 顶（4175.35，段#5 Up bi[38..42]）与 07-10 13:15 顶
  （4074.83，段#11 Up bi[66..74]）；
- 全量扫描发现**同类问题共 8 处**（另 6 处隐蔽：bi#10/53/57/93/102/137 处的一段一笔极值被跨段）；
- 根因（代码级实证，Decoy 插桩日志）：`findSegmentEnd` 在候选转折笔是**段内第一根反向笔**时
  （`stdSeq` 为空、`first === null`），分型判定被整体跳过，随后转折笔被并入 `stdSeq`，其极值
  压制后续所有分型判定（`second.high > first.high` 永假），段被迫延伸到次高顶/次低底；
- 对照 GitHub 原文（`stockServ/chzhshch-108-plus` 整理的 108 课全文）：这正落缠论 **71 课
  「线段划分标准的再分辨」** 专门处置的情形——「最早破坏那笔就是转折点下来的第一笔」时
  特征序列分型无从成立，应改用**第一笔破坏规则**：「从转折点开始，如果第一笔就破坏了前线段，
  进而该笔延伸出三笔来，其中第三笔破点第一笔的结束位置，那么，新的线段一定形成，前线段一定结束」。

原 issue 文档（`docs/duan-segment-issue-2026-08-30.md` §4.2）归因于 `case2Confirmed` 过严已被
复现日志证伪：两锚点最终确认均为 `gap=false` 的 case1，`hasGap/case2` 分支从未进入。

## What Changes

1. **实现 71 课第一笔破坏判据**（`libs/chancore/src/internal/duan.ts` `findSegmentEnd`）：
   - `first === null` 分支不再盲目跳过并吞并转折笔，先执行第一笔破坏判据；
   - 判据（方向对称）：转笔（从假设转折点开始的第一根反向笔）延伸三笔后，与转笔同向的笔
     **破转笔终点** → 段在假设转折点确认结束（`endIdx = 转笔.biIndex - 1`）；与段同向的笔
     **先破转笔起点**（= 假设转折点极值）→ 旧段延续，判据作废（71 课复杂分支，无限扫描竞争，先到者定论）；
   - 判据未触发（`none`）/作废（`extended`）时保持现有常规流程（吞并 + 继续扫描），其余 23 段
     零副作用（预演已验证段#0、段#5(33..37)、段#9(58..60) 等判据作废场景与原输出一致）。
2. **单笔段合法输出（keep）**：判据确认的段恒为单笔（`endIdx === segStartIdx`），直接输出为
   `type=complete, status=valid` 的完整 `ChanDuan`（`startBi === endBi`）。这是 71 课「前线段一定结束」
   与 65 课「线段至少三笔」组合语义下的显式特例；不采用 drop（孤儿笔破坏段方向交替，下游不可用）。
3. **版本与契约**：`ChanCore.algorithmVersion` 4 → 5；`chan-core.spec.ts` 断言同步；
   `chan-full-output.characterization` 补齐 **duan 输出层** fingerprint（现有主管道只到 channels，
   不含 duan——本次把锚点 K 窗口固化为 fixture 并锁 SHA）；`duan.spec.ts` 补 71 课判据用例。

## 范围

| 项 | 说明 |
|----|------|
| `libs/chancore/src/internal/duan.ts` | `findSegmentEnd` `first===null` 分支新增 71 课第一笔破坏判据 |
| `libs/chancore/src/chan-core.ts` | `algorithmVersion` 4 → 5 |
| `libs/chancore/src/internal/duan.spec.ts` | 补判据确认 / 判据作废 / 单笔段合法 3 类用例 |
| `libs/chancore/src/chan-core.spec.ts` | `algorithmVersion` 断言 4 → 5 |
| `libs/chancore/src/chan-full-output.characterization.*` | 新增 duan 层 fingerprint（锚点窗口 K fixture + SHA 锁定），`algorithmVersion` payload 残留 2 → 5 一并修正 |
| `openspec/specs/chan-duan-segment` delta | 新增 71 课判据 2 场景 + requirement 文本补充；修 requirement 3 的 version 残留表述 |
| 回归 | 段→段中枢→买卖点链路全量 chancore 测试（174 基线）；预演数据确认 25→33 段端点差异全部落在 8 处判据命中点 |