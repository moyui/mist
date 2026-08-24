# Proposal — add-chan-bsp-backtest-evaluation

## 从属关系

本 change 是 `add-chan-bsp-realtime-evaluation`（缠论买卖点实时求值，已合入 master，
merge 46fe0d73）的**逻辑下属 change**：共享同一 capability 家族（chan_bsp 配置
schema / `ChanBspDetector` / 事件语义）、追随父 change 的归档节奏（父 change 的
7.2/7.3 实盘 shadow 与回测验收一起评估归档）。当前 openspec CLI 版本不支持物理
嵌套 change（`openspec new change a/b` 被拒、手工嵌套目录不参与 validate），故以
平级 change + 本从属声明表达，父 change 归档时关联处理。

## Why

回测引擎（`apps/backtest`，extract-backtest-runtime 拆出）只支持 `rule_dsl` 求值：
`backtest-run.executor.ts` 对版本 rule 一律 `compileStoredStrategyRule` + `evaluateStrategyPlan`，
**缠论买卖点（chan_bsp）策略完全无法回测**——引擎对 chan_bsp 版本零引用、零分派。

`add-chan-bsp-realtime-evaluation`（已合入 master，`merge 46fe0d73`）明确承诺：
**"回测接入由 backtest owning change 另行落地"**，且 detector 按无状态纯函数设计
（窗口 → 全量已确认点事件）正是为离线逐 bar 回放预留的。但 `extract-backtest-runtime`
的任务清单与 spec delta 中**从来没有这一条**——该承诺是无主承诺，目前悬空。

同时基础设施已全部就位：`ChanBspDetector`/`ChanBspEpisodeCursor`/`compileChanBspConfig`
均在共享库 `libs/signal`（回测可直接 `@app/signal` 复用）；`dynamic-series-imputation`
已为回测提供两段式 hydrate（初始段双向补齐 + 逐根 append）；`BacktestSignalResult`
的 `context_snapshot` JSON 列可承载缠论事件字段。缺的只是**引擎侧的分派与回放语义**。

## What Changes

- **回测编译分派**：回测**创建与执行两级**都按 kind 分派编译——
  `rule_dsl` 走现有 `compileStoredStrategyRule`（不动）；`chan_bsp` 走共享
  `compileChanBspConfig(version.rule, definition.periods)`（`libs/signal`，实时
  registry 同款，零重复实现）→ `ChanBspPlan`。创建侧（apps/mist
  `backtest-run-command.service.ts`）现对任意版本一律 DSL 编译，chan_bsp 配置
  会被当 DSL 规则——不修则 chan_bsp 回测 run 连创建都失败。
- **回测求值分派**：`replaySecurity` 按 plan kind 分派——`rule_dsl` 走现有
  `evaluateStrategyPlan`（不动）；`chan_bsp` 走 `ChanBspDetector.evaluate(imputer.read(),
  plan)` + per-security `ChanBspEpisodeCursor` 增量 emit → 同构
  `BacktestSignalResult`（`context_snapshot` 含 chanBsp 事件字段组：
  type/units/level/zhongshuIndex/zg/zd），`signalCount`/`matchedSecurityCount`/
  `onSignal` 统计机制全复用。
- **完整信号流（无预热，与实时一致）**：`ChanBspEpisodeCursor` 初始 -1、实时侧
  无预热（激活即补报窗口内全部已确认点）；回测同款——第一根 ≥ startDate 的 bar
  评估时 emit 窗口内（含 hydrate 段）全部已确认点，各自保留真实确认时刻
  （可 < startDate）；advance 记账只防重复（unitIndex 单调）不防提前；已 emit 的
  点落库后即使被结构演化推翻也不删——回测暴露完整信号流（含提前/错误信号）。
- **imputer 0 异常化（前置修正，全局）**：量价 `"0"` 与 `null` 同视为异常
  非锚点、OHLC 任一为 0 整根 bar 无效，统一走补齐（backfilled → forwardFilled →
  unavailable），宁缺毋假（矫正层定位，live spec 既定"suspended day with no bar
  MUST NOT create an evaluation anchor"）——两侧（实时窗口/回测两段式）同一
  imputer 自动生效。
- **quantity 门禁适配**：现有 `plan.fields` 量价检查只适用于 rule_dsl，且**创建与执行两级都存在**（create 编译后 + executor replay 编译后）；
  chan_bsp 不消费量价（OHLC + 力度），两级都按 kind 跳过该门禁，**不降级 DSL 现有门禁**。
