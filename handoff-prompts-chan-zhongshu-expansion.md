# Handoff Prompt — chan 中枢扩张（Central Extension）change

> 用途：给一个**新线程**处理。目标是把"中枢扩张"单独做成一个 OpenSpec change，产出**完全不重叠
> 的中枢序列**，供趋势链（背驰）消费。完成后回到主线程继续 add-chan-divergence。
> 本提示词自包含；操作环境 = mist 仓库（`/Users/moyui/sean/mist/mist`）。

---

## 0. 你的任务（一句话）

为 ChanCore 新增**中枢扩张识别/处理**，使得段级中枢（以及后续趋势链）拿到的中枢序列
**两两不重叠、位置递进（用 gg/dd 判定）**，为趋势背驰提供干净输入。

## 1. 为什么需要（背景）

- 主线程正在做背驰 change（`openspec/changes/add-chan-divergence/`）：
  - 趋势背驰 = 趋势（≥2 同向中枢）最后一个中枢的进入段 vs 离开段力度对比（缠师原文 24 课 A/B/C 三段）。
  - 前提：趋势链内中枢**不重叠**（中枢扩张会升级成更高级别中枢，不再是"同级别趋势"）。
- 现状：`DuanChannelCalculator`（`libs/chancore/src/internal/duan-channel.ts`）**没有处理中枢扩张**——
  mergeChannels 只按 mergeSpans 合并，可能残留波动区间重叠的同级中枢。
- 用户定调（08-20）：**趋势链（中枢）判据用 gg/dd**（波动区间高低点，不是 zg/zd 中枢区间）；
  **中枢扩张必须单独处理**，处理后中枢序列完全不会重叠，便于背驰趋势链直接消费。

## 2. 缠论原典考证（必须引用，勿臆造）

### 关键原文（《教你炒股票29：转折的力度与级别》）

> "缠中说禅背驰-转折定理：某级别趋势的背驰将导致该趋势最后一个中枢的**级别扩展**、该级别更大
> 级别的盘整或该级别以上级别的反趋势。"

> "这种只触及最后一个中枢的 `DD=min(dn)` 的反弹，就是背弛后最弱的反弹，这种反弹，**将把最后一个
> 中枢变成一个级别上的扩展**，例如，把5分钟的中枢扩展成30分钟甚至更大的中枢。"

> "在上面的a+A+b+B+c里，如果B+c发生中枢扩展，从5分钟扩展成30分钟的，那么a+A+b就是一个5分钟的
> 走势类型，把a+A+b用a~表示，而B+c发生中枢扩展用A~表示，那么整个走势就表示成a~+A~，其后的走势
> 还可以继续演化，形成a~+A~+b~+B~+c~，也就是扩展成一个30分钟级别的下跌。"

### 关键概念（对照已考证的 17 课、24 课）

- 中枢 = "至少三个连续次级别走势类型所重叠的部分"（17 课），无方向、对称重叠（zg=min高点、
  zd=max低点、gg=最高、dd=最低）——现有 `ChanDuanChannel` 字段即此。
- **中枢扩张（扩展）**：次级别走势离开中枢后，回抽**触及但未穿越**原中枢的波动区间
  （向上看 `GG`、向下看 `DD`），导致**两个相邻同级别中枢合并成一个更高级别中枢**（5m→30m）。
  即：扩张 = 后中枢波动与前一中枢波动**重叠** → 级别升级。
- **中枢新生（趋势延续）**：新中枢与原中枢波动区间**完全不重叠**且方向一致 + 位置递进 →
  同级别趋势链（这正是背驰所要的）。

### 你需要进一步考证的（写 spec 前）

1. 扩张 vs 新生的**精确几何判定**（用 gg/dd）：后中枢的 GG/DD 触及/侵入前中枢的 [DD,GG] 波长区间
   即扩张？还是必须"中枢区间(zg/zd)重叠"才算？——以原文 + 用户 gg/dd 定调为准，形成可实现的
   判定谓词。
2. 扩张后如何**合并**：两个相邻同级中枢 → 一个大级别中枢，几何 = 覆盖两者的 gg/dd/zg/zd？
   还是只做**标记**（扩张标记/增大级别）？——决策点，与用户确认。
3. 与现有 `mergeChannels`/`mergeSpans` 的关系：是**新增一道扩张识别+合并**，嵌套/替换现有合并，
   还是改造——保持已有输出（phaseA/phaseB）契约方向不变，尽量纯增量。

## 3. 用户已拍板的决策（不可改）

| 决策 | 定案 |
|------|------|
| gg/dd | 中枢链/扩张判据用 **gg/dd**（波动区间高低点），不用 zg/zd |
| 处理形态 | 单独 change 处理中枢扩张；处理后中枢序列**完全不会重叠** |
| 位置递进 | 趋势链要求第二中枢比第一中枢整体更上（向上）或更下（向下） |

