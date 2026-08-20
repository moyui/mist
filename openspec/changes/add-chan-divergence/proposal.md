## Why

缠论依赖链 `笔 → 段 → 段级中枢 → 背驰 → 买卖点` 中，**背驰**是买卖点判定的核心（力度衰竭）。
笔、段、段级中枢均已就绪，且**笔级和段级的背驰算法一致**（用户定调：抽离复用）。

缠论背驰（缠中说禅24课等）：走势力度用 **MACD 红绿柱面积/高度**度量，**离开段力度 < 进入段力度**
即背驰。两种形态：
- **趋势背驰**：趋势（≥2 同向中枢）最后一个中枢的离开段力度衰减 → 一类买卖点基础。
- **盘整背驰**：中枢的进入段 vs 离开段力度对比（中枢震荡）→ 三类买卖点基础。

本 change 两者都做，作为**共享纯函数**（笔/段复用）。**力度数据来源明确**：共享指标库
`libs/indicators`（`computeMacdSeries` + 增补力度聚合）由独立 change
`extract-shared-indicators-library` 交付（本 change 只消费，不建库）；`IndicatorService.runMACD`
薄包装亦在该 change 内。**中枢扩张已由 `chan-central-extension`（Phase C，已落地 46a4fb85）解决**：
phaseB 输出相邻中枢波动区间严格不重叠，扩张合并产物 `expanded=true` 为同级别中枢、背驰当普通中枢
看待。`chan-analysis-core` 约束 ChanCore 不得 import 公共 IndicatorService、
不得拥有 KDJ/MACD——因此 **chancore 仍不计算指标**，forces 由调用方（经 `libs/indicators`）算好传入。

## What Changes

- **共享力度管线 = `extract-shared-indicators-library` 交付的 `libs/indicators`（+声明增补）**：
  - `computeMacdSeries(closes)`：12/26/9 EMA → `{begIndex, macd, signal, histogram}`（本 change 使用
    `.histogram` 与 `.macd`）；
  - **【增补】** `computeUnitDirectionalAreas(histogram, begIndex, kTimes, units, directions)`：每单元
    **方向柱面积**（缠论24课"向上看红柱、向下看绿柱"：up=Σmax(histogram,0) 红柱 / down=
    Σmax(-histogram,0) 绿柱，正向力度标量越大越强；begIndex 前无效段跳过）；
  - **【增补】** `computeUnitLinePeaks(dif, begIndex, kTimes, units)`：每单元 DIF 线 max/min 极值，
    调用方按方向取绝对值（up=|max|、down=|min|）。
- `ChanCore` 新增 `detectDivergences(units, zhongshus, forces)` 共享纯函数（无状态、无 I/O）：
  对每个中枢识别**进入段/离开段**，对比力度，输出背驰结果（趋势/盘整）。
- 输入契约：
  - `units`：单元序列（笔 `ChanBi[]` 或段 `ChanDuan[]`，时间有序、方向交替），经最小结构接口适配；
  - `zhongshus`：中枢序列（笔级 `ChanChannel[]` 或段级 `ChanDuanChannel[]`），提供首/末单元边界 +
    zg/zd/gg/dd（expanded 中枢同规则，不特殊处理）；
  - `forces`：每单元力度值（`ChanUnitForce[]`，{area, peak}，与 units 对齐；推荐来源 =
    `libs/indicators` 增补聚合）。
- 输出 `ChanDivergence[]`：类型（趋势/盘整）、中枢位置、进入/离开段位置、双方力度（方向面积+黄白线双分量）。
- 盘整背驰：每个中枢的 进入段 vs 离开段 力度对比（面积缩小 + 黄白线极值衰竭，双口径均满足 →
  背驰）。
- 趋势背驰（24课 A/B/C 三段结构）：本 change 内现构造**同向中枢链**（≥2 同向中枢：离开段方向一致 +
  **位置递进**（向上整体抬高/向下整体降低，用 gg/dd），方向由构成段 trend 推导，不新增独立模块；
  非扩张由 chan-central-extension Phase C 保证、本 change 不再判定）；对链**最后一个中枢（B）**
  比较其**进入段（A）vs 离开段（C）**（同向、双口径均衰竭）→ 趋势背驰。
- **不提供 HTTP 端点**——背驰是策略模块的一部分，作为库能力消费（`ChanCore.detectDivergences`），
  真实数据验证走 scratch 脚本直连纯函数。
- **不做**：买卖点判定（后续 change）、持久化、改现有算法、指标库建设（归
  `extract-shared-indicators-library`，含方向面积+黄白线极值聚合增补；②③ 接入在其 scope 内，
  本 change 只消费共享管线）、中枢扩张处理（归 `chan-central-extension`，已落地）。
- `algorithmVersion` 保持 2（跟随 chan-central-extension 基线，纯增量不再 bump）。

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
  - 不新增 HTTP 端点、不新增 DTO/VO/mapper/controller——背驰作为库能力由策略模块后续接入。
  - （`libs/indicators` 建库与 `IndicatorService.runMACD` 薄包装由
    `extract-shared-indicators-library` 交付。）
- **Backtest/Realtime/Signal/Alert**：本 change 不接入运行时；力度管线由
  `extract-shared-indicators-library` 提供共享纯函数（②③ 由策略/各自 owning change 接入，符合
  `chan-analysis-core` "runtime MUST NOT depend on ChanCore or the public Indicator HTTP API"）。
- **数据库 / 部署**：无 migration、无部署拓扑变化。
- **后续依赖**：买卖点（依赖段+中枢+背驰）。
