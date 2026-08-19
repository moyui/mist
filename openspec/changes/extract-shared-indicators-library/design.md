# Design — extract-shared-indicators-library

## 1. 背景与基线

- 两套平行指标实现（同参数不同口径）：
  - `IndicatorService.runMACD/runKDJ/runRSI/runADX/runDualMA/runATR`
    （apps/mist/src/indicator/indicator.service.ts，全序列 TA-Lib 风格，begIndex + 数组）；
  - `calculateStrategyMacd`（libs/strategy/src/analysis/strategy-macd.ts，130 根精确窗口单点）、
    `calculateStrategyKdj`（strategy-kdj.ts，13 根），供回测（apps/backtest → evaluateStrategyPlan）
    与实时（apps/signal → RealtimeStrategyEvaluationService → 同一 evaluator）共用。
- 治理约束（openspec/specs/chan-analysis-core/spec.md:214-238）：ChanCore 不得 import 公共
  IndicatorService/Strategy evaluator；回测/实时运行时不得依赖公共 Indicator HTTP API →
  指标数学必须走**纯库**（`libs/indicators`）。
- 用户拍板（08-14）：① 库范围 = 全部六个函数 + `computeUnitForces`；② 本 change 三处全接
  （API 薄包装 + 策略委派，回测/实时自动继承）；③ 新建独立 change 拥有 `indicators-core`，
  `add-chan-divergence` 裁剪建库部分；④ `computeUnitForces` 留在库内。
- 纯增量：不改策略语义/算法输出（**唯一例外 = API KDJ 参数修复 (14,3,3)→(9,3,3)，见 §4.1**）；
  无持久化；`algorithmVersion` 不受影响。

## 2. 三个消费场景的既有契约（分析结论）