- **管理面约束**：chan_bsp 回测的 run period 必须为单值 ∈ {1,5,15,30,60}
  （实时档约束同源）；非法 **创建时早失败**（HTTP 400 + `CHAN_BSP_PERIOD_UNSUPPORTED`，
  run 不落库）+ **执行前防御**（`BACKTEST_CHAN_BSP_PERIOD_UNSUPPORTED` 枚举值，
  run 置 failed，覆盖老 run/直连 RPC 等穷路径）。
- **kind 快照**（决策 D1）：`backtest_runs` 增加 `kind` 列（migration 021，
  forward-only，default `rule_dsl`），create run 时从 definition 快照写入——
  回测以 **run 快照 kind** 分派（run = 一次回测的执行快照，与 `period`/`source`/
  `target_universe` 同处一处；同一 definition 可多次回测，各自 run 快照独立）。
- **信号结果形态**：每事件一行（同 bar 多点 = 多行），`context_snapshot` 与实时
  candidate 同构；`BacktestRun` 仍是 period/source/definition/version 的唯一权威
  （`strategy-signal-backtesting` 现有 requirement 不变）。

## Capabilities

### New Capabilities

- `chan-bsp-backtest-evaluation`：回测引擎对 chan_bsp 版本的编译/求值分派契约、
  回放语义（完整信号流、增量记账、矫正层输入契约）与信号结果形态（共享
  serializer 构造）。

### Modified Capabilities

- `strategy-signal-backtesting`：回测按版本 kind 分派求值——"same rule evaluator
  semantics as live scans" 扩展为覆盖 chan_bsp 结构信号。
- 注：period 合法域约束（{1,5,15,30,60} 单值 + fail-fast 错误码）写入新 capability
  `chan-bsp-backtest-evaluation`，不修改 `backtest-runtime`（该 capability 的 delta
  归 `extract-backtest-runtime` owning change，live spec 尚未合入，本 change 不触碰）。

## Impact

- **`mist`**：
  - `apps/mist/src/strategy/services/backtest-run-command.service.ts`：create run
    按 `definition.kind` 分派编译（chan_bsp → `compileChanBspConfigSafe` 本地封装
    现成）+ quantity 门禁按 kind 跳过 + period 早失败校验 + `run.kind` 快照写入
    （新增 `StrategyDefinition` repository 加载，经 `version.strategyDefinitionId`）；
  - `apps/backtest/src/backtest-run.executor.ts`：编译/求值分派（新增
    `StrategyDefinition` repository 注入，拿 `definition.periods`）+ 完整信号流
    求值 + 门禁适配 + period 防御校验；
  - `apps/backtest/src/backtest-run.executor.spec.ts`：chan_bsp 回放单测；
  - `libs/shared-data`：`BacktestRun.kind` 列（migration 021）+ 枚举导出；
  - `libs/signal`：**新增** `chan-bsp.snapshot.serializer.ts`
    （`serializeChanBspContextSnapshot`，实时/回测共用，实时侧内联构造收敛）；
    detector/config/episode 其余零改动；
  - `libs/strategy`：`strategy-series-imputer.ts` **0 异常化修正**（`isQuantityAnchor`
    排除 `"0"`、`isOhlcAnchor` 含 0 无效）+ 头注释 + 单测（tasks 1.3 前置，全局生效）；
  - `libs/chancore`：**零改动**（冻结基线）。
- **数据库**：1 个 forward-only migration（021：`backtest_runs.kind`，
  ENUM default `rule_dsl`——存量 run 全部 rule_dsl 天然安全）。
- **部署**：无新 service、无 Compose 变化；Docker build app 列表不变。
- **验证**：executor 分派单测（DSL 回归 + chan_bsp 回放：已知 K 序列买卖点、
  完整信号流（含 startDate 前补报）、防重复记账、同 bar 多点、matchedSecurityCount
  去重、quantity 门禁跳过）+ create 侧单测（分派/快照/period 400）+ imputer
  0 异常化单测 + 全量基线。
- **后续依赖**：`add-chan-bsp-realtime-evaluation` shadow 实盘校准（7.2/7.3 未完成
  ——本 change 不依赖其实盘结果，但回测与实时共享 detector 语义，shadow 观察结论
  会反向校验本 change 的 fixture 选择）；`extract-backtest-runtime` 5.6 cutover
  部署验收——**本 change 的部署验收在其之后**（编码可并行）。
- **不做**：区间套/多级别递归（语义未定）、回测信号治理（冷却/分级/投递抑制，属
  未来"计算引擎"）、portfolio 模拟（`strategy-signal-backtesting` 明确排除）。