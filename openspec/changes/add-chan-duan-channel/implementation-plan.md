# 实施计划 — add-chan-duan-channel（段级中枢）

> 三步工作流第二步。代码级实施计划，非 openspec 产物。spec 见同目录 proposal/design/tasks/specs。
> 落地（写码）须经用户确认本计划后才开始（第三步）。

## 0. 规范遵循

- 严格按 `mist/docs/project-quality-governance-guide.md` 与本 change 的 spec delta 实施。
- 段级中枢为 ChanCore **纯增量**：不改 `mergeK/findFenxings/createBi/createChannels/createDuan` 任何输出；
  不触碰笔级 `ChannelCalculator`（其方向性几何为冻结基线）；不引入 TypeORM/Redis/HTTP/Nest/env 依赖进
  `libs/chancore`；不恢复 Chan persistence；不做背驰/买卖点。
- 中枢**无方向**（缠论原典 17课）：`ChanDuanChannel` 无 `trend`；几何为**对称重叠**（zg=min 段高点、
  zd=max 段低点、gg/dd 极值），无首末段突破约束；**3 段滑窗**（原典：至少三个连续次级别走势类型重叠）。
- `algorithmVersion` 保持 1；新 internal 不从 barrel 导出。
- **代码编排镜像笔级 `ChannelCalculator`**（用户指令）：方法组织对齐（enumerate/detect/validateGeometry/
  extend/merge + mergeSpans 谓词），差异仅输入/几何/窗口/字段；实在不一致处不强求。

## 1. 分支与 worktree

- 在 `mist` 仓库建 worktree：`mist/.worktrees/feat-add-chan-duan-channel`，分支 `feat/add-chan-duan-channel`，
  基于当前 master（`ce539e73`）。
- 命令用 `node -e "process.chdir('...'); execSync('...')"` 模式（避免 cd 权限提示）；包管理用 `pnpm`。
- 推送用 gh credential + `origin-https`（本机 SSH 不可用，见记忆）。

## 2. 改动文件总览

| 仓库/目录 | 文件 | 动作 |
|---|---|---|
| libs/chancore/src | `contracts.ts` | 新增 `ChanDuanChannel`、`ChanDuanChannelTwoPhaseResult` |
| libs/chancore/src/internal | `duan-channel.ts` | **新增** `DuanChannelCalculator`（镜像 ChannelCalculator 结构） |
| libs/chancore/src | `chan-core.ts` | facade 加 `createDuanChannels` |
| libs/chancore/src | `index.ts` | barrel 导出新类型 |
| libs/chancore/src/internal | `duan-channel.spec.ts` | **新增** 段级中枢单测 |
| libs/chancore/src | `chan-core.spec.ts` | 加 createDuanChannels 空输入/确定性 |
| apps/mist/src/chan/types | `chan-analysis.types.ts` | 加 ChanDuanChannel/TwoPhaseResult（镜像） |
| apps/mist/src/chan/vo | `duan-channel.vo.ts` | **新增** DuanChannelVo + DuanChannelTwoPhaseVo |
| apps/mist/src/chan | `chan-core.mapper.ts` | 加 `toDuanChannelVo` |
| apps/mist/src/chan | `chan.service.ts` | 加 `createDuanChannels` |
| apps/mist/src/chan | `chan.controller.ts` | 加 `POST /v1/chan/duan-channel` |
| apps/mist/src/chan | `chan-core.mapper.spec.ts` / `chan.service.spec.ts` / `chan.controller.openapi.spec.ts` | 加用例 |

## 3. libs/chancore — 契约（contracts.ts）

```ts
export interface ChanDuanChannel {
  readonly duans: readonly ChanDuan[];   // 构成中枢的段（枚举窗口/延伸后）
  readonly zg: number;                   // = min(duans 高点)
  readonly zd: number;                   // = max(duans 低点)
  readonly gg: number;                   // = max(duans 高点)
  readonly dd: number;                   // = min(duans 低点)
  readonly level: ChannelLevel;          // = ChannelLevel.Duan（接线）
  readonly type: ChannelType;
  readonly status: ChannelStatus;
  readonly startId: number;              // 原始 K id
  readonly endId: number;
  readonly displayStartId: number;       // 首段中间位置原始 K id
  readonly displayEndId: number;
}

export interface ChanDuanChannelTwoPhaseResult {
  readonly phaseA: readonly ChanDuanChannel[];
  readonly phaseB: readonly ChanDuanChannel[];
}
```

