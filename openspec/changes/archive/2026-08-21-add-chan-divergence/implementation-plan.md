# 实施计划 — add-chan-divergence（背驰）

> 三步工作流第二步。代码级实施计划，非 openspec 产物。spec 见同目录 proposal/design/tasks/specs。
> 落地（写码）须经用户确认本计划后才开始（第三步）。

## 0. 规范遵循

- 严格按 `mist/docs/project-quality-governance-guide.md` 与本 change 的 spec delta 实施。
- 背驰为 ChanCore **纯增量**：不改 `mergeK/findFenxings/createBi/createChannels/createDuan/
  createDuanChannels` 任何输出；不触碰已有 internal 算法；不引入 TypeORM/Redis/HTTP/Nest/env 依赖进
  `libs/chancore`；不恢复 Chan persistence；不做买卖点。
- **力度数据由调用方传入**（chancore 不算 MACD，`chan-analysis-core` 硬约束）：`forces` 双分量
  { area, peak }，来源 = `@app/indicators`（增补 `computeUnitDirectionalAreas` 方向柱面积 +
  `computeUnitLinePeaks` DIF 极值 → 调用方按方向取 |绝对值|）。
- 趋势背驰口径 = 缠师原文 24 课 A/B/C 三段结构（本 change 已考证）：趋势链最后一个中枢 B 的
  进入段（A）vs 离开段（C），两者同向；方向面积 + 黄白线绝对值双口径严格 <。
- 趋势链构造（本 change 内现做，不新增独立模块）：中枢方向=离开段 trend；相邻中枢**位置递进**
  （向上整体抬高/向下整体降低，用 gg/dd）；**非扩张不做**——已由 `chan-central-extension`
  （Phase C，master 46a4fb85）保证 phaseB 相邻波动区间严格不重叠，`expanded` 中枢当普通中枢看待；
  链长 ≥2 构成趋势。
- `algorithmVersion` 保持 2（跟随 chan-central-extension 基线）；新 internal 不从 barrel 导出。

## 1. 分支与 worktree

- 在 `mist` 仓库建 worktree：`mist/.worktrees/feat-add-chan-divergence`，分支 `feat/add-chan-divergence`，
  基于当前 master（`46a4fb85`，含 chan-central-extension Phase C + indicators）。
- 命令用 `node -e "process.chdir('...'); execSync('...')"` 模式（避免 cd 权限提示）；包管理用 `pnpm`。
- 推送用 gh credential + `origin-https`（本机 SSH 不可用，见记忆）。

## 2. 改动文件总览

| 仓库/目录 | 文件 | 动作 |
|---|---|---|
| libs/indicators/src | `force.ts` | 增补 `computeUnitDirectionalAreas`（方向柱面积）+ `computeUnitLinePeaks`（DIF 极值） |
| libs/indicators/src | `force.spec.ts` | 增补两个函数单测 |
| libs/indicators/src | `index.ts` | 导出增补函数 |
| libs/chancore/src | `contracts.ts` | 新增 `ChanDivergenceUnit`、`ChanDivergenceZhongshu`（含 zg/zd/gg/dd）、`ChanUnitForce`（area/peak）、`ChanDivergenceInput`、`ChanDivergenceType`、`ChanDivergence` |
| libs/chancore/src/internal | `divergence.ts` | **新增** `DivergenceDetector`（中枢定位/进入离开段识别/盘整/趋势链构造/趋势判定） |
| libs/chancore/src/internal | `divergence.spec.ts` | **新增** 背驰纯单测 |
| libs/chancore/src | `chan-core.ts` | facade 加 `detectDivergences` |
| libs/chancore/src | `index.ts` | barrel 导出新类型/枚举 |
| libs/chancore/src | `chan-core.spec.ts` | 加 detectDivergences 空输入/确定性 |
| openspec/changes/extract-shared-indicators-library/ | `specs/indicators-core/spec.md` | 追加方向柱面积 + DIF 极值 requirement/scenario（capability 归属） |
| openspec/changes/add-chan-divergence/ | design/proposal/tasks | 落地后勾选 tasks |

> **注意**：本 change **不提供 HTTP 端点**（D5 定案）→ 无 vo/mapper/controller/app 层改动。

