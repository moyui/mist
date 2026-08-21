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
- 纯增量：不改 `mergeK/findFenxings/createBi/createChannels/createDuan/createDuanChannels` 的输入/
  契约语义；`algorithmVersion` **保持 2**（跟随 `chan-central-extension` 基线：Phase C 中枢扩张将其
  1→2；本 change 纯增量不再 bump）。无持久化。

## 2. 缠论背驰语义（24课/25课原文考证）

- **力度度量：面积 + 黄白线双口径**。缠师原文 24 课主口径为**红绿柱（histogram）面积**——"C段
  的走势类型完成时对应的MACD柱子面积（向上的看红柱子，向下看绿柱子）比A段对应的面积要小，这时候
  就构成标准的背弛"；25 课补充映像："黄白线不能创新高，或者柱子的面积或者伸长的高度能不能突破
  新高"。本 change 中**每单元力度 = 双分量**：
  - `area`：**方向柱面积**（主判据，原文"向上看红柱、向下看绿柱"）——不是整段 histogram 有符号
    求和（下跌段会判反），而是只统计与段方向同向的柱：
    - 上升段 = 红柱面积 = Σ max(histogram, 0)；
    - 下跌段 = 绿柱面积 = Σ max(-histogram, 0)（正向力度标量，越大越强）。
    由 `@app/indicators` 增补的**方向感知**面积函数 `computeUnitDirectionalAreas` 输出。
  - `peak`：**黄白线（DIF）极值绝对值**（25课"黄白线不创新高/低"印证）——背驰/背离场景 A/C 两段
    同向、DIF 极值必在 0 轴同侧（不会一上一下），故直接取绝对值：上升段 `|max(DIF)|`、下跌段
    `|min(DIF)|`，均越大越强。由 `@app/indicators` 增补 `computeUnitLinePeaks`（返回 {max,min}，
    调用方按方向取绝对值）。
- **标准背驰（24课 A/B/C 三段结构）**：同向走势 A、B、C 三段在一个大的趋势里——A 段之前已有
  一个中枢，**B 段是另一个中枢**（黄白线回拉 0 轴），**C 段是 B 的离开段（最后一段，与 A 同向）**。
  标准趋势背驰 = **B 中枢的进入段（A 段）vs 离开段（C 段）**，`C 力度 < A 力度`。
- **盘整背驰**：盘整中利用类似背驰的判断（24课）：某中枢的**进入段**与**离开段**力度对比；
  离开 < 进入 → 盘整背驰（中枢震荡力度衰竭，三类买卖点基础）。
- 两口径的"段对"结构相同（进入段 vs 离开段），**差异在前提**：标准背驰要求该中枢处于
  **趋势末尾**（≥2 个同向中枢），盘整背驰无此要求。

### 2.1 趋势（同向中枢链）识别（本 change 内实现，不新增独立模块）

段级中枢（`ChanDuanChannel`）本身**无方向**（17课定论：中枢=重叠区域，方向属趋势）——所以趋势
方向不能从中枢字段读，**由构成段的趋势推导**（段 `ChanDuan.trend` 方向交替）：

- **中枢的方向 = 其离开段的方向**（`units[e+1].trend`；也等于进入段 `units[s-1].trend`——
  进入段/离开段隔中枢内 N 段，方向一致，天然同向）。
- **同向中枢链**：按中枢时间序扫描，相邻中枢（连续两个同样的中枢即可，无需严格共享连接段），
  且各中枢离开段方向一致（同 up 或同 down）→ 归为同一条链；被非同向中枢隔开即断链。
- **中枢扩张已由 `chan-central-extension`（Phase C）解决**：`createDuanChannels`/`createChannels`
  的 phaseB 输出相邻中枢波动区间**严格不重叠**（`max(dd) > min(gg)` 不动点）；扩张合并产物
  `expanded=true` 是**同级别**的大中枢（用户定调"扩张的中枢当一个中枢看待"），背驰**不特殊处理**，
  与普通中枢同规则参与链/盘整判定。
- **链成立的几何约束（仅保留位置递进，不依赖 MACD，非扩张已由 Phase C 保证）**：
  - **位置递进**：向上链要求后中枢整体更高（`gg` 与 `dd` 均抬升：后.gg > 前.gg 且 后.dd > 前.dd）；
    向下链对称（后.gg < 前.gg 且 后.dd < 前.dd）。用户定调："趋势向上，第二个中枢一定要比第一个
    中枢高"。
