# 实施计划 — add-chan-duan-segment

> 三步工作流第二步。本文件是代码级实施计划，非 openspec 产物。spec 见同目录 proposal/design/tasks/specs。
> 落地（写码）须经用户确认本计划后才开始（第三步）。

## 0. 规范遵循

- 严格按 `mist/docs/project-quality-governance-guide.md` 与本 change 的 spec delta 实施。
- 段为 ChanCore **纯增量**：不改 `mergeK/findFenxings/createBi/createChannels` 任何输出；不接线 `ChannelLevel.Duan`；
  不引入 TypeORM/Redis/HTTP/Nest/env 依赖进 `libs/chancore`；不恢复任何 Chan persistence；不做段级中枢/背驰/买卖点/严格笔。
- 价格比较口径与现有一致（严格/非严格 JS number、Date 毫秒、ID 精确整数；不引入 epsilon/rounding/Decimal）。
- `algorithmVersion` 保持 1；新 internal 不从 barrel 导出。

## 1. 分支与 worktree

- 在 `mist` 仓库（非外层工作区）建 worktree：`mist/.worktrees/feat-add-chan-duan-segment`，分支 `feat/add-chan-duan-segment`，基于当前 master。
- 个人项目不走 PR，确认后直接合 master；但代码先在 feat 分支验证全绿。
- 命令在 worktree 内执行用 `node -e "process.chdir('...'); execSync('...')"` 模式（避免 cd 权限提示）；包管理用 `pnpm`（禁 `--legacy-peer-deps`）。

## 2. 改动文件总览

| 仓库/目录 | 文件 | 动作 |
|---|---|---|
| libs/chancore/src | `contracts.ts` | 新增 `DuanType/DuanStatus/ChanDuan/ChanDuanTwoPhaseResult` |
| libs/chancore/src/internal | `duan.ts` | **新增** `DuanCalculator`（标准特征序列法） |
| libs/chancore/src/internal | `duan-range.ts` | **新增** 段级 range helper（collectBiRange/orderedDedupIds） |
| libs/chancore/src | `chan-core.ts` | facade 加 `createDuan` |
| libs/chancore/src | `index.ts` | barrel 导出新枚举/类型 |
| libs/chancore/src/internal | `duan.spec.ts` | **新增** 段算法单测 |
| libs/chancore/src | `chan-core.spec.ts` / `chan-full-output.characterization.spec.ts` | 加 createDuan 用例 + fingerprint |
| apps/mist/src/chan/enums | `duan.enum.ts` | **新增** re-export DuanType/DuanStatus |
| apps/mist/src/chan/types | `chan-analysis.types.ts` | 加 ChanDuan/ChanDuanTwoPhaseResult |
| apps/mist/src/chan/vo | `duan.vo.ts` | **新增** DuanVo + DuanTwoPhaseVo |
| apps/mist/src/chan | `chan-core.mapper.ts` | 加 `toDuanVo` |
| apps/mist/src/chan | `chan.service.ts` | 加 `createDuan` |
| apps/mist/src/chan | `chan.controller.ts` | 加 `POST /v1/chan/duan` |
| apps/mist/src/chan | `chan.service.spec.ts` / `chan-core.mapper.spec.ts` | 加 duan 用例 |

## 3. libs/chancore — 契约（contracts.ts）

镜像 `ChanBi`/`ChanBiTwoPhaseResult`，端点与构成单元升一层（Fenxing→Bi、K→Bi）：

```ts
export enum DuanType { UnComplete = 'uncomplete', Complete = 'complete' }      // ≡ BiType
export enum DuanStatus { Unknown = 0, Valid = 1, Invalid = 2 }                 // ≡ BiStatus

export interface ChanDuan {
  readonly startTime: Date;
  readonly endTime: Date;
  readonly high: number;
  readonly low: number;
  readonly trend: TrendDirection;
  readonly type: DuanType;
  readonly status: DuanStatus;
  readonly independentCount: number;
  readonly originIds: readonly number[];     // 段覆盖原始 K（笔 originIds 有序去重）
  readonly originBis: readonly ChanBi[];     // 构成段的笔（≡ ChanBi.originData 上一层）
  readonly startBi: ChanBi | null;           // ≡ ChanBi.startFenxing 上一层
  readonly endBi: ChanBi | null;             // Complete 非 null；尾段 null
}
```

> 段**无** `ChanDuanTwoPhaseResult`：`createDuan` 返回确认后的 `ChanDuan[]` 单数组（用户拍板删除 phaseA）。
> `DuanType/DuanStatus` 与 `BiType/BiStatus` 同构但**独立命名**（不合并），保清晰；值与语义一一对应。

