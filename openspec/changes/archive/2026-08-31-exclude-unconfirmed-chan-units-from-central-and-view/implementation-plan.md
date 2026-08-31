# Implementation Plan: exclude-unconfirmed-chan-units-from-central-and-view

> 代码级落地计划（对应 `openspec/changes/exclude-unconfirmed-chan-units-from-central-and-view/` 四件套）。
> 改动语义已知会项已实证：段中枢 4=4 输出不一致（未确认尾段参与）；笔中枢全量=剔 invalid 一致（显式化）；
> invalid/unknown 笔均落惰性区（Complete 段零污染，性质锁定）。全量回归基线：master chancore 178 tests。

## 0. 工作环境

- worktree：`mist/.worktrees/exclude-unconfirmed-chan-units`（基于 master，落地后合回）
- `ln -sfn ../../node_modules node_modules`；jest 加 `--watchman=false --forceExit`
- git 提交：算法+版本 1 commit，收尾（归档/部署）随后独立 commit

## 1. chancore：显式过滤（三处入口）

### 1.1 段级中枢 `duan-channel.ts` `createDuanChannels`

```ts
createDuanChannels(
  duans: readonly ChanDuan[],
): ChanDuanChannelTwoPhaseResult {
  // 未确认/无效段（status !== Valid；现时 = UnComplete 尾段 endBi===null）不进入中枢统计：边界待定，
  // 参与中枢几何无客观性（18 课"前三个次级别走势类型都是完成的才构成中枢"）。
  // 数据层 createDuan 输出保持不变。
  const confirmed = duans.filter((d) => d.status === DuanStatus.Valid);
  const phaseA = this.enumerateChannels(confirmed);
  const merged = this.mergeChannels(phaseA, confirmed);
  const phaseB = resolveCentralExpansions(merged, mergeDuanCentralExpansion);
  return { phaseA, phaseB };
}
```

- `DuanStatus` 需已在 duan-channel.ts imports（检查；缺则补 `import { DuanStatus } from '../contracts'`）
- 空确认集 → `enumerateChannels([])` → 空输出（与空输入场景一致）

### 1.2 笔级中枢 `channel.ts` `createChannels`

```ts
createChannels(data: readonly ChanBi[]): ChanChannelTwoPhaseResult {
  const confirmed = data.filter((b) => b.status === BiStatus.Valid); // invalid/未知不构成中枢
  const phaseA = this.enumerateChannels(confirmed);
  const merged = this.mergeChannels(phaseA, confirmed);
  const phaseB = resolveCentralExpansions(merged, mergeBiCentralExpansion);
  return { phaseA, phaseB };
}
```

- 实测输出与现状完全一致（tdx 1=1）；此过滤为显式防御（性质由代码保证，非数据偶然）
- `BiStatus` 需已 import（检查）

### 1.3 版本 `chan-core.ts`

- `algorithmVersion` 5 → 6；注释补"5→6：仅确认且有效的笔/段进入笔段中枢（invalid/未确认单元排除）"

## 2. visual-command：不渲染非确认且有效单元

`libs/visual-command/src/adapters/chan-visual.adapter.ts`（需先通读函数入口确认输入结构）：

```ts
// 2.1 笔渲染循环：跳过非确认且有效笔
if (bi.status !== BiStatus.Valid) continue;

// 2.2 段渲染循环：跳过未确认段（替换现行 endBi ?? originBis[last] 实线兜底）
if (duan.status !== DuanStatus.Valid) continue; // 统一 status 判据（现时等价 endBi===null）

// 2.3 中枢渲染（笔中枢/段中枢）：构成单元含非确认且有效单元 → 不画（防御性；chancore 已保证）
//    遍历 channel.originBis / channel.duans（按实际字段名），任一 status !== Valid → continue
```

- imports 补 `BiStatus` / `DuanStatus`（按 adapter 现有枚举导入习惯）
- 确认的笔/段/中枢绘制命令完全不变