> 无 `trend`（中枢无方向）；barrel 导出；不导出 internal calculator。

## 4. 段级中枢算法（internal/duan-channel.ts，镜像 channel.ts 结构）

```ts
export class DuanChannelCalculator {
  createDuanChannels(duans: readonly ChanDuan[]): ChanDuanChannelTwoPhaseResult
  // = { phaseA: enumerateChannels(duans), phaseB: mergeChannels(phaseA, duans) }

  // Phase A：3 段滑窗枚举（镜像 enumerateChannels；窗口 3 而非 5）
  private enumerateChannels(duans: readonly ChanDuan[]): ChanDuanChannel[]
  // 每个起点尝试 3 段窗口 → detectChannel → 印 Valid/Invalid，步进 1

  private detectChannel(threeDuans, originalDuans, startIndex): ChanDuanChannel | null
  // 验证1：validateTrendAlternating（3 段交替）
  // 验证2：validateChannelGeometry（对称重叠）→ zg/zd/gg/dd
  // 构建 ChanDuanChannel（level=Duan, type=Complete, status 由 isCandidateChannelValid 印）

  private validateChannelGeometry(duans): { zg, zd, gg, dd } | null
  // 对称重叠：zg = min(duans.high), zd = max(duans.low), gg = max(duans.high), dd = min(duans.low)
  // 有效：duans.length >= 3 && zg > zd；无方向、无突破约束

  private isCandidateChannelValid(channel): boolean
  // = channel.duans.length >= 3 && channel.zg > channel.zd

  private validateTrendAlternating(duans): boolean   // 相邻段趋势交替（镜像）

  // Phase B：延伸 + 重合合并（镜像 mergeChannels）
  private mergeChannels(phaseAChannels, duans): ChanDuanChannel[]
  // 步骤1 延伸：extendChannel（首尾各 ±2 段成对，对称重叠合法则延伸）
  // 步骤2 重合合并：mergeSpans(extended, { isCompleteItem, isSameDirection: channelsOverlapInTime,
  //   spanHasInvalid: () => true, canMergeTwo, middleFitsEnvelope, mergeTwo, stampStatus })

  private extendChannel(channel, duans): ChanDuanChannel      // 镜像
  private buildChannelFromDuans(duans, originalDuans, startIndex, geometry): ChanDuanChannel
  // displayStartId/displayEndId = 首/末段 originIds 中位原始 K id（镜像 buildChannelFromBis）

  // mergeSpans 谓词（与笔级同构，方向无关）：
  private channelsOverlapInTime(head, tail): boolean          // 时间区间交集
  private canMergeTwoChannels(head, tail): boolean            // [zd,zg] 价格交集 + 合并后 zg>zd
  private middleChannelsFitEnvelope(span): boolean            // 中间中枢与合并 zone 价格交集
  private mergeTwoChannels(head, tail): ChanDuanChannel       // 去重合并 duans + 重算几何
}
```

关键差异（vs channel.ts）：输入 `ChanDuan[]`；窗口 3 段；`validateChannelGeometry` 对称（无 isUp 前后
N-1 拆分、无 A.low<dd/E.high>gg 约束）；无 `trend`；`level=Duan`；`duans` 字段。

## 5. Facade（chan-core.ts）

```ts
static createDuanChannels(duans: readonly ChanDuan[]): ChanDuanChannelTwoPhaseResult {
  return new DuanChannelCalculator().createDuanChannels(duans);
}
```
- 入参 = `createDuan` 返回值；组合 `createDuanChannels(createDuan(createBi(k).phaseB))`。
- 空输入：`{ phaseA: [], phaseB: [] }`，非错误。

## 6. app 层（apps/mist/src/chan，镜像 bi/channel）

- **types/chan-analysis.types.ts**：加 `ChanDuanChannel`/`ChanDuanChannelTwoPhaseResult`（镜像，duans: ChanDuan[]）。
- **vo/duan-channel.vo.ts**：`DuanChannelVo implements ChanDuanChannel`（duans: DuanVo[]、zg/zd/gg/dd、
  level: ChannelLevel、type/status、startId/endId/displayStartId/displayEndId，**无 trend**）+ `DuanChannelTwoPhaseVo`。
