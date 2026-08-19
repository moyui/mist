# Design — add-chan-divergence

## 1. 背景与基线

- 缠论链：笔/段/段级中枢就绪。背驰是买卖点判定的核心（力度衰竭）。
- 用户定调（08-14）：**笔级/段级背驰算法一致 → 抽离为共享纯函数复用**；**趋势背驰 + 盘整背驰都做**；
  **力度管线（MACD histogram + 单元面积聚合）由独立 change `extract-shared-indicators-library`
  交付 `libs/indicators` 纯库（方案 A 延续，含 `IndicatorService.runMACD` 薄包装）；
  本 change 只消费**。
- 力度来源确定：现有指标引擎 `IndicatorService.runMACD`（technicalindicators 12/26/9 EMA，
  indicator.service.ts:76-105）产出 MACD 柱（histogram）；chan 模块已注入 IndicatorModule
  （chan.module.ts:9，chan.controller.ts:29-33），`duan-channel` 端点已验证
  "IndicatorQueryDto 查 K → ChanCore" 编排模式。
- 治理约束（openspec/specs/chan-analysis-core/spec.md:225-238）：ChanCore 不得 import 公共
  IndicatorService、不得提供 Strategy KDJ/MACD；回测/实时运行时不得依赖公共 Indicator HTTP API →
  力度计算必须走**纯库**（`libs/indicators`），chancore 保持纯函数（forces 由调用方传入）。
- 纯增量：不改 `mergeK/findFenxings/createBi/createChannels/createDuan/createDuanChannels`；
  `runMACD` 仅实现委托（契约不变）；无持久化；`algorithmVersion` 保持 1。

## 2. 缠论背驰语义（24课等）

- **力度度量**：MACD 红绿柱面积/高度。本 change 中**力度 = 单元区间内 MACD histogram 面积和**
  （调用方经 `libs/indicators.computeUnitForces` 计算传入）。
- **盘整背驰**：某中枢的**进入段**（中枢前最近一段次级别走势）与**离开段**（中枢后最近一段）力度
  对比；离开 < 进入 → 盘整背驰（中枢震荡力度衰竭，三类买卖点基础）。
- **趋势背驰**：**趋势**（≥2 个同向中枢）中，最后一个中枢的离开段力度 < 其进入段力度（或与前一同向
  中枢的离开段相比递减）→ 趋势背驰（趋势结束，一/二类买卖点基础）。

## 3. 共享力度管线（`libs/indicators`，由 extract-shared-indicators-library 交付）

`@app/indicators` 纯库（无 I/O、无 Nest/TypeORM 依赖）由独立 change
`extract-shared-indicators-library` 建设与拥有（六个序列函数 + 单元力度聚合 + `IndicatorService`
六方法薄包装 + 边界守卫）。本 change 使用其中两个入口（方案 A 延续）：

```ts
/** MACD(12/26/9 EMA) 全序列：本 change 使用 histogram 与 begIndex */
export function computeMacdSeries(closes: readonly number[]): {
  readonly begIndex: number;
  readonly macd: number[];
  readonly signal: number[];
  readonly histogram: number[];
};

/** 单元力度聚合：每单元力度 = [startTime, endTime] 区间内 histogram 面积和 */
export function computeUnitForces(
  histogram: readonly number[],
  begIndex: number,
  kTimes: readonly Date[],
  units: readonly { startTime: Date; endTime: Date }[],
): number[];
```

- `computeMacdSeries` 语义（由该 change 锁定）：委托 `technicalindicators` `MACD.calculate`（fast=12,
  slow=26, signal=9, EMA），过滤完整值后与输入对齐（begIndex 语义与 indicator.service.ts:56-58
  一致）。
- `computeUnitForces`：对每单元二分定位 `kTimes` 中区间 `[startTime, endTime]` 的 K 索引范围，
  求和 `histogram` 的有效部分（`i >= begIndex`）；找不到区间或无有效部分 → 力度 0。
- 本 change 编排链使用 `computeMacdSeries(closes).histogram` 作为 `computeUnitForces` 输入。

## 4. 背驰输入契约（chancore，调用方传入力度）

```ts
/** 背驰单元（笔或段皆可，最小结构接口） */
export interface ChanDivergenceUnit {
  readonly startTime: Date;
  readonly endTime: Date;
  readonly trend: TrendDirection;
}

/** 背驰中枢（笔级或段级皆可，首/末单元边界） */
export interface ChanDivergenceZhongshu {
  readonly firstUnitTime: Date;  // 中枢首单元起点（≡ bis[0].startTime / duans[0].startTime）
  readonly lastUnitTime: Date;   // 中枢末单元终点（≡ bis.at(-1).endTime / duans.at(-1).endTime）
}

/** 背驰判定入参：units 与 forces 按索引一一对齐 */
export interface ChanDivergenceInput {
  readonly units: readonly ChanDivergenceUnit[];
  readonly zhongshus: readonly ChanDivergenceZhongshu[];
  readonly forces: readonly number[];   // 每单元力度（推荐来源 = computeUnitForces 面积）
}
```

> 调用方把 `ChanBi[]`/`ChanDuan[]`、`ChanChannel[]`/`ChanDuanChannel[]` 映射为上述最小结构接口
> （字段天然满足，仅需类型适配）；力度值由调用方经 `libs/indicators` 计算。

## 5. 输出契约