## 3. 买卖点（signal）：本 change **不改**（用户拍板后续再聊）

- `chan-bsp.pipeline.ts` 保持现状；spec delta 中 `units='bi'` 过滤规则作为**后续 change** 的契约
  （本 change 落地时不实施，避免与"暂缓"冲突）

## 4. 单测

### 4.1 `duan-channel.spec.ts` 新增

```ts
it('excludes an unconfirmed tail Duan from Duan-level Channel derivation', () => {
  const confirmed = [/* 现有 makeDuan Complete 段构造（≥3 段） */];
  const tail = makeDuan({ ..., type: DuanType.UnComplete, status: DuanStatus.Unknown, endBi: null });
  const full = new DuanChannelCalculator().createDuanChannels([...confirmed, tail]);
  const trimmed = new DuanChannelCalculator().createDuanChannels(confirmed);
  expect(full.phaseA).toEqual(trimmed.phaseA);
  expect(full.phaseB).toEqual(trimmed.phaseB);
});
```

- 若现有 `makeDuan` 无 UnComplete 构造，补一个（仅测试文件）
- 既有用例（全 Valid 输入）回归不受影响

### 4.2 `channel.spec.ts` 新增

```ts
it('excludes invalid/unconfirmed Bi from Bi-level Channel derivation', () => {
  // 构造含 1 根 Invalid 笔（status=BiStatus.Invalid）的 ≥5 笔序列：
  // 期望 createChannels(全量) 输出 === createChannels(剔除 invalid 后) 输出
});
```

### 4.3 版本断言与快照

- `chan-core.spec.ts:25` `toBe(5)` → `toBe(6)`
- `chan-full-output.characterization.spec.ts`：2 处 payload `algorithmVersion: 5` → `6`，SHA 重算回填
  （主管道不含 duan；duan-expansion fixture 输入全 Valid，输出不变——SHA 变化仅来自 payload 版本字段）
- 新增语义断言（防 SHA 失效无法定位）：
  - 主管道测试：bis/channels 输出与旧版一致（仅 payload version 字段变化）
  - 段中枢测试：含 UnComplete 尾段的输入 → 输出等于剔除尾段输入（与 4.1 同语义，数据层断言）

## 5. 全量验证（worktree 内）

```bash
node_modules/.bin/jest --watchman=false libs/chancore --runInBand --forceExit   # 178 + 新增
node_modules/.bin/jest --watchman=false libs/visual-command --runInBand --forceExit
node_modules/.bin/tsc --noEmit
node_modules/.bin/eslint "libs/chancore/src/**/*.ts" "libs/visual-command/src/**/*.ts" --fix
/Users/moyui/Library/pnpm/bin/openspec validate exclude-unconfirmed-chan-units-from-central-and-view
```

复现对照（/tmp 脚本，修复后应翻转）：
- `check-uncomplete-consumption.ts` → `段中枢：全量=剔尾段、输出一致? true`
- `survey-invalid.ts` → 笔中枢一致 + 段零污染不变

## 6. 收尾

- 合回 master + push（gh credential）
- spec 归档（`openspec archive -y`，失败降级 `--skip-specs` + 手工合 delta）
- 重新部署（会话确认时机与 image_tag；本次变化面：chan-backend/visual 出图在 mist-backend 容器，
  段/笔中枢口径变化随 mist 镜像发布，无 DB migration）
- issue 文档 §8.7 / AGENTS.md：追加本 change（中枢定论补"仅确认且有效单元进入统计与绘制"）

## 7. 风险与回退

- 行为变化面：段中枢输出变化（实证 4=4 不一致的尾巴收敛）、笔中枢输出不变（实证）；
  买卖点 duan 分支的 zhongshus 输入随之变化（预期连锁，代码不改）；
- 回退：单 commit 还原 1.1/1.2/1.3/2.x；version 一并还原（characterization SHA 已回填，还原需同步）