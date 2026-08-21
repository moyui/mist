# 执行任务

本文件只统计产品代码、数据库、测试、部署和环境证据。配置 schema、检测器契约、求值分派、
增量语义以本 change 的 `design.md` 与 delta specs 为准，不再用已勾选任务表示开发进度。

## 1. 前置与基线

- [x] 1.0 **依赖确认**：`add-dynamic-series-imputation` 完成并归档后，以其补齐视图
  （OHLC effective + 量价 effective + `backfilled` resolution）为 detector 的
  `toChanKSeries` 输入语义；未完成前按现有 `ProjectedStrategyBar` 形态实现。
- [x] 1.1 记录 `mist`、`mist-deploy` 的 branch、HEAD、dirty/worktree 和 active changes 基线；
  确认 `add-chan-buy-sell-point` 已归档、`libs/chancore` 的 `detectBuySellPoints`/力度
  contracts 在 master。
- [x] 1.2 运行现有 mist 仓基线（lint/typecheck/test:ci/coverage + `openspec validate --changes`），
  区分自动化通过与环境阻塞。
- [x] 1.3 只读验证 MySQL `k` 表 5/15/30/60 历史覆盖度：日内级数据极度稀疏（各 level 仅 1 标的、个位数行数），日线 4375 行/8 标的。实时链路走 Redis candle 不写 `k` 表，shadow 首选级别应基于 Redis 实时 candle 覆盖度而非 `k` 表历史。

## 2. 实体、枚举与 migration

- [x] 2.1 新建 `libs/shared-data/src/enums/strategy-kind.enum.ts`（`StrategyKind { RULE_DSL,
  CHAN_BSP }`）并导出；`StrategyDefinition` 加 `kind` 列（default `rule_dsl`）。
- [x] 2.2 新增 forward-only migration（020）：`strategy_definitions.kind`
  ENUM NOT NULL DEFAULT 'rule_dsl'；生产 MySQL 已执行，存量 3 行均为 `rule_dsl`。

## 3. ChanBspDetector（apps/signal）

- [x] 3.1 新建 `apps/signal/src/realtime/chan/`：`chan-bsp.types.ts`（`ChanBspPlan`、
  `ChanBspEvent`）、`chan-bsp.k-mapper.ts`（StrategyBar → ChanK）、`chan-bsp.pipeline.ts`
  （8 步串联 + 力度）、`chan-bsp.detector.ts`（`evaluate(window, plan) → ChanBspEvent[]`
  无状态纯函数 + points/direction 过滤）、`chan-bsp.episode.ts`（增量游标）。
- [x] 3.2 `chan-bsp.detector.spec.ts` + `chan-bsp.pipeline.spec.ts`：复用 chancore
  characterization fixture 的 K 序列断言点类型/价格/时间；空窗口/结构不足返回 []；
  points/direction 过滤正确。
- [x] 3.3 `chan-bsp.episode.spec.ts`：新点 emit、重现不报、同段多类型独立 emit、
  交易日切换重置。
- [x] 3.4 力度对齐：MACD begIndex 与窗口对齐、`computeUnitDirectionalAreas`/
  `computeUnitLinePeaks` 的方向选择（up→max / down→min 取绝对值）单测覆盖。

## 4. 引擎分派（registry + evaluation）

- [x] 4.1 `signal-registry.types.ts`：`SignalRegistryDefinition.executionPlan` 变
  discriminated union；`RealtimeStrategyExecutionPlan` 同步 union（`libs/signal`）。
- [x] 4.2 `signal-registry.service.ts`：`compileRegistryDefinition` 按 `definition.kind`
  分派，新增 `compileChanBspConfig`（units/direction/points/periods 单值校验，非法抛
  `ChanBspConfigError`）；`executionPlansFor` 适配 union。
- [x] 4.3 `realtime-strategy-evaluation.service.ts`：`evaluate` 按 `plan.kind` 分派——
  `rule_dsl` 现有路径不动；`chan_bsp` → `ChanBspDetector.evaluate` + 游标增量 → 构造
  同构 `ShadowStrategyCandidate`（signalKind 由点类型推导：buy→entry / sell→exit，
  contextSnapshot 含 chanBsp 事件字段）。
- [x] 4.4 `signal-app.module.ts` 装配 detector/episode；`signal-registry.service.spec.ts` 与
  `realtime-strategy-evaluation.service.spec.ts` 增补分派与 candidate 形态单测。

## 5. 管理面（apps/mist）

- [x] 5.1 `CreateStrategyDefinitionDto` 加 `kind`（默认 `rule_dsl` 兼容现有调用）。
- [x] 5.2 `strategy-definition.service` 按 kind 校验 rule：`validateChanBspConfig`
  （units/direction/points 合法性、periods 单值 ∈ {1,5,15,30,60}），失败走现有
  `VALIDATION_ERROR` envelope。
- [x] 5.3 DTO/校验单测：kind 缺省兼容、chan_bsp 非法配置拒绝、多 period 拒绝、
  日线档拒绝。

## 6. 可观测性

- [x] 6.1 info 生命周期日志：chan_bsp plan 编译成功（`chan_bsp_plan_compiled`，含
  definitionId/level/units）——signal-registry safeCompile 实现。
- [x] 6.2 warn 判断点日志：`chan_bsp_config_invalid`（reason code 有界枚举）；窗口不足/
  结构不足为常态空结果**不日志**（与 DSL 不匹配一致，避免刷屏），经 diagnostics 暴露。
- [x] 6.3 **进 OO 验证**：经 OTel pino 管线验证 `POST /api/default/_search?type=logs` 可检索
  `chan_bsp plan compiled` 日志（service_name=signal, body="chan_bsp plan compiled", severity=info）。
  OO 字段为 body/service_name/severity（非 msg/level/context）。

## 7. 验证与收尾

- [x] 7.1 完整基线：mist lint/typecheck/test:ci（`--forceExit`）/coverage、
  `openspec validate --changes`、`git diff --check`。
- [ ] 7.2 shadow 实盘验证（先行）：建 1-2 个 chan_bsp 策略定义（30m/duan 为 shadow 首选
  级别），`REALTIME_PRODUCTIZATION_MODE=shadow` 观察触发频率/事件形态/结构演化推翻率，
  记录 evidence；不达标则暂停 on 模式决策。——**环境阻塞**：需 TDX 终端运行 + 交易时段
  才能产生 sealed candle → 评估。当前 TDX 终端未运行，部署代码已就绪（signal 容器
  `1d448ac6`、策略 id=5 enabled、shadow 模式），待终端上线后观察。
- [ ] 7.3 与项目负责人确认 shadow 数据后，决策是否切 on；本 change 不引入新部署拓扑。