- **chan-core.mapper.ts**：`toDuanChannelVo(channel)`（duans: channel.duans.map(toDuanVo)，余直传）。
- **chan.service.ts**：
  ```ts
  createDuanChannels(createBiDto: CreateBiDto) {
    const bis = ChanCore.createBi(createBiDto.k.map(toChanK));
    const duans = ChanCore.createDuan(bis.phaseB);
    const result = ChanCore.createDuanChannels(duans);
    return { phaseA: result.phaseA.map(toDuanChannelVo), phaseB: result.phaseB.map(toDuanChannelVo) };
  }
  ```
- **chan.controller.ts**：`POST /v1/chan/duan-channel`（≡ `/v1/chan/channel` 模式，@Throttle 20/min，
  @ApiEnvelopeResponse({ type: DuanChannelTwoPhaseVo })）。

## 7. 测试计划

### 7.1 段级中枢 pure 单测（duan-channel.spec.ts，用 makeDuan 构造）
- 空输入 / <3 段 → `{ phaseA: [], phaseB: [] }`。
- 3 段滑窗：3 段交替 + 对称重叠 → 出基础中枢；`zg = min(3 段高点)`、`zd = max(3 段低点)`。
- `zg === zd` → Invalid，不进 phaseB。
- 延伸：±2 段成对，对称重叠合法 → 中枢扩大。
- 重合合并：时间+价格双重叠 → 合并；`mergeSpans` 短跨度优先/最左优先。
- 交替方向校验；display ID = 段 originIds 中位原始 K id。
- 尾段（UnComplete）不足 3 段不成中枢。

### 7.2 facade（chan-core.spec.ts）
- `createDuanChannels([])` → `{ phaseA: [], phaseB: [] }`；确定性。

### 7.3 真实数据 fixture
- 拉长窗口 600519 日 K（如 `param=sh600519,day,,,500,qfq`，Tencent API）确保 ≥3 段；
  或 30m 周期。固化段级中枢 fingerprint（结构/值/枚举/顺序/null/Date）。

### 7.4 app 层
- mapper：toDuanChannelVo 字段映射、duans 递归 high/low、无 trend、无 highest/lowest。
- service：createDuanChannels 组合链路 + 空输入。
- openapi：/v1/chan/duan-channel 返回 {phaseA,phaseB} envelope、DuanChannelTwoPhaseVo。

## 8. 验证命令（受影响仓库基线）

```bash
pnpm run lint:check
pnpm run typecheck
env TZ=UTC pnpm run test:ci
pnpm run ci:contracts
pnpm run build:docker
openspec validate --all --strict
```
- 全绿才合 master；报告区分 通过/跳过/环境阻塞/待 HIL。
- 检索：`libs/chancore` 无禁用 import；未触碰笔级 `ChannelCalculator`；未接线以外的 `ChannelLevel.Duan`
  误用；无 `highest/lowest`。

## 9. 非目标 / 开放实现问题

- **不做**：背驰、买卖点、持久化、migration、改笔级中枢、多级别递归。
- **开放问题（实施时定，记回 design）**：
  1. 3 段窗口的"第 4/5 段重叠"判定无了——3 段候选只需趋势交替 + zg>zd；确认无误。
  2. 延伸 ±2 段后对称重叠是否要求"所有段参与 min/max"（推荐：是——构成段=窗口+延伸全部）。
  3. `ChanDuanChannel.duans` 是否含"进入/离开段"（推荐：含，即枚举窗口/延伸后全部，与 `bis` 语义对齐）。
  4. fixture 若 600519 日 K 500 根仍不足 3 段（应够），备选 30m 数据。

## 10. 落地顺序（第三步，待本计划确认后）

1. 建 worktree/分支 → contracts + barrel → duan-channel.ts + 单测（镜像 channel.ts 结构）。
2. facade createDuanChannels + chan-core.spec。
3. app 层 vo/mapper/service/controller + 用例。
4. 真实数据 fixture（长窗口 600519）→ 指纹固化。
5. 全量基线验证 → 报告 → 等用户确认 → 合 master → push。