## 4. 你要交付的能力（What Changes 草案）

- `ChanCore` 输出中枢时（段级，也评估笔级是否需要同样处理）保证**两两不重叠**：识别扩张组合 →
  合并/升级，或标记为更高级别中枢，消除同级重叠。
- 输出契约：中枢序列（`ChanDuanChannel[]`）长度/顺序不变词义（仍两阶段 phaseA/phaseB），
  但 phaseB 中**不存在波动区间重叠的同级中枢**。
- 新增纯函数（internal）判定谓词：`isExpansion(prev, next)`（gg/dd）、`mergeExpansion` 等；
  不 export internal；`algorithmVersion` 保持 1；不恢复 persistence。
- 单测：扩张识别（触及不穿越/穿越/重叠/不重叠）、合并几何、位置递进、无重叠不变式（输出全部
  相邻对 dd 无重叠）、与原 mergeChannels 输出对比回归。
- 真实数据验证（scratch）：600519 段级中枢人工核对扩张合并。

## 5. 三步工作流（铁律，必须遵守）

**Mist 变更必须分三步走，每一步中间断开（停下来等用户确认后才进入下一步），不得一口气连做：**

1. **创建 spec**：写 OpenSpec change（proposal / design / tasks / specs delta，可含
   `implementation-plan`），`openspec validate --all --strict` 通过后**停下来**，
   把 spec 的关键决策点逐条列给用户确认（Capabilities 归属、命名、模块形态、与现有架构关系）。
2. **写实施计划**：spec 确认通过后，先产出"具体代码怎么落地"的实施计划（文件级改动、函数签名、
   测试用例、验证命令），写完**停下来**等用户确认。
3. **落地**：实施计划确认后，才建 worktree 写代码 / 单测 / 校验 / 合并。

背景教训（用户 2026-08-07）：写完 spec 直接写码跳过确认 → 全部回退重来。规范要求：
- 规划（spec/change）用 openspec 写；实施计划用普通 markdown。
- 重要产出必须展示在对话界面（用户远程看不到文件）。
- 涉及公共契约/数据库时先读 `mist/docs/project-quality-governance-guide.md`。

## 6. change 命名与落点（建议，可和用户确认）

- 目录：`openspec/changes/` 下，建议 `add-chan-central-extension` 或 `handle-chan-zhongshu-expansion`。
- Capability：可扩展 `chan-analysis-core`（新建 central-extension capability 或并入），
  在 spec 中说明与 `chan-analysis-http-contract` 无关（无 HTTP 端点）。
- 与 add-chan-divergence 的耦合：本 change **先于** add-chan-divergence 落地；背驰趋势链
  （含非扩张+位置递进）改为**消费本 change 的"不重叠中枢"输出**——两 change 的 design/tasks
  需互相引用（背驰 change 里"非扩张"判定可简化/移除，改依赖本能力）。

## 7. 参考代码与基线

- `libs/chancore/src/internal/duan-channel.ts` — DuanChannelCalculator（3段/对称重叠/mergeSpans）
- `libs/chancore/src/internal/channel.ts` — 笔级 ChannelCalculator（方向性几何，冻结基线勿改）
- `libs/chancore/src/contracts.ts` — ChanDuanChannel（zg/zd/gg/dd/duans/...）
- `libs/chancore/src/internal/span-merge.ts`、`min-max-by.ts` — 合并帮手
- `libs/chancore/src/chancore-boundary.guard.spec.ts` — 纯净边界守卫样例
- `libs/chancore/src/chan-full-output.characterization.spec.ts` — 指纹差分（合并动作若改输出，
  此 spec 的 expected hash 会变——**若有变化必须专项评审**，不得静默更新）
- 缠论原文（可参考）：`/tmp/chan-29.md`（29课全文，主线程已抓取）
- 相关记忆：`chan-bi-definition-and-duan-algorithm.md`、`chan-duan-channel-change.md`、
  `chan-duan-segment-change.md`、`add-chan-divergence-paused.md`

## 8. 环境注意

- `cd` 会触发权限提示；用 `node -e "process.chdir('...'); execSync('...')"` 模式跑命令。
- 包管理：pnpm（**不是 npm**，`--legacy-peer-deps` 会报错）；jest 脚本带 `--forceExit`。
- worktree 在 `mist/.worktrees/` 下（仓库内部）；跑命令前先 verify pwd。
- 推送用 gh credential + `origin-https`（本机 SSH 不可用）。
- openspec validate 命令：`/Users/moyui/Library/pnpm/bin/openspec validate --all --strict`
  （npm 全局 openspec 不可用）。

## 9. 完成定义 / 回报

完成前回到主线程交互：验证通过（lint/typecheck/test:ci/ci:contracts/build:docker/validate 全绿）+
spec 门禁确认 + 合并 master。报告要区分：通过 / 跳过 / 环境阻塞 / 真实数据 HIL（600519 扩张样例）。