## 4. libs/chancore — 段算法（internal/duan.ts）

### 4.1 内部类型
```ts
/** 特征序列元素：一根反向笔视为一根"准K线"（high/low = 笔高低点） */
interface FeatureElement {
  readonly high: number;
  readonly low: number;
  readonly biIndex: number;   // 对应反向笔在输入 bis 中的下标
}
/** 特征序列分型（向上段只产 Top，向下段只产 Bottom） */
interface FeatureFenxing {
  readonly type: FenxingType;
  readonly firstElement: FeatureElement;   // 第71课"第一元素"
  readonly secondElement: FeatureElement;  // 第71课"第二元素"
  readonly extremum: number;               // 顶=high / 底=low
}
```

### 4.2 DuanCalculator 公共签名
```ts
export class DuanCalculator {
  createDuan(bis: readonly ChanBi[]): ChanDuanTwoPhaseResult
}
```
- `bis` 是 `createBi` 的 **Phase B**（已保证严格交替）。
- `bis.length < 3` → `{ phaseA: [], phaseB: [] }`（段至少需 3 笔）。

### 4.3 状态机（核心，单遍递推 + 第二种情况回溯）

状态变量：
```ts
interface SegState {
  direction: TrendDirection;          // 当前段方向（由段首笔决定）
  startBiIndex: number;               // 当前段在 bis 中的起始下标
  featureSeq: FeatureElement[];       // 当前标准特征序列（反向笔 + 包含处理后）
  pending: PendingSecondCase | null;  // 第二种情况"待确认"
}
interface PendingSecondCase {
  segStartBiIndex: number;            // 待确认段的起点
  assumeEndBiIndex: number;           // 假设终点（分型极值处）
  reverseDirection: TrendDirection;   // 反向新段方向
  reverseFeatureSeq: FeatureElement[];// 反向新段特征序列
}
```

转移规则（遍历 bis，i）：
1. **方向初始化**：首笔 trend 决定 `direction`；`startBiIndex=0`。
2. **收集反向笔**：当 `bis[i].trend !== direction`（反向笔）→ 转 `FeatureElement` 追加进 `featureSeq`，做包含处理。
3. **正常态找分型**：`detectTailFenxing(featureSeq, direction)`：
   - 命中 → **phaseA** 推入一个候选段（`buildDuan(bis[start..fenxing对应笔], Complete, Valid)`，仅作候选视图）。
   - 取第一/第二元素判 `hasGap`：
     - **第一种（无 gap）**：**phaseB** 确认段（同区间）；翻转 `direction`，`startBiIndex = fenxing 对应笔 + 1`，清空 `featureSeq`。
     - **第二种（有 gap）**：置 `pending = { segStart=startBiIndex, assumeEnd=fenxing笔, reverseDirection=反方向, reverseFeatureSeq=[] }`；进入待确认。
4. **待确认态**：后续反向笔并入 `pending.reverseFeatureSeq`（按 `reverseDirection` 做包含处理）：
   - `detectTailFenxing(reverseFeatureSeq, reverseDirection)` 命中 → **倒推确认**：**phaseB** 推入待确认段（`bis[pending.segStart .. pending.assumeEnd]`）；清空 pending；`direction=reverseDirection`，`startBiIndex=assumeEnd+1`，`featureSeq=[]`，继续。
   - 若反向特征序列"破坏"了假设（如价格越过假设终点反向）→ 撤销 pending，原段继续延伸（回到正常态）。具体撤销判据用经典 fixture 钉死。
5. **末端**：遍历结束，若有未确认的当前段 → 推入 **phaseB** 的 `UnComplete` 尾段（`endBi=null`、`status=Unknown`）。pending 未落定者同样并入尾段延伸。