- 链长度 ≥ 2 的中枢才构成趋势（趋势 = ≥2 个同向中枢）；孤立中枢（链长 1）只参与盘整背驰。
- 链构造只依赖 `units`/`zhongshus` 时间、方向与几何（不依赖 MACD），与力度计算解耦。

## 3. 共享力度管线（`@app/indicators`，由 extract-shared-indicators-library 交付）

`@app/indicators` 纯库（无 I/O、无 Nest/TypeORM 依赖）由独立 change
`extract-shared-indicators-library` 建设与拥有（六个序列函数 + 单元面积聚合 + `IndicatorService`
六方法薄包装 + 边界守卫）。本 change 使用其中两个入口（方案 A 延续），并声明其**增补两个力度
聚合函数**（与 `computeUnitForces` 同形制式）：

```ts
/** MACD(12/26/9 EMA) 全序列：本 change 使用 histogram（面积）与 macd（DIF 线） */
export function computeMacdSeries(closes: readonly number[]): {
  readonly begIndex: number;
  readonly macd: number[];
  readonly signal: number[];
  readonly histogram: number[];
};

/** 【增补】单元方向柱面积：缠论面积=只统计与段方向同向的柱
 *  up   → Σ max(histogram[i], 0)        红柱面积
 *  down → Σ max(-histogram[i], 0)       绿柱面积（正向力度标量，越大越强）
 * 与 computeUnitForces 同形（begIndex 前无效跳过；无有效部分 → 0）。 */
export function computeUnitDirectionalAreas(
  histogram: readonly number[],
  begIndex: number,
  kTimes: readonly Date[],
  units: readonly { startTime: Date; endTime: Date }[],
  directions: readonly TrendDirection[],   // 每单元方向
): number[];

/** 【增补】单元 DIF 线极值：返回区间内 max/min（不猜方向），调用方按段方向取绝对值
 *  up → |max(DIF)|、down → |min(DIF)|（背驰场景两段同向、极值同侧，直接可比）。 */
export interface UnitLinePeaks {
  readonly max: number;
  readonly min: number;
}

export function computeUnitLinePeaks(
  dif: readonly number[],        // = computeMacdSeries(closes).macd
  begIndex: number,
  kTimes: readonly Date[],
  units: readonly { startTime: Date; endTime: Date }[],
): UnitLinePeaks[];
```

- `computeMacdSeries` 语义（由该 change 锁定）：委托 `technicalindicators` `MACD.calculate`（fast=12,
  slow=26, signal=9, EMA），过滤完整值后与输入对齐（begIndex 语义与 indicator.service.ts:56-58
  一致）。
- `computeUnitDirectionalAreas`：二分定位 `kTimes` 中 `[startTime, endTime]` 区间，只累加与方向
  同向的柱（up=正柱、down=负柱绝对值）；`i >= begIndex` 有效；无有效部分 → 0。
- `computeUnitLinePeaks`：同形二分定位，取区间内 `macd`（DIF 线）的 max/min。
- 两个增补函数命名/归属归 `extract-shared-indicators-library` 定稿（本 change 声明依赖其增补，
  该 change 未归档）。

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
  readonly zg: number;           // 中枢上沿（趋势链几何约束用）
  readonly zd: number;           // 中枢下沿
  readonly gg: number;           // 中枢最高（趋势链位置递进用）
  readonly dd: number;           // 中枢最低
}

/** 每单元力度（双分量，均为"越大越强"正向标量） */
export interface ChanUnitForce {
  readonly area: number;  // 方向柱面积（主判据：up=红柱面积 / down=绿柱面积，computeUnitDirectionalAreas）
  readonly peak: number;  // 黄白线（DIF）极值绝对值（up=|max| / down=|min|，computeUnitLinePeaks+调用方取绝对值）
}