| 场景 | 定义处（spec/change） | 现状形态 |
|------|----------------------|----------|
| ① API | mist-api-path-standardization（/v1/indicators/* 路由）、astrbot-integration（Skills 调 POST /v1/indicators/macd）、chan-analysis-http-contract（/v1/indicators/k high/low）、review-p2-backend-runtime-sweep（findKData 显式 source/period） | IndicatorService 全序列 + begIndex + formatIndicator NaN 对齐 |
| ② 回测 | strategy-evaluation-contract（KDJ 13 / MACD 130 固定窗口、catalog、纯 evaluator）、strategy-signal-backtesting（与实时完全相同 rolling 窗口）、extract-backtest-runtime（窗口跨页连续、不得依赖公共 Indicator HTTP API） | Strategy-owned Indicator calculations（calculateStrategyMacd/Kdj）→ StrategyAnalysisObservationCache → evaluateStrategyPlan |
| ③ 实时 | run-realtime-strategy-evaluation（归档）、strategy-runtime-architecture（指标与 ChanCore 分离拥有者） | 与回测共用同一 evaluator；按 (securityId, source, period) 共享窗口；同组同算法同参数只算一次；无 EMA checkpoint |

## 3. `@app/indicators` core 契约（入参/出参）

无 I/O、无 Nest/TypeORM、无 env 依赖，可被任意 app/库复用。纯净边界守卫照抄
`libs/chancore/src/chancore-boundary.guard.spec.ts` 模式（禁 @app/@nestjs/typeorm/ioredis/http 等
前缀 + process.env 检查）。底层 = `technicalindicators@3.1.0`（generator 流式实现；
`reversedInput` 未设置时**不变异输入**——2026-08-14 实证）。

### 3.1 定位

与场景无关的指标数学核心：入参 = 有序数值序列；出参 = 两种视图——
**序列视图（Series）**（全量，供 ① API 转换）与**锚点观测视图（Observation）**（末位标量，
供 ② 回测 / ③ 实时求值）。两视图同一计算源，`observation === series 末位`（不变量，单测锁定）。

### 3.2 入参规划

| 规则 | 定案 |
|------|------|
| 序列形态 | `readonly number[]`；单序列（closes）或三序列等长（high/low/close） |
| 顺序 | 调用方约定时间升序（core 不校验顺序——纯数学与顺序无关，语义归调用方） |
| 数值有效性 | 调用方保证有限数（策略侧经 `KPriceProjector` + `requireExactStrategyBars`；API 侧 DTO 校验）；core 不做 `Number()` 强转 |
| **readonly 适配（C0）** | core 内部 `[...values]` 拷贝后传 technicalindicators（其声明为可变 `number[]`，TS 类型不兼容 readonly；运行时不变异已实证，拷贝为类型安全 + 未来防御） |
| 空输入 / 不足 warmup | **不抛错**：返回空数组、`begIndex = 输入长度`（与现实现一致；策略侧由 130/13 硬校验兜底） |
| 参数 | MACD **固定** 12/26/9（catalog 锁定，不暴露参数）；| 参数 | MACD **固定** 12/26/9（catalog 锁定，不暴露参数）；KDJ 默认 = (9,3,3)（catalog 权威）；**API 原为 (14,3,3)（controller 实值，注释误写 9）→ 本 change 顺手修复为 (9,3,3) 统一**（唯一 API 输出变更，见 §4）；RSI/ADX/ATR/DualMA 可选覆写、默认冻结值 |

性能实测（2026-08-14，node 5 次中位数）：MACD 130 窗口 **0.07ms**；2500 根（600519 全历史日线）
2.1ms；1.4 万根（API 1m 查询数月）8ms；30 万根（5 年 1m）149ms；**回测最坏**（30 万 bar × 每根
重算 130 窗口，无 checkpoint）≈ **20s**，占回测预算（`BACKTEST_RUN_TIMEOUT_MS`=1,800,000ms）1.1%，
且 `StrategyAnalysisObservationCache` 同组复用再砍重复计算。

### 3.3 出参：序列视图（Series，供 ① API）

```ts
interface MacdSeriesResult   { readonly begIndex: number; readonly macd: number[]; readonly signal: number[]; readonly histogram: number[]; }
interface KdjSeriesResult    { readonly begIndex: number; readonly K: number[]; readonly D: number[]; readonly J: number[]; }
interface RsiSeriesResult    { readonly begIndex: number; readonly rsi: number[]; }
interface AdxSeriesResult    { readonly begIndex: number; readonly adx: number[]; }
interface AtrSeriesResult    { readonly begIndex: number; readonly atr: number[]; }
interface DualMaSeriesResult { readonly begIndex: number; readonly shortMA: number[]; readonly longMA: number[]; }
```

- 对齐规则：`out[i]` 对应 `in[i + begIndex]`；仅含有效值（**过滤式**）。
- 过滤/对齐语义与现实现**逐值一致**：`technicalindicators` 各函数返回已过滤数组（无
  NaN/undefined 残留），唯一例外 `Stochastic.calculate` 返回等长数组（warmup 段 `d` 为
  undefined）→ core 复刻现实现过滤步骤（MACD 滤完整值、KDJ 滤有限 d 后 SMA/对齐）。
- 输出数组元素与现实现**逐值相等**（同一 technicalindicators 调用 + 同一过滤/对齐步骤）。
- **API 响应 = 与 K 等长的数组（warmup 段 NaN 填充）**（controller `formatIndicator(begIndex,
  index, data)` 语义：`index < begIndex ? NaN : data[index - begIndex]`，每项附
  `symbol/time/close`）→ Series 视图的职责 = 输出有效数组 + begIndex，转换层负责重对齐
  （一行 `formatIndicator` 即完成），**core 不产生等长 NaN 响应**。

### 3.4 出参：锚点观测视图（Observation，供 ②③）

```ts
interface MacdObservation { readonly line: number; readonly signal: number; readonly histogram: number; }
interface KdjObservation  { readonly k: number; readonly d: number; readonly j: number; }

computeMacdObservation(closes: readonly number[], opts?: { windowSize?: number }): MacdObservation
computeKdjObservation(
  high: readonly number[], low: readonly number[], close: readonly number[],
  opts?: { windowSize?: number },
): KdjObservation
```

- 锚点 = 输入序列末位（传入的序列即锚点窗口）；
- `windowSize` **可选硬校验**：传了则输入长度必须恰等于它，否则抛 `IndicatorInputError`
  （把 strategy-evaluation-contract"锚点只从精确窗口重算、不得 differently seeded"硬化进 core；
  策略层传 130/13，双保险）；
- 末位非有限 → 抛 `IndicatorValueError`（与现 `requireFiniteAnalysisValue` 抛错行为一致；
  与 Series 的过滤式形成"API 容忍 warmup / 策略锚点必须有效"的本质差异）。

### 3.5 两视图不变量

> `computeMacdObservation(closes, {windowSize}) === 末位(computeMacdSeries(closes))`
> （同输入同参数 → 同数值；单测锁定，保证三场景数值永远一致）

### 3.6 逐函数签名总表

| 函数 | 入参 | 出参 | 消费场景 |
|------|------|------|----------|
| computeMacdSeries | closes | {begIndex, macd[], signal[], histogram[]} | ① API |
| computeMacdObservation | closes, opts.windowSize? | {line, signal, histogram} | ② 回测 ③ 实时 |
| computeKdjSeries | high, low, close, params?（默认 9,3,3；API 由 (14,3,3) 修复为 (9,3,3)） | {begIndex, K[], D[], J[]} | ① API |
| computeKdjObservation | high, low, close, opts.windowSize? | {k, d, j} | ② 回测 ③ 实时 |
| computeRsiSeries | closes, period=14 | {begIndex, rsi[]} | ① API |
| computeAdxSeries | high, low, close, period=14 | {begIndex, adx[]} | ①（无路由） |
| computeAtrSeries | high, low, close, period=14 | {begIndex, atr[]} | ①（无路由） |
| computeDualMaSeries | closes, params?（13,60） | {begIndex, shortMA[], longMA[]} | ①（无路由） |
| computeUnitForces | histogram, begIndex, kTimes, units | number[]（每单元） | 背驰（add-chan-divergence） |

### 3.7 computeUnitForces（第二层，背驰专用）

每单元二分定位 `kTimes` 中 `[startTime, endTime]` 区间，求和 `histogram` 有效部分（`i >= begIndex`），
无有效部分 → 0。契约与 add-chan-divergence design §3 原样（histogram 现由
`computeMacdSeries(...).histogram` 提供）。

### 3.8 错误类型

- `IndicatorInputError`：windowSize 不匹配、参数非法（参照 chancore `ChanInputError` 先例）；
- `IndicatorValueError`：Observation 末位非有限（参照 `ChanInvariantError` 先例）；
- 均 barrel 导出；Series 路径不抛（过滤式）。

## 4. API 老接口转换（不做设计）

`IndicatorService` 六方法 = **薄转换层**（用户定调：老接口，落地时直接转换）。职责清单（仅此
四项，别无他物）：
1. DTO 校验与 `findKData`（现状不动）；
2. **`Number()` 强转**：K 的 OHLC 经 mysql2 可能为 decimal 字符串 → 喂 core 前 `map(Number)`
   （MACD/RSI/KDJ 单值路径沿用现 `runMACD` 行为；KDJ 三序列 high/low/close 各转一次）；
3. **委托 core**：MACD/RSI → 默认参数 Series；**KDJ → 默认 (9,3,3)**（controller 原构造
   `period: 14` 一并移除，注释同步修正）；
4. **组装**：`formatIndicator` 重对齐为 K 等长响应（warmup NaN）+ `{begIndex, nbElement}`；
   runADX/runDualMA/runATR 委托后按现签名返回（无路由、无调用者）。

HTTP 契约除下述 KDJ 修复外不变；`technicalindicators` import 从 indicator.service.ts 移除。
**本 change 不展开此层设计**。

### 4.1 行为变更清单（唯一 API 输出变更，用户 08-14 拍板"顺手修复"）

- **`POST /v1/indicators/kdj` 的 Stochastic `period` 由 14 改为 9**（controller 现构造
  `period: 14` 与注释 `period=9` 不一致；修复后与 core 默认/策略 catalog (9,3,3) 一致）→
  该端点输出值变化（有意修复，非回归）；KDJ 消费者（前端/技能）需知悉，实施计划/HIL 确认影响面。
- 其余端点（macd/rsi/k）与 `runADX/runDualMA/runATR`：输出逐值不变。

## 5. 策略层委派（②③ 接入）

- `calculateStrategyMacd(bars[130])`：窗口校验（requireExactStrategyBars）保留 →
  `computeMacdObservation(closes, {windowSize: 130})` → `{line, signal, histogram}`。
  **逐值等价论证**：现实现对 130 根 closes 取 `MACD.calculate` 末位 + `requireFiniteAnalysisValue`
  守卫；Observation 视图 = 同一计算源的 series 末位 + `IndicatorValueError`（130 根末位必有限，
  两路径输出相等）。
- `calculateStrategyKdj(bars[13])`：同上 → `computeKdjObservation(..., {windowSize: 13})` →
  `{k, d, j}`。
- 不变项：`STRATEGY_MACD_CALCULATION_BAR_COUNT=130`、`STRATEGY_KDJ_CALCULATION_BAR_COUNT=13`、
  field catalog（indicator.kdj.* / indicator.macd.*）、编译 `requiredBarCount`（crossover +1）、
  `StrategyAnalysisObservationCache` 缓存语义、quantity 投影。
- `libs/strategy` 不再 import `technicalindicators` → 收敛守卫成立。
- 回测（apps/backtest）与实时（apps/signal）经 `evaluateStrategyPlan` 自动继承，**零代码改动**。

## 6. 边界守卫

- `libs/indicators` 纯净守卫（照抄 chancore-boundary.guard.spec.ts）：不 import
  @app/@nestjs/typeorm/mysql2/ioredis/redis/bullmq/axios/undici/http/https/dotenv；不读 process.env；
  nest-cli.json / tsconfig paths / jest moduleNameMapper 注册断言。
- `technicalindicators` 收敛守卫：全仓扫描 src（libs + apps），断言仅 `libs/indicators` 的文件
  import `technicalindicators`。

## 7. 与 add-chan-divergence 的边界

- 本 change 拥有 `indicators-core` 能力；`add-chan-divergence` 裁剪建库部分：
  - 删除其 `specs/indicators-core/spec.md`（需求并入本 change）；
  - 删除其 tasks 2.1-2.5（建库）与 3.1-3.2（runMACD 薄包装），重新编号；
  - 编排链调用点由 `computeMacdHistogram` 改为 `computeMacdSeries(closes).histogram`；
  - 保留：背驰判定共享纯函数（`detectDivergences`）、`POST /v1/chan/divergence` 端点、
    chan-analysis-core MODIFIED delta（其"调用方经 @app/indicators 计算力度"场景引用本 change 的库）。
- 背驰端点编排链（见 add-chan-divergence design §7）：
  `findKData → createBi → createDuan → createDuanChannels → computeMacdSeries → computeUnitForces →
  detectDivergences`。

## 8. 确认门禁点

| ID | 决策 | 定案 | 说明 |
|----|------|------|------|
| D1 | 库范围 | 六个 Series 函数 + 两个 Observation 函数（MACD/KDJ）+ `computeUnitForces` | 用户拍板"全部六个"；C1：observation 仅 MACD/KDJ（②③ 只消费这两个） |
| D2 | 入参契约 | `readonly number[]` + core 内部拷贝；参数冻结（MACD 固定 12/26/9，其余可选覆写默认冻结）；空输入/不足 warmup 不抛错 | C0 实证：technicalindicators 不变异输入；性能实测见 §3.2 |
| D3 | 出参：双视图 | Series（全序列 begIndex 对齐，① API）+ Observation（锚点末位标量 + windowSize 可选硬校验 + `IndicatorValueError`，②③）；不变量 `observation === series 末位` | C1/C2/C3 确认 |
| D4 | API 老接口转换 | 薄转换层（DTO 校验 + 强转 + 委托 + `formatIndicator` 组装），HTTP 契约除 **KDJ 修复为 (9,3,3)**（§4.1）外不变；**不做设计** | 用户指示；KDJ 修复用户拍板"顺手修" |
| D5 | 策略委派 | calculateStrategyMacd/Kdj → `computeMacdObservation/computeKdjObservation`（windowSize 130/13）；窗口校验/守卫/缓存/catalog 不变 | 逐值等价论证见 §5 |
| D6 | 边界守卫 | 纯净守卫（chancore 模式）+ technicalindicators 收敛守卫 | 全仓扫描 |
| D7 | ②③ 接入范围 | 本 change 全接（经策略委派自动继承；backtest/signal 零改动） | 用户拍板 |
| D8 | indicators-core 归属 | 新 change 拥有；add-chan-divergence 已裁剪建库部分 | 用户拍板；spec-delta 归 owning change |
| D9 | 回归门禁 | indicator.service.spec：MACD/RSI 全绿、**KDJ 用例更新为 (9,3,3)**；strategy analysis spec 全绿；Series/Observation golden 夹具 + 不变量单测 | 行为不变性（KDJ 为例外修复） |

## 9. 边界与非目标

- **不做**：新增 HTTP 端点（ADX/ATR/DualMA 仍无路由）；新增 catalog 字段（RSI 不进 field catalog）；
  migration；部署变化；`findKData` 改动；背驰判定与 `/v1/chan/divergence`（归 add-chan-divergence）；
  `runADX/runATR/runDualMA` 死代码清理（仅迁移，删除与否另行评估）；API 转换层设计（见 §4）。
- `algorithmVersion`（chancore 1 / 策略版本）不受影响。
- `libs/indicators` 不持有任何 K 线/行情访问能力（`findKData` 仍在 IndicatorService）。

## 10. 验证策略

- `libs/indicators` pure 单测：Series 与现实现逐值一致（golden 夹具）、begIndex/warmup/空输入、
  **Observation 与 Series 末位不变量**、`windowSize` 硬校验、错误类型（Input/Value）、确定性、
  不变异、纯净边界守卫、收敛守卫。
- 性能参考：回测最坏 ≈20s 在预算内（§3.2 实测，落地时不设性能断言，仅记录基线）。
- `indicator.service.spec`（MACD/RSI 全绿，KDJ 用例随修复更新）/ `libs/strategy` analysis spec
  保持全绿（回归锁定）。
- `add-chan-divergence` 裁剪后 validate 通过。
- 仓库基线：lint / typecheck / test:ci / ci:contracts / build:docker / openspec validate --all --strict。
- 全绿后向用户提交 spec 终稿审阅；确认后才进实施计划（三步工作流第 2 步）。
