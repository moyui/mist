## 1. 范围与契约门禁

- [x] 1.1 确认本 change 交付：`libs/indicators` core（六个 Series + 两个 Observation +
  computeUnitForces + 错误类型）、API 转换层（纯转换不做设计）、libs/strategy 委派、边界守卫；
  不做背驰判定/端点（归 add-chan-divergence）。
- [x] 1.2 逐条确认 design.md 门禁点 D1–D9（库范围、入参契约、出参双视图、API 转换、策略委派、
  边界守卫、②③ 接入范围、indicators-core 归属、回归门禁），确认后才进实施计划。
- [x] 1.3 确认裁剪 add-chan-divergence 范围（删除 indicators-core spec、tasks 2.x/3.x，
  编排链改 computeMacdSeries）。

## 2. `libs/indicators` 建库与注册

- [x] 2.1 nest g library（参照 `libs/chancore` 注册模式：nest-cli.json projects / tsconfig.json
  paths `@app/indicators` / package.json jest moduleNameMapper / tsconfig.lib.json）。
- [x] 2.2 barrel 导出 `@app/indicators`（函数 + 类型 + 错误类）；不导出 internal 实现。

## 3. core 实现（Series + Observation + computeUnitForces + 错误类型）

- [x] 3.1 `computeMacdSeries(closes)`：MACD.calculate（12/26/9 EMA）→ 过滤完整值 →
  `{begIndex, macd, signal, histogram}`（readonly 入参 + 内部拷贝）。
- [x] 3.2 `computeKdjSeries(high, low, close, params?)`：Stochastic(9, kSmoothing) → 过滤有限 d →
  SMA(dSmoothing) → K/D/J 对齐 → `{begIndex, K, D, J}`。
- [x] 3.3 `computeRsiSeries(closes, period=14)` / `computeAdxSeries(..., period=14)` /
  `computeAtrSeries(..., period=14)` / `computeDualMaSeries(closes, params?)` →
  各自 `{begIndex, ...arrays}`。
- [x] 3.4 `computeMacdObservation(closes, opts?)`：Series 末位 + `windowSize` 硬校验 + 有限守卫 →
  `{line, signal, histogram}`。
- [x] 3.5 `computeKdjObservation(high, low, close, opts?)` → `{k, d, j}`。
- [x] 3.6 `IndicatorInputError`（windowSize 不匹配/参数非法）+ `IndicatorValueError`（末位非有限）。
- [x] 3.7 `computeUnitForces(histogram, begIndex, kTimes, units)`：二分定位区间、求和有效部分、
  无有效部分 → 0。
- [x] 3.8 pure 单测：Series 与现实现逐值一致（golden 夹具）、**Observation === Series 末位不变量**、
  windowSize 硬校验、错误类型、begIndex/warmup/空输入、readonly 不变异、确定性。

## 4. API 老接口转换层（纯转换，不做设计）

- [x] 4.1 runMACD/runRSI 委托默认参数 Series；**runKDJ 委托默认 (9,3,3)（修复原 API (14,3,3)，见
  design §4.1 行为变更清单）**；`map(Number)` 强转保留；`formatIndicator` 重对齐（K 等长 + warmup
  NaN）+ nbElement；HTTP 响应除 KDJ 外不变。
- [x] 4.2 runADX/runDualMA/runATR 委托；方法签名与行为不变。
- [x] 4.3 indicator.service.spec：MACD/RSI 用例全绿（行为回归锁定），**KDJ 用例更新为新默认
  (9,3,3)（原 (14,3,3) 断言随修复改写）**。

## 5. libs/strategy 委派（②③ 接入）

- [x] 5.1 `calculateStrategyMacd`：窗口校验保留 → `computeMacdObservation(closes, {windowSize: 130})`
  → `{line, signal, histogram}`。
- [x] 5.2 `calculateStrategyKdj`：同法 → `computeKdjObservation(..., {windowSize: 13})` → `{k, d, j}`。
- [x] 5.3 常量/field catalog/requiredBarCount/缓存语义不变；strategy analysis spec 全绿。
- [x] 5.4 委派等价性单测：同窗口输入，断言委派前后末位观测值相等。

## 6. 边界守卫

- [x] 6.1 纯净守卫（照抄 chancore-boundary.guard.spec.ts：注册断言 + 禁 import + 禁 process.env）。
- [x] 6.2 `technicalindicators` 收敛守卫：全仓扫描仅 `libs/indicators` import。

## 7. 裁剪 add-chan-divergence

- [x] 7.1 删除 `specs/indicators-core/spec.md`（需求并入本 change）。
- [x] 7.2 删除 tasks 2.1-2.5（建库）与 3.1-3.2（runMACD 薄包装），重新编号。
- [x] 7.3 proposal/design 引用更新：`libs/indicators` 由本 change 交付；编排链改
  `computeMacdSeries(closes).histogram` + `computeUnitForces`。

## 8. 验证与交付

- [x] 8.1 仓库基线全绿：lint / typecheck / test:ci / ci:contracts / build:docker /
  openspec validate --all --strict。
- [x] 8.2 检索全仓：`technicalindicators` 仅 `libs/indicators` import；`libs/indicators` 无
  TypeORM/Redis/HTTP/Nest/env import；HTTP 契约无变化。
- [x] 8.3 性能基线记录（§3.2 实测：回测最坏 ≈20s 在预算内，不设断言）。
- [x] 8.4 向项目负责人审阅 validation evidence 后才归档。