/** 背驰判定入参：units 与 forces 按索引一一对齐 */
export interface ChanDivergenceInput {
  readonly units: readonly ChanDivergenceUnit[];
  readonly zhongshus: readonly ChanDivergenceZhongshu[];
  readonly forces: readonly ChanUnitForce[];   // 每单元力度（推荐来源 = @app/indicators 聚合）
}
```

> 调用方把 `ChanBi[]`/`ChanDuan[]`、`ChanChannel[]`/`ChanDuanChannel[]` 映射为上述最小结构接口
> （字段天然满足，仅需类型适配；`ChanDuanChannel` 已有 zg/zd/gg/dd，扩张合并产物 `expanded=true`
> 亦同规则透传——**不特殊处理**）；力度值由调用方经 `@app/indicators` 计算（area =
> `computeUnitDirectionalAreas`，peak = `computeUnitLinePeaks` 输出按方向取绝对值，均正向力度标量）。

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
  readonly enterForce: ChanUnitForce;  // 进入段力度（面积 + 黄白线）
  readonly leaveForce: ChanUnitForce;  // 离开段力度（面积 + 黄白线）
}
```

## 6. 算法

```
detectDivergences(input): ChanDivergence[]
  0. 前置：为每个中枢 z 定位 units 中首/末单元下标 s/e（按 firstUnitTime/lastUnitTime 精确匹配，
     找不到则跳过；s-1<0 或 e+1>=units.length 视为无进入/离开段）。
  1. 进入/离开段识别（24课 A/B/C 三段结构）：每个中枢 z 的
     - 进入段 = units[s-1]（中枢前最近一段，即 A 段）；离开段 = units[e+1]（中枢后最近一段，即 C 段）。
  2. 盘整背驰（每个中枢独立，无趋势前提）：
     - 有进入段且离开段时，双口径判定：
       leave.area < enter.area（面积缩小，24课主判据）
       且 leave.peak < enter.peak（黄白线不创新高，25课印证）
       → 产出 { Consolidation, z, s-1, e+1, ... }。
  3. 趋势链构造（同向中枢链，见 §2.1）：
     - 按中枢时间序扫描；方向一致（离开段 trend 同向）且连续两个同样的中枢 → 候选链
       （扩张已由 chan-central-extension Phase C 解决，expanded 中枢当普通中枢同规则）；
     - 候选链内相邻中枢满足**位置递进**（向上 后.gg>前.gg 且 后.dd>前.dd / 向下对称）→ 链成立；
       任一不满足 → 链断。（无独立非扩张判定——Phase C 已保证输入相邻波动区间严格不重叠。）
     - 链长 ≥ 2 才构成趋势。
  4. 趋势背驰（每条有效链的**最后一个中枢** z_last = 链末，即原典 B 中枢）：
     - 比较 z_last 的**进入段**（units[s-1]，即 A 段）vs **离开段**（units[e+1]，即 C 段），
       两者同向；双口径判定：leave.area < enter.area 且 leave.peak < enter.peak
       → 产出 { Trend, z_last, 进入段索引, 离开段索引, ... }。
  5. 返回全部背驰结果（盘整 + 趋势），按 zhongshuIndex 排序。
```

- 力度比较口径：**严格 <**（离开 < 进入才算背驰；等于不算），无 epsilon；双分量均须满足
  （面积与黄白线互为印证，单一分量不构成背驰——24课主判据 + 25课映像）。两分量均为正向力度
  标量（area=方向柱面积、peak=DIF 极值绝对值），chancore 内统一数值比较、无方向认知。
- 进入/离开段定位：按 startTime/endTime 精确匹配（与 extendChannel 同法），找不到则跳过（不臆断）。
- 趋势链只构造一次（对同一输入确定性）；同一条链只输出一条趋势背驰（链末中枢），链内各中枢的
  盘整背驰照常独立输出（允许趋势+盘整并存）。

## 7. 消费方式（无 HTTP 端点）

**背驰是策略模块的一部分**——消费方是策略评估/扫描（按用户定调），**本 change 不提供 REST 端点**。
交付形态：

- `ChanCore.detectDivergences` 为库能力（`@app/chancore` 导出），策略模块后续 owning change 调用：
  传入 units（笔/段）+ zhongshus（笔级/段级中枢）+ forces（经 `@app/indicators` 计算），
  得到背驰结果用于信号判定。符合 `chan-analysis-core` "运行时不得依赖公共 Indicator HTTP API"。