### 4.4 关键私有方法
```ts
private toFeatureElement(bi: ChanBi, biIndex: number): FeatureElement
// = { high: bi.high, low: bi.low, biIndex }

private mergeFeatureInclusion(
  seq: FeatureElement[], next: FeatureElement, direction: TrendDirection,
): FeatureElement[]
// 口径同 KMergeCalculator.handleContainedState：
//   向上段(direction=Up, 特征序列为向下笔) → 含并取 max high / max low
//   向下段(direction=Down, 特征序列为向上笔) → 含并取 min high / min low
// 相邻无包含则 push；有包含则替换尾元素。direction 固定（不依赖 TrendCalculator）。

private detectTailFenxing(seq: FeatureElement[], direction: TrendDirection): FeatureFenxing | null
// 取最后 3 个元素；向上段判 Top（中间 high 最高），向下段判 Bottom（中间 low 最低）。
// 参照 bi.ts detectBasicFenxing 的极值判据（不含强度）。

private hasGap(a: FeatureElement, b: FeatureElement): boolean
// 区间不重合：a.high < b.low || b.high < a.low（严格，无重合=缺口）

private buildDuan(segmentBis: readonly ChanBi[], type: DuanType, status: DuanStatus): ChanDuan
// startTime=segmentBis[0].startTime, endTime=last.endTime；
// high=max(bi.high), low=min(bi.low)；
// originIds=orderedDedup(segmentBis.flatMap(b.originIds))；
// originBis=[...segmentBis]; startBi=segmentBis[0]; endBi=(Complete? last : null)；
// independentCount=Σ bi.independentCount; trend=segmentBis[0].trend
```

### 4.5 helper（internal/duan-range.ts）
```ts
export const orderedDedupIds = (ids: readonly number[]): number[]   // 保序去重（同 uniqueKById 思路）
```
（段的高/低/originIds 直接由笔字段聚合，无需像笔那样遍历 mergedK；故 helper 极简。）

> **实现风险点**：4.3 第 4 步"第二种情况撤销判据"是最大不确定性。缠论原典对该边界有解释空间。**对策**：用第67课/社区公认标准段划分样例做 fixture，TDD 钉死行为；若某边界原典无定论，在 design 记录采用的具体解释 + 理由，不静默臆断。

## 5. libs/chancore — facade（chan-core.ts）

```ts
static createDuan(bis: ChanBiTwoPhaseResult): readonly ChanDuan[] {
  return new DuanCalculator().createDuan(bis);
}
```
入参 = `createBi` 返回值（组合 `createDuan(createBi(k))`），`DuanCalculator` 消费 phaseB。不再内部做
`mergeK/Bi`（那是 `createBi` 的职责）。返回确认后的段单数组。

## 6. libs/chancore — barrel（index.ts）

```ts
export { BiStatus, BiType, ChannelLevel, ChannelStatus, ChannelType,
  DuanStatus, DuanType, FenxingType, TrendDirection } from './contracts';
export type { ChanBi, ChanBiTwoPhaseResult, ChanChannel, ChanChannelTwoPhaseResult,
  ChanDuan, ChanDuanTwoPhaseResult, ChanFenxing, ChanK, ChanMergedK } from './contracts';
```
不导出 `DuanCalculator`（internal）。

## 7. apps/mist/src/chan — app 层（镜像 bi）

- **enums/duan.enum.ts**：`export { DuanStatus, DuanType } from '@app/chancore';`（≡ bi.enum.ts）
- **types/chan-analysis.types.ts** 加：
  ```ts
  export interface ChanDuan { /* 镜像 contracts，originData→originBis: ChanBi[], startFenxing→startBi */ }
  export interface ChanDuanTwoPhaseResult { phaseA: ChanDuan[]; phaseB: ChanDuan[] }
  ```
- **vo/duan.vo.ts**（≡ bi.vo.ts + channel.vo.ts 模式）：
  ```ts
  export class DuanVo implements ChanDuan {
    // startTime/endTime/high/low/trend/type(DuanType)/status(DuanStatus)/independentCount/originIds
    @ApiProperty({ type: () => [BiVo] }) originBis!: BiVo[]
    @ApiProperty({ type: () => BiVo, nullable: true }) startBi: BiVo | null = null
    @ApiProperty({ type: () => BiVo, nullable: true }) endBi: BiVo | null = null
  }
  export class DuanTwoPhaseVo implements ChanDuanTwoPhaseResult {
    @ApiProperty({ type: () => [DuanVo] }) phaseA!: DuanVo[]
    @ApiProperty({ type: () => [DuanVo] }) phaseB!: DuanVo[]
  }
  ```
- **chan-core.mapper.ts** 加 `toDuanVo(duan: ChanDuan): DuanVo`（`originBis: duan.originBis.map(toBiVo)`、`startBi/endBi: toBiVo(...)`）。
- **chan.service.ts** 加：
  ```ts
  createDuan(createBiDto: CreateBiDto) {
    const result = ChanCore.createDuan(createBiDto.k.map(toChanK));
    return { phaseA: result.phaseA.map(toDuanVo), phaseB: result.phaseB.map(toDuanVo) };
  }
  ```