## 3. `@app/indicators` 增补：方向柱面积 + 黄白线极值（两个函数）

归属 `indicators-core`（extract-shared-indicators-library 未归档，本 change 落地时同步其 spec delta）；
代码在 `libs/indicators/src/force.ts`（与 `computeUnitForces` 同一组二分定位逻辑）：

```ts
/** 单元方向柱面积：缠论面积=只统计与段方向同向的柱（原文24课"向上看红柱、向下看绿柱"）。
 *  up   → Σ max(histogram[i], 0)        红柱面积（越大越强）
 *  down → Σ max(-histogram[i], 0)       绿柱面积（正向力度标量，越大越强）
 * 与 computeUnitForces 同形（begIndex 前无效跳过；无有效部分 → 0）。 */
export function computeUnitDirectionalAreas(
  histogram: readonly number[],
  begIndex: number,
  kTimes: readonly Date[],
  units: readonly { startTime: Date; endTime: Date }[],
  directions: readonly TrendDirection[],   // 每单元方向（up/down）
): number[];

/** 单元 DIF 线极值：返回区间内 max/min（不猜方向），调用方按段方向取绝对值。
 *  背驰场景同向 A/C 段 DIF 极值必在 0 轴同侧，|极值| 直接可比（"不创新高/不创新低"）。 */
export interface UnitLinePeaks {
  readonly max: number;  // 区间内 DIF 线最高
  readonly min: number;  // 区间内 DIF 线最低
}

export function computeUnitLinePeaks(
  dif: readonly number[],        // = computeMacdSeries(closes).macd（DIF 线）
  begIndex: number,
  kTimes: readonly Date[],
  units: readonly { startTime: Date; endTime: Date }[],
): UnitLinePeaks[];
```

- **area（主判据）** = `computeUnitDirectionalAreas(...).` 输出（正向力度标量，越大越强）。
- **peak（黄白线印证）** = 调用方对 `computeUnitLinePeaks` 输出按方向取绝对值：
  `up → Math.abs(max)`、`down → Math.abs(min)`（统一"越大越强"，chancore 内直接数值比较）。
- 与 `computeUnitForces` 的差异：**背驰不再用有符号面积和**（下跌段会判反），改方向柱面积。
- 单测：方向柱面积（up 只算正柱、down 只算负柱）、begIndex 前跳过、边界单元、空输入 `[]`；
  DIF max/min 聚合（极值、begIndex、边界、空）。

## 4. libs/chancore — 契约（contracts.ts）

```ts
export enum ChanDivergenceType {
  Trend = 'trend',                 // 趋势背驰（24课标准背驰）
  Consolidation = 'consolidation', // 盘整背驰
}

/** 背驰单元（笔或段皆可，最小结构接口） */
export interface ChanDivergenceUnit {
  readonly startTime: Date;
  readonly endTime: Date;
  readonly trend: TrendDirection;
}

/** 背驰中枢（笔级 ChanChannel 或段级 ChanDuanChannel 皆可） */
export interface ChanDivergenceZhongshu {
  readonly firstUnitTime: Date; // = units[0].startTime
  readonly lastUnitTime: Date;  // = units.at(-1).endTime
  readonly zg: number;          // 中枢上沿（位置递进用）
  readonly zd: number;          // 中枢下沿
  readonly gg: number;          // 中枢最高（位置递进）
  readonly dd: number;          // 中枢最低
}

/** 每单元力度（双分量，均为"越大越强"正向标量） */
export interface ChanUnitForce {
  readonly area: number; // 方向柱面积（主判据：up=红柱面积 / down=绿柱面积，由 computeUnitDirectionalAreas 输出）
  readonly peak: number; // 黄白线（DIF）极值绝对值（印证：up=|max| / down=|min|，由调用方预置）
}

/** 背驰判定入参：units 与 forces 按索引一一对齐 */
export interface ChanDivergenceInput {
  readonly units: readonly ChanDivergenceUnit[];
  readonly zhongshus: readonly ChanDivergenceZhongshu[];
  readonly forces: readonly ChanUnitForce[];
}

export interface ChanDivergence {
  readonly type: ChanDivergenceType;
  readonly zhongshuIndex: number;  // 相关中枢在 zhongshus 中的位置
  readonly enterIndex: number;     // 进入段在 units 中的位置
  readonly leaveIndex: number;     // 离开段在 units 中的位置
  readonly enterForce: ChanUnitForce;
  readonly leaveForce: ChanUnitForce;
}
```