- 力度计算编排（`computeMacdSeries` → `computeUnitDirectionalAreas` + `computeUnitLinePeaks`）不封装
  进 chancore（Chancore 不计算指标），由策略模块消费时自行组装，或由共享管线 owning change 提供
  编排 helper（不在本 change 范围）。
- **真实数据验证走 scratch 脚本**（node 直连 `@app/chancore` + `@app/indicators` 打表核对），
  不依赖 HTTP。
- 不新增 `DivergenceVo`/DTO/mapper/controller 代码。

## 8. 确认门禁点

| ID | 决策 | 定案 | 说明 |
|----|------|------|------|
| D1 | 背驰形态 | 趋势 + 盘整都做 | 用户定调 |
| D2 | 力度数据源 | **方向柱面积 + 黄白线极值绝对值双分量**：`libs/indicators`（extract-shared-indicators-library 交付+增补）computeMacdSeries + **computeUnitDirectionalAreas**（方向面积）+ **computeUnitLinePeaks**（DIF 极值） | 用户定调：面积（24课"向上看红柱/向下看绿柱"）+ 黄白线绝对值（25课）；chancore 仍不计算指标 |
| D3 | 趋势背驰对比基准 | **趋势链最后一个中枢（B）的进入段 vs 离开段**（A/B/C 三段结构，两者同向，非跨链首尾） | 用户定调 + 缠师原文 24 课考证："C段的MACD柱子面积比A段对应的面积要小→标准背弛" |
| D4 | 复用方式 | **共享纯函数** `detectDivergences`（笔/段经最小结构接口） | 用户定调 |
| D5 | HTTP 端点 | **不提供**——背驰是策略模块的一部分，作为库能力消费；真实数据验证走 scratch 脚本 | 用户定调（原"提供端点"废弃） |
| D6 | `algorithmVersion` | **保持 2**（跟随 chan-central-extension 基线；本 change 纯增量不再 bump） | 中枢扩张已 1→2 |
| D7 | `libs/indicators` 边界 | 纯库（无 I/O、无 Nest/TypeORM），由 extract-shared-indicators-library 拥有与守卫；本 change 只消费+声明增补 | 用户拍板方案 A |
| D8 | 三块接入范围 | 本 change = 背驰共享纯函数 + 消费力度管线；**策略接入（含 ②回测、③实时信号）由策略 owning change 做** | 用户定调：背驰属策略模块 |
| D9 | 中枢扩张依赖 | 由 `chan-central-extension`（Phase C，已落地 46a4fb85）保证 phaseB 相邻中枢波动区间严格不重叠；**expanded 中枢当普通中枢看待**（用户定调），背驰**不特殊处理**、不做非扩张判定 | 用户定调：扩张的中枢当一个中枢看待即可 + "第二个中枢比第一个更上/更下" |

## 9. 边界与非目标

- **不做**：买卖点判定（后续 change）、持久化、migration、改现有算法、REST 端点、策略接入（②回测、
  ③实时信号归策略 owning change）、`IndicatorService` 其它方法迁移（归
  `extract-shared-indicators-library`）、中枢扩张处理（归 `chan-central-extension`，已落地）。
- **`libs/indicators` 增补**：`computeUnitDirectionalAreas` + `computeUnitLinePeaks` 归
  `extract-shared-indicators-library`（该 change 未归档，本 change 声明依赖其增补）。
- 背驰为**请求时实时派生**（无状态纯函数）；不新增 Compose service。

## 10. 验证策略

- 背驰判定 pure 单测：进入/离开段定位（含边界：无进入/无离开）、盘整背驰（双分量严格 < 口径、
  单一分量不构成）、趋势链构造（同向归链/异向断链/位置递进断链/孤立中枢/链长1/*expanded 当普通
  中枢*）、趋势背驰（末中枢 A vs C）、空输入、确定性、不变异。
- 经典 case fixture：构造 进入段力度 > 离开段 的盘整背驰 / 趋势背驰样例固化指纹。
- 真实数据验证（scratch 脚本，node 直连 `@app/chancore` + `@app/indicators`）：600519 + 方向柱面积 +
  黄白线极值绝对值 → 背驰结果人工核对（不固化到仓库、不依赖 HTTP）。
- 仓库基线：lint / typecheck / test:ci / ci:contracts / build:docker / openspec validate --all --strict。
