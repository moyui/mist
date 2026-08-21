## Why

MACD/KDJ 指标计算当前是**两套平行实现**，参数相同（MACD 12/26/9 EMA、KDJ 9,3,3）但代码未共享：

1. `apps/mist/src/indicator/indicator.service.ts` — 全序列 TA-Lib 风格输出（`{begIndex, ...arrays}`），
   服务公共 HTTP 端点（`POST /v1/indicators/macd|kdj|rsi`）；`findKData` 同时供 chan 端点读 K；
2. `libs/strategy/src/analysis/strategy-macd.ts|strategy-kdj.ts` — 精确窗口（MACD 130 / KDJ 13）
   单点观测，经 `StrategyAnalysisObservationCache` 供**回测与实时策略共用**（同一
   `evaluateStrategyPlan`）。

两套都包装 `technicalindicators`，指标数学没有单一拥有者。暂停中的 `add-chan-divergence` 需要
MACD histogram 作背驰力度管线前置，进一步暴露该缺口。

本 change 把指标数学抽为 `libs/indicators` 纯库（`@app/indicators`），三个消费场景统一接入：
**① 公共 Indicator HTTP 端点（薄包装，契约不变）**、**② 回测（经策略层委派自动继承）**、
**③ 实时策略（同②）**；`technicalindicators` import 收敛到库内一处。

## What Changes

- **新增 `libs/indicators` 纯库**（core：无 I/O、无 Nest/TypeORM、无 env 依赖；可被任意 app/库复用）：
  - **六个全序列函数（Series 视图）**：`computeMacdSeries` / `computeKdjSeries` / `computeRsiSeries` /
    `computeAdxSeries` / `computeAtrSeries` / `computeDualMaSeries`，TA-Lib 风格 `{begIndex, ...arrays}`
    输出，begIndex/过滤/对齐语义与 `IndicatorService` 现实现**逐值一致**（参数冻结：12/26/9、9,3,3、
    14、14、14、13/60）；
  - **两个锚点观测函数（Observation 视图，供回测/实时）**：`computeMacdObservation` /
    `computeKdjObservation`——输入序列末位标量，`windowSize` 可选硬校验（`IndicatorInputError`），
    末位非有限抛 `IndicatorValueError`；与 Series 末位数学一致（不变量）；
  - `computeUnitForces`（MACD 柱面积聚合，从 `add-chan-divergence` 移入）。
- **API 老接口 = 薄转换层（不做设计）**：`IndicatorService` 六方法仅 DTO 校验 + `Number()` 强转 +
  委托 core + `formatIndicator` 重对齐组装（响应与 K 等长、warmup 段 NaN）；HTTP 契约除**KDJ
  参数修复**外逐值不变；**KDJ 由原 (14,3,3) 修复为默认 (9,3,3)（唯一 API 输出变更，controller
  现注释/实现不一致）**；`runADX/runDualMA/runATR` 签名与行为不变（无 HTTP 路由、无调用者）。
- **`libs/strategy` 委派**：`calculateStrategyMacd/calculateStrategyKdj` 改为调用
  `computeMacdObservation/computeKdjObservation` 并在精确窗口（130/13）上取锚点观测；
  `requireExactStrategyBars` 窗口校验、有限值守卫、field catalog、`requiredBarCount`（含 crossover
  +1）、观察缓存与"同组同算法同参数只算一次"语义**全部不变**；`libs/strategy` 不再 import
  `technicalindicators`。
- **边界守卫**：`libs/indicators` 纯净守卫（照抄 `chancore-boundary.guard.spec.ts` 模式）+
  全仓 `technicalindicators` 收敛守卫（只允许 `libs/indicators` import）。
- **不做**：新增 HTTP 端点；新增 catalog 字段（RSI 等不进 field catalog）；migration；部署拓扑变化；
  背驰判定/`POST /v1/chan/divergence`（归 `add-chan-divergence`，本 change 只交付共享管线）。

## Capabilities

### New Capabilities

- `indicators-core`：无状态指标 core（Series 全序列 + Observation 锚点观测 + 单元力度聚合）的
  纯函数契约（`libs/indicators`，供 API 转换、策略层委派与背驰调用方复用）。

### Modified Capabilities

- `strategy-evaluation-contract`：新增需求——共享 Strategy 求值器的 KDJ/MACD 观测 SHALL 经
  `@app/indicators` 纯函数在精确 catalog 窗口上计算（窗口/参数/无 checkpoint 语义不变）。

## Impact

- **`mist`**：`libs/indicators`（新库）+ `apps/mist/src/indicator`（六方法薄包装）+
  `libs/strategy/src/analysis`（委派）。
- **Backtest / Signal（②③）**：零代码改动，行为继承（均经 `evaluateStrategyPlan`）；
  符合 `chan-analysis-core`/`strategy-runtime-architecture`"运行时不得依赖公共 Indicator HTTP API"。
- **chan**：零改动（仅经 `IndicatorService.findKData` 读 K，接口不变）。
- **`add-chan-divergence`**（暂停）：裁剪建库部分（specs/indicators-core 并入本 change、
  tasks 2.x/3.x 移除），续做时直接 import `@app/indicators`。
- **数据库 / 部署**：无 migration、无 Compose/部署变化。
- **回归门禁**：`indicator.service.spec` + `libs/strategy` analysis spec 保持全绿。