> barrel 导出类型 + 枚举；不导出 internal calculator。`ChanDuanChannel`→`ChanDivergenceZhongshu`
> 映射由调用方做（字段天然满足，仅类型适配）。

## 5. 背驰算法（internal/divergence.ts）

```ts
export class DivergenceDetector {
  detectDivergences(input: ChanDivergenceInput): ChanDivergence[]
}
```

实现（对应 design §6）：
1. **中枢定位**：对每个 zhongshu，在 units 中按 `firstUnitTime`/`lastUnitTime` 精确匹配首/末单元下标
   `s`/`e`（startTime/endTime 相等判定，与 extendChannel 同法）；找不到 → 跳过该中枢。
   - 进入段 = units[s-1]（A 段）；离开段 = units[e+1]（C 段）。
   - 边界：s-1<0 或 e+1>=units.length → 该中枢无进入/离开段，只参与可判定的链（不产出盘整背驰）。
2. **盘整背驰**（每中枢独立）：有进入段且离开段时，双口径：`leave.area < enter.area` 且
   `leave.peak < enter.peak`（严格 <）→ `{ Consolidation, z, s-1, e+1, ... }`。
3. **趋势链构造**（一次，确定性）：
   - 沿 zhongshus 时间序扫描；**连续两个同样的中枢**即归同链——相邻中枢（无需严格共享连接段）
     且离开段 trend 同向（中枢方向=离开段 trend）→ 构成链；方向不同/被非同向中枢隔开即断链。
   - 候选链内相邻中枢须满足**位置递进**（否则断链）：
     - 向上链 后.gg > 前.gg 且 后.dd > 前.dd；向下链对称（后.gg < 前.gg 且 后.dd < 前.dd）。
   - **非扩张判定不做**：已由 `chan-central-extension`（Phase C）保证输入 phaseB 相邻波动区间
     严格不重叠（`max(dd) > min(gg)`）；`expanded=true` 中枢为同级别扩张产物、当普通中枢同规则
     （用户定调）——背驰不读 `expanded` 字段。
   - 链长度 ≥2 才构成趋势（链长 1 = 孤立中枢，只盘整背驰）。
4. **趋势背驰**（每条有效链的链末中枢 z_last = 原典 B 中枢）：比较其进入段（A）vs 离开段（C），
   双口径严格 < → `{ Trend, z_last, enterIdx, leaveIdx, ... }`（只输出一条 / 链）。
5. **返回**：盘整 + 趋势全部结果，按 zhongshuIndex 升序；确定性、不改输入。

辅助（internal 私有）：`locateUnitIndex(units, time)`（二分——units 时间有序）、
`isSameDirectionChain`、`progressesInTrend`、`isWeaker(leave, enter)`（双分量严格 <）。

> 方向语义：段 trend 交替（down→up→down…），进入段/离开段方向由 units[s-1].trend / units[e+1].trend
> 直接取；趋势方向 = 链内中枢离开段方向。forces 两分量均为**调用方预置的正向力度标量**（area=方向
> 柱面积、peak=DIF 极值绝对值），detectDivergences 内统一数值比较 `<`——chancore 无方向认知。

## 6. Facade（chan-core.ts）

```ts
static detectDivergences(input: ChanDivergenceInput): readonly ChanDivergence[] {
  return new DivergenceDetector().detectDivergences(input);
}
```
- 空输入（无 units 或无 zhongshus）：返回 `[]`，非错误，不抛异常。
- `algorithmVersion` 保持 2（跟随 chan-central-extension 基线）；不导出 internal。

## 7. 测试计划

### 7.1 indicators 增补（force.spec.ts）
- `computeUnitDirectionalAreas`：up 只算红柱（histogram>0）、down 只算绿柱（histogram<0 绝对值）；
  begIndex 前无效跳过；边界单元；混合方向（同区间正负柱并存 → 只取方向柱）；空输入 `[]`；
  确定性、不变异。
- `computeUnitLinePeaks`：区间内 DIF max/min 聚合；begIndex 前无效；边界单元；空输入 `[]`；
  确定性、不变异。

