## Why

缠论依赖链 `笔 → 段 → 段级中枢 → 背驰 → 买卖点` 中，**背驰**是买卖点判定的核心（力度衰竭）。
笔、段、段级中枢均已就绪，且**笔级和段级的背驰算法一致**（用户定调：抽离复用）。

缠论背驰（缠中说禅24课等）：走势力度用 **MACD 红绿柱面积/高度**度量，**离开段力度 < 进入段力度**
即背驰。两种形态：
- **趋势背驰**：趋势（≥2 同向中枢）最后一个中枢的离开段力度衰减 → 一类买卖点基础。
- **盘整背驰**：中枢的进入段 vs 离开段力度对比（中枢震荡）→ 三类买卖点基础。

本 change 两者都做，作为**共享纯函数**（笔/段复用）。**力度数据来源明确**：共享指标库
`libs/indicators`（`computeMacd` + `computeUnitForces`）由独立 change
`extract-shared-indicators-library` 交付（本 change 只消费，不建库）；`IndicatorService.runMACD`
薄包装亦在该 change 内。`chan-analysis-core` 约束 ChanCore 不得 import 公共 IndicatorService、
不得拥有 KDJ/MACD——因此 **chancore 仍不计算指标**，forces 由调用方（经 `libs/indicators`）算好传入。

## What Changes

- **共享力度管线 = `extract-shared-indicators-library` 交付的 `libs/indicators`**：
  - `computeMacdSeries(closes)`：12/26/9 EMA → `{begIndex, macd, signal, histogram}`（本 change 使用
    `.histogram`）；
  - `computeUnitForces(histogram, begIndex, kTimes, units)`：每单元力度 = 单元 `[startTime, endTime]`
    区间内 histogram 面积和（begIndex 前无效段跳过）。
- `ChanCore` 新增 `detectDivergences(units, zhongshus, forces)` 共享纯函数（无状态、无 I/O）：
  对每个中枢识别**进入段/离开段**，对比力度，输出背驰结果（趋势/盘整）。
- 输入契约：
  - `units`：单元序列（笔 `ChanBi[]` 或段 `ChanDuan[]`，时间有序、方向交替），经最小结构接口适配；
  - `zhongshus`：中枢序列（笔级 `ChanChannel[]` 或段级 `ChanDuanChannel[]`），提供首/末单元边界；
  - `forces`：每单元力度值（`number[]`，与 units 对齐；推荐来源 = `libs/indicators` 面积聚合）。
- 输出 `ChanDivergence[]`：类型（趋势/盘整）、中枢位置、进入/离开段位置、双方力度值。
- 盘整背驰：每个中枢的 进入段 vs 离开段 力度对比（离开 < 进入 → 背驰）。
- 趋势背驰：同向中枢链（≥2 同向中枢）的力度递减判定。
- **提供 HTTP 端点** `POST /v1/chan/divergence`（与 `duan-channel` 同模式：IndicatorQueryDto 查 K →
  笔 → 段 → 段中枢 → MACD histogram → 力度聚合 → detectDivergences；chan 模块已注入 IndicatorModule，
  零新增依赖）。
- **不做**：买卖点判定（后续 change）、持久化、改现有算法、指标库建设（归
  `extract-shared-indicators-library`；②③ 接入在其 scope 内，本 change 只消费共享管线）。
- `algorithmVersion` 保持 1（纯增量）。

## Capabilities

### New Capabilities

- `chan-divergence`：定义背驰判定（趋势+盘整）的共享纯函数契约与输出类型。
  （共享指标库能力 `indicators-core` 归 `extract-shared-indicators-library` 拥有。）

### Modified Capabilities

- `chan-analysis-core`：facade 增加 `detectDivergences`（该 spec 的 "future Chan strength algorithm"
  占位场景正式落地）。

## Impact

- **`mist`**：
  - `libs/chancore`：背驰判定算法 + 类型 + pure 单测；facade/barrel 导出。
  - `apps/mist/src/chan`：新增 `POST /v1/chan/divergence`（DTO/VO/mapper/service 编排），力度经
    `extract-shared-indicators-library` 交付的 `@app/indicators` 计算。
  - （`libs/indicators` 建库与 `IndicatorService.runMACD` 薄包装由
    `extract-shared-indicators-library` 交付。）
- **Backtest/Realtime/Signal/Alert**：本 change 不接入运行时；力度管线由
  `extract-shared-indicators-library` 提供共享纯函数（②③ 在其 scope 内接入，符合
  `chan-analysis-core` "runtime MUST NOT depend on ChanCore or the public Indicator HTTP API"）。
- **数据库 / 部署**：无 migration、无部署拓扑变化。
- **后续依赖**：买卖点（依赖段+中枢+背驰）。
