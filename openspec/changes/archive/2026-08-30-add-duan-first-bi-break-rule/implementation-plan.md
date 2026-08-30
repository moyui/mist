# Implementation Plan: add-duan-first-bi-break-rule

> 代码级落地计划（对应 `openspec/changes/add-duan-first-bi-break-rule/` 四件套）。
> 全部算法行为已在 `/tmp/duan-repro/duan-fixed.ts`（Decoy，keep 模式）预演验证：25 → 33 段、
> 8 处判据命中、判据作废场景零副作用（段#0/[33..37]/[58..60] 与原输出逐段一致）。

## 0. 工作环境

- worktree：`mist/.worktrees/add-duan-first-bi-break-rule`（基于 master，落地后合回）
- `cd mist/.worktrees/add-duan-first-bi-break-rule && ln -s ../../node_modules node_modules`（@app/* 用 tsconfig paths，不依赖链接）
- git 提交：单一 commit 或按 Phase 分 2 commit（算法+单测 / 版本+快照），最终合 master 后 push

## 1. 算法改造（`libs/chancore/src/internal/duan.ts`）

### 1.1 `findSegmentEnd` 改动（唯一行为改动点）

现有结构（`first !== null && isDirectionalFenxing(...)` 分支 + 无条件 `mergeFeatureInclusion` 吞并）之外，
在 `first === null` 时**先执行 71 课判据**再吞并：

```ts
// duan.ts findSegmentEnd 内，替换现有：
//   if (first !== null && this.isDirectionalFenxing(...)) { ...case1/case2... }
// 为：
if (first !== null && this.isDirectionalFenxing(first, prev, rev, direction)) {
  const endIdx = prev.biIndex - 1;
  if (endIdx >= segStartIdx) {
    if (!this.hasGap(first, prev)) {
      return { endIdx, nextStart: prev.biIndex };        // case-1 不变
    }
    const extremum = direction === TrendDirection.Down ? prev.low : prev.high;
    if (this.case2Confirmed(bis, prev.biIndex, direction, extremum)) {
      return { endIdx, nextStart: prev.biIndex };        // case-2 不变
    }
  }
} else if (first === null) {
  // —— 新增：缠论 71 课「第一笔破坏」——
  // 转折笔 prev 是段内第一根反向笔（假设转折点前无特征序列元素，67 课分型结构无法成立）。
  // 转笔延伸≥3 笔且其后的同向笔破转笔终点 → 段在假设转折点（prev 起点）确认结束；
  // 段向笔先破转笔起点（= 假设转折点极值）→ 旧段延续，判据作废（71 课复杂分支，先到者定论）。
  if (this.firstBiBreak(bis, prev, direction) === 'confirmed') {
    return { endIdx: prev.biIndex - 1, nextStart: prev.biIndex };
  }
}
// 判据 extended/none（或分型不成立）→ 沿用现有吞并：stdSeq = mergeFeatureInclusion(...)
```

语义要点（预演实证）：
- 判据**只**在 `first === null` 触发——**正常段的既有行为完全不变**（段#0、[33..37]、[58..60]
  等 17 处 first 非空场景回归验证为零副作用）；
- `confirmed` 时 `endIdx === prev.biIndex - 1 === segStartIdx`（转笔必为段起点后第一笔，
  方向交替）→ **判据确认的段恒为单笔**，`buildDuan` 无需改动即可构建。

### 1.2 新增私有方法 `firstBiBreak`（直接采用已预演验证的 duan-fixed.ts 版本）

```ts
/** 71 课第一笔破坏判据（方向对称；扫描从转笔下一笔起，按时间顺序竞争，先到者定论，无界）。 */
private firstBiBreak(
  bis: readonly ChanBi[],
  prev: FeatureElement,          // 转笔 = 段内第一根反向笔（从假设转折点开始）
  direction: TrendDirection,     // 当前段方向
): 'confirmed' | 'extended' | 'none' {
  const turnEnd = direction === TrendDirection.Up ? prev.low : prev.high;   // 转笔终点（破位目标）
  const turnStart = direction === TrendDirection.Up ? prev.high : prev.low; // 转笔起点（= 假设转折点极值）
  for (let i = prev.biIndex + 1; i < bis.length; i++) {
    const bi = bis[i];
    if (direction === TrendDirection.Up) {
      // 转笔 Dn：Dn 笔（第 3 笔起）破转笔终点 → 确认；Up 笔破转笔起点 → 延续
      if (bi.trend === TrendDirection.Down && bi.low < turnEnd) return 'confirmed';
      if (bi.trend === TrendDirection.Up && bi.high > turnStart) return 'extended';
    } else {
      // 转笔 Up：Up 笔（第 3 笔起）破转笔终点 → 确认；Dn 笔破转笔起点 → 延续
      if (bi.trend === TrendDirection.Up && bi.high > turnEnd) return 'confirmed';
      if (bi.trend === TrendDirection.Down && bi.low < turnStart) return 'extended';
    }
  }
  return 'none'; // 无突破 → 不确认，走常规吞并流程
}
```

预演已踩过的坑（勿回退）：
- 扫描**必须从 `prev.biIndex + 1` 开始**（第 2 笔也可能先破起点 → 立即作废）；曾误从判据触发点
  之后开始，把「反弹破前顶」误判为破位（段#0 误伤）；
- **只有与转笔同向的笔**可判「破转笔终点」（第 2 笔是反向笔，天然只参与破起点竞争）；
- 破位用严格 `<`/`>`（65 课 `dj<=gi` 含等号的问题在 spec 决策点已记录，本版保持严格，与
  `isDirectionalFenxing` 现有口径一致）。

## 2. 单测用例（`libs/chancore/src/internal/duan.spec.ts`，复用现有 `makeBi`）

### 2.1 用例 1：判据确认 → 单笔 Complete 段（锚点 A 构型，Up）

```ts
it('confirms a single-Bi Duan via the lesson-71 first-Bi-break rule', () => {
  const bis: ChanBi[] = [
    makeBi('up', 8, 4, 0),    // 段体：Up 一笔到顶 8（假设转折点 = bi#0 终点）
    makeBi('down', 8, 5, 1),  // 转笔 Dn：8 → 5（终点 5）
    makeBi('up', 8, 5, 2),    // 第 2 笔 Up：high=8 不破起点 8（严格 >）→ 无结论
    makeBi('down', 8, 4, 3),  // 第 3 笔 Dn：low=4 < 转笔终点 5 ✓ → confirmed
  ];
  const result = new DuanCalculator().createDuan(bis);
  expect(result).toHaveLength(2);
  expect(result[0].type).toBe(DuanType.Complete);
  expect(result[0].trend).toBe(TrendDirection.Up);
  expect(result[0].originBis).toHaveLength(1);   // 单笔段
  expect(result[0].startBi).toBe(bis[0]);
  expect(result[0].endBi).toBe(bis[0]);          // startBi === endBi
  expect(result[0].high).toBe(8);
  expect(result[0].low).toBe(4);
  expect(result[1].startBi).toBe(bis[1]);        // 新 Dn 段从转笔起
  expect(result[1].type).toBe(DuanType.UnComplete);
});
```

### 2.2 用例 2：判据作废 → 旧段延续（与旧逻辑一致，3 笔段照常确认）

```ts
it('voids the lesson-71 rule when the turning Bi is broken from its start first', () => {
  const bis: ChanBi[] = [
    makeBi('up', 8, 4, 0),    // 段体 Up
    makeBi('down', 8, 6, 1),  // 转笔 Dn：8 → 6
    makeBi('up', 10, 6, 2),   // 第 2 笔 Up high=10 > 转笔起点 8 → extended（先破起点）
    makeBi('down', 10, 7, 3),
    makeBi('up', 9, 7, 4),
    makeBi('down', 9, 4, 5),  // 分型 (bi#1, bi#3, bi#5)：bi#3.high=10 最高 → case1
  ];
  const result = new DuanCalculator().createDuan(bis);
  expect(result[0].type).toBe(DuanType.Complete);
  expect(result[0].originBis).toHaveLength(3);   // [bi#0..bi#2] 正常 3 笔段，未被截成单笔
  expect(result[0].endBi).toBe(bis[2]);
});
```

### 2.3 用例 3：判据确认的 Dn 对称方向（锚点 B 同构）

```ts
it('confirms a single-Bi Duan via the lesson-71 rule for a downward segment', () => {
  const bis: ChanBi[] = [
    makeBi('down', 9, 5, 0), // 段体 Dn：9 → 5（假设转折点 = bi#0 终点底 5）
    makeBi('up', 9, 5, 1),   // 转笔 Up：5 → 9（终点 9）
    makeBi('down', 8, 5, 2), // 第 2 笔 Dn：low=5 不破起点 5 → 无结论
    makeBi('up', 10, 8, 3),  // 第 3 笔 Up high=10 > 转笔终点 9 ✓ → confirmed
  ];
  const result = new DuanCalculator().createDuan(bis);
  expect(result[0].type).toBe(DuanType.Complete);
  expect(result[0].trend).toBe(TrendDirection.Down);
  expect(result[0].originBis).toHaveLength(1);
  expect(result[0].endBi).toBe(bis[0]);
  expect(result[1].startBi).toBe(bis[1]);
});
```

### 2.4 回归

- 现有 6 个用例（case1 / case2 confirmed / case2 not confirmed / 确定性 / 空序列）必须原样通过；
- 尤其是「does not end a segment on an unconfirmed gap fenxing」用例的序列（转笔 bi#3 后第 2 笔
  bi#4 high=13 > 起点 13？需核对不触发判据——见 2.5）。

### 2.5 既有用例影响核对（必做）

现有「case 2 not confirmed」序列：`Up(8,4), Dn(8,5), Up(13,5), Dn(13,9), Up(11,9), Dn(11,7), Up(10,7)`：
- `first===null` 在第二反向笔 bi#5 到达时触发，转笔=bi#3（Dn 13→9，起点 13、终点 9）；
- 第 2 笔 bi#4（Up high=11）：`11 > 13`? 否；第 3 笔 bi#6（Dn low=7）：`7 < 9` ✓ → **confirmed**！
  → 该用例预期从「end=null → 整条 UnComplete」变为「段#0 = 单笔 [bi#2..2] + 尾段」——**现用例断言会失败，需按新语义更新断言并改名/补注**（这正是 71 课判据的正确行为：13 顶处转笔三笔破位）。
  同上检查「case 2 confirmed」用例（`Up(8,4), Dn(8,5), Up(13,5), Dn(13,9), Up(11,9)...` 同构 →同样触发）。
  → **duan.spec.ts 现有 2 个 case2 用例要为 71 课判据的介入做断言更新**（不改序列，改预期）。

## 3. 版本契约

| 文件 | 改动 |
|------|------|
| `libs/chancore/src/chan-core.ts:27` | `algorithmVersion = 4` → `5`（注释补 71 课判据说明） |
| `libs/chancore/src/chan-core.spec.ts:25` | `toBe(4)` → `toBe(5)` |
| `libs/chancore/src/chan-full-output.characterization.spec.ts` | 2 处 payload `algorithmVersion: 2` → `5`（含注释），对应 2 个 SHA 常量重算回填 |

## 4. Characterization 快照

### 4.1 新增 fixture：`libs/chancore/src/chan-duan-anchor.characterization.fixture.ts`

- 内容：真实 5m/qmt/000001 K，时间窗 **2026-06-17 09:35 ~ 2026-06-30 15:00（上海）**（10 个交易日
  × 48 根 ≈ 480 根），覆盖锚点 A 全链：bi#33(06-18 10:05 顶 4117.45) → Dn[33..37] → Up[38..38]
  （06-23 10:40 顶 4175.35）→ Dn[39..45](06-29 10:20)；
- 生成：落地时从 `/tmp/k_full.csv` 按 `timestamp` 窗口提取（保留原始 `id`），一次性生成 TS 数组；
- 导出 `createChanDuanAnchorFixture(): ChanCharacterizationK[]`（复用现有接口类型）。

### 4.2 新增测试（`chan-full-output.characterization.spec.ts` 追加）

```ts
it('locks the lesson-71 first-Bi-break Duan outcomes on the 5m 000001 anchor window', () => {
  const k = createChanDuanAnchorFixture();
  const { phaseB: bis } = ChanCore.createBi(k);
  const duans = ChanCore.createDuan(bis);
  // 语义断言（防 SHA 失效时无法定位）：
  // 1) 存在单笔 Complete Up 段，其 endBi.endTime === 2026-06-23T02:40:00.000Z（10:40 上海）
  // 2) 该单笔段的后一段为 Dn，startBi.startTime 同刻 → 10:40 顶是段边界
  // 3) 无任何段跨过 4175.35 极值（段内 high === 4175.35 的段端点即该极值）
  const payload = { algorithmVersion: 5, bis: bis.map(toContractBi), duans: duans.map(toContractDuan) };
  const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  expect(fingerprint).toBe(EXPECTED_DUAN_71_SHA256); // 首次跑出后回填
});
```

### 4.3 SHA 回填流程

1. 改完 4.1/4.2 + §3 的 payload 后跑 `jest libs/chancore/src/chan-full-output.characterization.spec.ts`，
   取 3 个失败断言里的实际 SHA；
2. 回填 `EXPECTED_FULL_OUTPUT_SHA256` / `EXPECTED_DUAN_EXPANSION_SHA256` / `EXPECTED_DUAN_71_SHA256`
   （前两个仅因 payload `algorithmVersion` 2→5 变化，主管道 bis/channels 输出不变）；
3. 重跑至全绿，diff 复核：主管道 fingerprint 的 `input/output` 部分不得有任何变化。

## 5. 全量验证与回归（worktree 内执行）

```bash
# 1) 目标单测
node_modules/.bin/jest libs/chancore/src/internal/duan.spec.ts --runInBand
# 2) chancore 全量（174 基线 + 新增）
node_modules/.bin/jest libs/chancore --runInBand --forceExit
# 3) 全量段端点与预演核对（可选但有力）：把 /tmp/duan-repro/compare.ts 的 import 指向
#    worktree 的 duan.ts，重跑三模式对比，确认 keep 模式 33 段与预演逐段一致
# 4) 类型与 lint
pnpm typecheck && pnpm lint:check
# 5) spec 校验
/Users/moyui/Library/pnpm/bin/openspec validate add-duan-first-bi-break-rule
```

回归关注点：
- `duan-channel.spec.ts` / `central-expansion.spec.ts` / `buy-sell-point.spec.ts` / `divergence.spec.ts`
  若因合成序列的段形态变化翻车 → 逐一定性：属于「新语义的正确断言更新」还是「判据误伤」；
- characterization 主管道输出（bis/channels）必须与旧版一致（第 3 个用例第 1 个测试不翻车 =
  唯一变化在 duan 层）；
- 预演数据对照：25→33 段的差异必须恰好落在 8 处判据命中点（bi#10/38/53/57/66/93/102/137）。

## 6. 收尾

- `docs/duan-segment-issue-2026-08-30.md`：§8 追加「已修复」状态行（指向本 change），不改原诊断记录；
- worktree 合回 master（个人项目直接合），`git -c credential.helper='!f() { gh auth git-credential "$@"; }; f' push`；
- spec 归档（合 delta 进 live spec：`/Users/moyui/Library/pnpm/bin/openspec archive add-duan-first-bi-break-rule -y`，
  再手动 git commit + push）；AGENTS.md 算法定论补 71 课判据一条。

## 7. 风险与回退

- 判据误伤风险已由预演数据排除（8 命中 + 零副作用）；若全量回归出现未预见的段形态翻车，
  回退 = 还原 duan.ts 两处改动（`algorithmVersion` 一并还原），单 commit 结构便于 revert；
- `openspec archive` 的 CLI 对账风险：MODIFIED requirement 携带全部场景（已按 1.6.0 要求书写）；
  若 archive 失败，降级为 `--skip-specs` 纯 rename + 手工合并 delta（沿既有先例）。