- **chan.controller.ts** 加 `POST /v1/chan/duan`（≡ `POST /v1/chan/bi` 的 K 抓取+映射+调用模式，`@Throttle` 30/min，`@ApiEnvelopeResponse({ type: DuanTwoPhaseVo })`）。

## 8. 测试计划

### 8.1 段算法 pure 单测（libs/chancore/src/internal/duan.spec.ts）
- 空输入 / `<3 笔` → `{ phaseA:[], phaseB:[] }`。
- 特征序列构造：向上段收集向下笔、向下段收集向上笔。
- 特征序列包含处理：相邻元素重合按方向合并（向上段 max/max、向下段 min/min）；不重合则保留。
- 分型：向上段只识别 Top、向下段只识别 Bottom；3 元素中间极值。
- 缺口：`hasGap` 严格不重合判定。
- **第一种（无缺口）**：分型确认 → phaseB 出段、翻转方向开新段。
- **第二种（有缺口）**：进入 pending；反向特征序列出分型 → 倒推确认；不出分型 → 段继续延伸、pending 撤销。
- 末端 `UnComplete` 尾段（`endBi=null`、`status=Unknown`）。
- 经典 fixture（第67课/社区标准段样例）→ 固化 phaseA/phaseB fingerprint（结构/值/枚举/顺序/null/Date）。
- 不变量：`ChanInvariantError`（如 buildDuan 空段、分型元素缺失）。

### 8.2 facade / characterization（libs/chancore/src）
- `chan-core.spec.ts`：`createDuan` 空输入、链路（含 Bi phaseB）、不重算笔。
- `chan-full-output.characterization.spec.ts`：加段 fingerprint；**证明 `mergeK/findFenxings/createBi/createChannels` 输出与引入前 byte-identical**（differential）。

### 8.3 边界 guard
- `chancore-boundary.guard.spec.ts` 已有 pure-boundary 断言；确认 duan.ts 不引入禁用 import（或加一条断言）。

### 8.4 app 层（apps/mist/src/chan）
- `chan-core.mapper.spec.ts`：`toDuanVo` 字段映射、`originBis` 递归 `high/low`、`startBi/endBi` null 处理。
- `chan.service.spec.ts`：`createDuan` 返回 `{phaseA,phaseB}` 形态、空输入。
- `chan.controller.openapi.spec.ts`：⚠️ **master 上预存失败**（`@nestjs/swagger/dist/constants` 解析问题，AGENTS.md §七已知项，与本次改动无关）。新增 `/v1/chan/duan` 的 OpenAPI 断言写上，但不把该文件的预存失败计入本次门禁（在报告里区分"预存失败 vs 本次新增"）。

## 9. 验证命令（受影响仓库基线，governance §11）

worktree 内（pnpm）：
```bash
pnpm run lint:check
pnpm run typecheck
env TZ=UTC pnpm run test:ci        # 已带 --forceExit
pnpm run ci:contracts
pnpm run build:docker
openspec validate --all --strict
```
- 全绿才合 master；定向测试不冒充全量门禁。
- 检索：`libs/chancore` 无 TypeORM/Redis/HTTP/Nest/env/persistence import；全仓无 `highest/lowest` 新增；未接线 `ChannelLevel.Duan`。
- 报告区分：通过 / 跳过 / 环境阻塞 / 预存失败（openapi spec）/ 待 HIL（段为无状态计算，无终端 HIL 需求，但生产图表可视化为后续 change）。

## 10. 非目标 / 开放实现问题

- **不做**：段级中枢、背驰、买卖点、严格笔/config、持久化、migration、改现有算法、接线 ChannelLevel.Duan。
- **开放问题（实施时定，记回 design）**：
  1. 第二种情况"撤销 pending"的精确判据（用经典 fixture TDD 钉死）。
  2. phaseA 候选段在 pending 期间如何表示（是否含未确认候选）——用 fixture 确定语义后写进 duan.spec.ts 断言。
  3. 特征序列包含处理是否直接复用 `KMergeCalculator`（笔区间只有 high/low，倾向独立小函数 `mergeFeatureInclusion`，口径对齐即可）。
  4. `DuanType/DuanStatus` 是否最终与 `BiType/BiStatus` 合并为通用枚举（倾向独立命名）。

## 11. 落地顺序（第三步，待本计划确认后）

1. 建 worktree/分支 → contracts + barrel → duan.ts + duan-range.ts + 单测（TDD，fixture 先行）。
2. facade createDuan + chan-core.spec + characterization differential。
3. app 层 enums/types/vo/mapper/service/controller + app 单测。
4. 全量基线验证 → 报告 → 等用户确认 → 合 master。