### 7.2 背驰 pure 单测（divergence.spec.ts，用 makeUnit/makeZhongshu 构造）
- **中枢定位**：精确匹配首/末单元；找不到 → 跳过；无进入段（s=0）/无离开段（e=末）→ 只链判定。
- **盘整背驰**：leave < enter（双分量）→ Consolidation；单分量不满足（面积缩但黄白线不缩）→ 无；
  严格 <（等于不算）。
- **趋势链构造**：连续两个同样中枢归链；方向不同断链；中间插异向中枢断链；位置递进断链（后中枢
  不高）；expanded 当普通中枢（构造一个 expanded 用例确认不特殊处理）；孤立中枢（链长1）只盘整；
  链长≥2 构成趋势。
- **趋势背驰**：链末中枢 A vs C 双分量严格 < → Trend；链首中枢的 A vs C 背驰不因链首产 Trend；
  每条链只一条 Trend。
- **排序/确定性/不变异**：按 zhongshuIndex 升序；重复调用同结果；输入不被改动。
- **空输入**：`[]`。

### 7.3 facade（chan-core.spec.ts）
- `detectDivergences({ units: [], zhongshus: [], forces: [] })` → `[]`；确定性。

### 7.4 真实数据 fixture（scratch，不固化）
- 600519 日 K（Tencent API `param=sh600519,day,,,N,qfq`）：createBi → createDuan → createDuanChannels
  → computeMacdSeries({closes}) → computeUnitDirectionalAreas(area) + computeUnitLinePeaks→按方向取
  |max/min|(peak) → detectDivergences → 人工核对盘整/趋势背驰段（对照价格走势与红绿柱面积/黄白线）。
- 专测一条趋势（≥2 同向中枢）末中枢 A vs C 的背驰样例；另测一条 底背驰（向下）样例核对 peak
  绝对值口径。

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
- 检索：`libs/chancore`、`libs/indicators` 无禁用 import（typeorm/@nestjs/http/env 等，guard 已覆盖）；
  未恢复 Chan persistence；`POST /v1/indicators/macd` 等 HTTP 契约无变化（本 change 无 app 层改动）。

## 9. 非目标 / 开放实现问题

- **不做**：买卖点、持久化、migration、HTTP 端点、策略接入（②回测③实时归策略 owning change）、
  改已有算法。
- **已定（用户拍板）**：
  1. 趋势链"连接连续" = **连续两个同样的中枢**（无需严格共享连接段，方向一致即归链；被非同向
     中枢隔开即断链）。
  2. 底背驰（向下）peak 用 DIF min：改为**绝对值口径**后自动成立（`|min(DIF)|` 越大越强，比较
     `leave < enter` 即"不创新低"），无需额外归一/方向判断。
  3. 力度双分量均为调用方预置的正向标量（area=方向柱面积、peak=DIF 绝对值），chancore 只数值比较。
  4. **中枢扩张由 `chan-central-extension`（Phase C，master 46a4fb85）保证**：phaseB 相邻波动区间
     严格不重叠；**expanded 当普通中枢看待**（用户定调），背驰不读 expanded 字段、不做非扩张判定，
     位置递进用 gg/dd。
- **开放问题（实施时定，记回 design）**：
  1. `computeUnitLinePeaks` / `computeUnitDirectionalAreas` 命名与库 owner 对齐（备用
     computeUnitPeaks/computeUnitDiffs）。
  2. 趋势链"连续"是否要求相邻中枢中间无任何未成链中枢间隙（推荐：被非同向/同向但几何不满足的
     中枢隔开即断）。
  3. `ChanDivergenceZhongshu` 不携带 `expanded`（背驰不感知）——确认调用方透传时忽略它即可。

## 10. 落地顺序（第三步，待本计划确认后）

1. 建 worktree/分支 → indicators 增补（force.ts 两个函数 + spec + barrel + extract spec delta）。
2. chancore contracts + barrel → internal/divergence.ts + 单测。
3. facade detectDivergences + chan-core.spec。
4. 真实数据 scratch（600519，趋势+底背驰样例）→ 人工核对。
5. 全量基线验证 → 报告 → 等用户确认 → 合 master → push。