```ts
export enum ChanDivergenceType {
  Trend = 'trend',             // 趋势背驰
  Consolidation = 'consolidation', // 盘整背驰
}

export interface ChanDivergence {
  readonly type: ChanDivergenceType;
  readonly zhongshuIndex: number;   // 相关中枢在 zhongshus 中的位置
  readonly enterIndex: number;      // 进入段在 units 中的位置
  readonly leaveIndex: number;      // 离开段在 units 中的位置
  readonly enterForce: number;      // 进入段力度
  readonly leaveForce: number;      // 离开段力度
}
```

## 6. 算法

```
detectDivergences(input): ChanDivergence[]
  1. 对每个中枢 z（按 firstUnitTime/lastUnitTime 在 units 中定位其首/末单元下标 s/e）：
     - 进入段 = units[s-1]（中枢前最近一段）；离开段 = units[e+1]（中枢后最近一段）。
     - 若 s-1 < 0 或 e+1 >= units.length → 无进入/离开段，跳过该中枢。
     - 盘整背驰：leaveForce < enterForce → 产出 { Consolidation, z, s-1, e+1, ... }。
  2. 趋势背驰：对同向中枢链（≥2 个同向中枢，方向一致、时间连续）：
     - 取链的最后一个中枢 z_last：比较其离开段力度与**链首中枢的进入段力度**
       （或前一同向中枢的离开段力度——设计决策点 D3）；
       若递减 → 产出 { Trend, z_last, ... }。
  3. 返回全部背驰结果（盘整 + 趋势），按 zhongshuIndex 排序。
```

- 力度比较口径：**严格 <**（离开 < 进入才算背驰；等于不算），无 epsilon。
- 进入/离开段定位：按 startTime/endTime 精确匹配（与 extendChannel 同法），找不到则跳过（不臆断）。

## 7. HTTP 端点 `POST /v1/chan/divergence`

与 `duan-channel` 端点（chan.controller.ts:234-271）完全同模式：

```
IndicatorQueryDto（code/source/period/startDate/endDate）
  → IndicatorService.findKData（MySQL 查 K）
  → ChanCore.createBi(k) → phaseB
  → ChanCore.createDuan(phaseB) → ChanDuan[]
  → ChanCore.createDuanChannels(duans) → phaseB 段级中枢
  → computeMacdSeries(closes).histogram + computeUnitForces(..., duans) → forces
  → ChanCore.detectDivergences({ units: duans, zhongshus, forces }) → ChanDivergence[]
  → DivergenceVo[]
```

- 本端点走**段级**（段 + 段级中枢），与现有 `duan`/`duan-channel` 端点一致；笔级背驰由共享纯函数
  支持（调用方传笔级结构即可），端点不额外开放 level 参数（YAGNI，未来策略/回测接入时再评估）。
- 新增 `DivergenceVo`（type/zhongshuIndex/enterIndex/leaveIndex/enterForce/leaveForce + 段时间
  起止便于核对）、`dto`/`mapper`（`chan-core.mapper.ts` 加 `toDivergenceVo`）、throttle 与现有
  chan 端点同档。

## 8. 确认门禁点

| ID | 决策 | 定案 | 说明 |
|----|------|------|------|
| D1 | 背驰形态 | 趋势 + 盘整都做 | 用户定调 |
| D2 | 力度数据源 | **MACD 柱面积**：`libs/indicators`（extract-shared-indicators-library 交付）computeMacd + computeUnitForces；runMACD 薄包装在该 change | 用户拍板方案 A；chancore 仍不计算指标 |
| D3 | 趋势背驰力度对比基准 | 链最后一个中枢的离开段 vs **链首中枢的进入段**（首尾力度对比） | 备选：vs 前一中枢离开段（相邻对比）——缠论有流派差异，fixture 钉 |
| D4 | 复用方式 | **共享纯函数** `detectDivergences`（笔/段经最小结构接口） | 用户定调 |
| D5 | HTTP 端点 | **提供** `POST /v1/chan/divergence`（段级，模式同 duan-channel） | 力度来源已确定，零新增依赖 |
| D6 | `algorithmVersion` | 保持 1（纯增量） | — |
| D7 | `libs/indicators` 边界 | 纯库（无 I/O、无 Nest/TypeORM），由 extract-shared-indicators-library 拥有与守卫；本 change 只消费 | 用户拍板方案 A |
| D8 | 三块接入范围 | 本 change = ①自己查询端点 + 共享力度管线；②回测、③实时接入**留各自 owning change** | `chan-analysis-core` 要求运行时不得依赖公共 Indicator HTTP API |

## 9. 边界与非目标

- **不做**：买卖点判定（后续 change）、持久化、migration、改现有算法、②回测接入、③实时接入
  （②③ 与 `IndicatorService` 其它方法迁移归 `extract-shared-indicators-library`）。
- 背驰为**请求时实时派生**（无状态纯函数）；不新增 Compose service。
- `runMACD` 行为回归由现有 indicator.service.spec 覆盖（薄包装后应保持全绿）。

## 10. 验证策略

- 背驰判定 pure 单测：进入/离开段定位（含边界：无进入/无离开）、盘整背驰（严格 < 口径）、
  趋势背驰（首尾对比、同向中枢链）、空输入、确定性、不变异。
- 经典 case fixture：构造 进入段力度 > 离开段 的盘整背驰 / 趋势背驰样例固化指纹。
- 真实数据验证（scratch）：600519 + `libs/indicators` MACD 面积 → 背驰结果人工核对。
- HTTP 端点单测：`POST /v1/chan/divergence`（IndicatorsQueryDto 校验、VO 结构、throttle）。
- 仓库基线：lint / typecheck / test:ci / ci:contracts / build:docker / openspec validate --all --strict。
