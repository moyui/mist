# Proposal — add-chan-bsp-realtime-evaluation

## Why

缠论买卖点检测（`add-chan-buy-sell-point`，2026-08-21 归档）已作为共享纯函数落地，但
**生产零消费方**：实时策略引擎（signal app）只支持 DSL 算子规则（字段/算子树），缠论三类
买卖点是结构识别事件，无法以现有 DSL 表达，实时链路完全未接入。

用户已拍板方案（2026-08-21 讨论定稿）：

- 策略引擎是一个**大的配置集合**，`kind` 区分策略类型；缠论配置是其中一种独立配置，
  与算子（`rule_dsl`）配置并列——参照 backtrader Signal 的"信号积木"形态，**不做**
  vnpy 式可插拔基座/信号源注册体系；
- 实时链路已完成（1m sealed bar → BullMQ → `RealtimePeriodBuilder` →
  `RealtimeStrategyEvaluationService` → persist → notification），本次补齐
  "结构信号求值"这一环；
- 区间套/多级别递归**不在本 change**（语义未定，后话，ChanCore 接口不改）；
- "信号是否推入消息队列"的投递决策属未来独立"计算引擎"，不在本 change（现阶段只做
  配置裁剪）。

## What Changes

- **策略定义加 `kind`**：`StrategyDefinition` 新增 `kind` 列（enum：`rule_dsl`（默认）|
  `chan_bsp`），forward-only migration。`kind` 决定 rule 的 schema 与编译/求值路径。
- **chan_bsp 配置 schema**（rule JSON，`ruleSchemaVersion` 复用 V1）：
  `{ units: 'bi'|'duan', points: { first?, second?, third? }, direction: 'buy'|'sell'|'both' }`；
  `level` 复用 `definition.periods`（**单值**，1/5/15/30/60，日线不在实时档）。
  无 minBars——窗口长度是检测器内部常量，产出语义就是"是不是一买/二买/三买 × 买卖"。
- **registry 编译分派**：`compileRegistryDefinition` 按 `kind` 分派——
  `rule_dsl` 走现有 `compileStoredStrategyRule`（不动）；`chan_bsp` 新增
  `compileChanBspConfig`（校验 + 编译成 `ChanBspPlan`）。`SignalRegistryDefinition.executionPlan`
  变为 discriminated union：`{ kind:'rule_dsl', plan: CompiledStrategyExecutionPlan }` |
  `{ kind:'chan_bsp', plan: ChanBspPlan }`。
- **evaluation 求值分派**：`RealtimeStrategyEvaluationService.evaluate` 按 `plan.kind` 分派——
  `rule_dsl` 走现有 `evaluateStrategyPlan`（不动）；`chan_bsp` 走新增
  `ChanBspDetector`。统一产出现有 `ShadowStrategyCandidate` 形态，persist/delivery/
  episode 机制全复用。
- **`ChanBspDetector`**（新，`apps/signal/src/realtime/chan/`）：**无状态纯函数**
  （窗口 → 全量已确认点事件），内部串联 chancore 8 步 pipeline + `@app/indicators`
  力度计算（`computeMacdSeries` + `computeUnitDirectionalAreas` + `computeUnitLinePeaks`，
  全现成）；按 plan 的 points/direction 过滤。无状态设计同时服务实时评估与未来离线
  逐 bar 回放验证（回测接入由 backtest owning change 另行落地）。
- **增量 emit**：per `(definitionId, securityId, source, level, units)` 维护
  `lastEmittedUnitIndex` 游标，只 emit 新确认点；结构演化导致的点消失/重现不重报。
  冷却窗口/信号分级/投递抑制 = 未来"计算引擎"，不在本 change。
- **管理面**：`CreateStrategyDefinitionDto` 加 `kind`，按 kind 校验 rule（chan_bsp 校验
  units/points/direction 合法 + periods 单值且 ∈ {1,5,15,30,60}）。
- **检测器输出语义**：每个事件 = 一买/二买/三买/一卖/二卖/三卖 × 级别 × 标的，含确认
  时刻（units[unitIndex].endTime）、价格、相关中枢上下沿（通知内容用）。

## Capabilities

### New Capabilities

- `chan-bsp-realtime-evaluation`：chan_bsp 策略 kind 的配置 schema、`ChanBspDetector`
  求值契约（窗口 → 事件，无状态）、事件形态与增量 emit 语义。

### Modified Capabilities

- `realtime-strategy-evaluation`：实时评估器按策略 kind 分派求值，支持 chan_bsp
  结构信号源与 rule_dsl 算子规则并列。
- `strategy-definition-registry`：策略定义含 `kind`，按 kind 校验与编译。

## Impact

- **`mist`**：
  - `libs/shared-data`：`StrategyDefinition` 加 `kind` 列（enum + migration）、枚举导出。
  - `apps/signal`：新增 `realtime/chan/`（detector + 游标）；`signal-registry.service.ts`
    编译分派；`signal-registry.types.ts` plan union；`signal-app.module.ts` 装配。
  - `libs/signal`：`realtime-strategy-evaluation.service.ts` 分派；
    `RealtimeStrategyExecutionPlan` union。
  - `apps/mist`：`CreateStrategyDefinitionDto` 加 kind、按 kind 的 rule 校验。
  - `libs/chancore`：**零改动**（冻结基线；区间套为后续 API 演进方向）。
  - `libs/indicators`：**零改动**（力度计算现成）。
- **数据库**：1 个 forward-only migration（`strategy_definitions.kind`）。
- **部署**：signal app 新增 workspace 依赖（chancore/indicators 已在 monorepo 打包，
  `build:docker` app 列表不变）；无新 service、无 Compose 变化。
- **验证**：detector 单测（复用 chancore characterization fixture 的 K 序列）+ registry/
  evaluation 分派单测 + 管理面校验单测；基线全量跑；实盘 shadow 先行校准
  （触发频率/结构演化推翻率），`REALTIME_PRODUCTIZATION_MODE` 三态不变。
- **后续依赖**：区间套（ChanCore 参数化）、"计算引擎"（投递决策）、回测复用 detector
  （backtest owning change）、日线档实时（不在本 change）。
- **前置依赖**：`add-dynamic-series-imputation`（OHLCVA 统一补齐，独立 change 先做完）——
  detector 消费其补齐视图。
