# 执行任务

本文件只统计产品代码、数据库、测试、部署和环境证据。回测分派语义、回放契约与信号
形态以本 change 的 `design.md` 与 delta specs 为准。

## 1. 前置与基线

- [x] 1.1 记录 `mist` 的 branch、HEAD、dirty/worktree 基线；确认
  `add-chan-bsp-realtime-evaluation`（detector/episode/config 在 `libs/signal`，
  merge 46fe0d73）、`add-dynamic-series-imputation`（回测两段式，已归档）、
  `extract-backtest-runtime`（engine 在 master）均已就位；确认 `strategy_definitions.kind`
  migration 020 已执行；`backtest_runs` 当前无 kind 列，run 创建服务在
  `apps/mist`（`backtest-run-command.service.ts`，本 change 补 021 + 快照写点）。
  基线记录：master `f22c2c30`（本 change 全量落地 commit），worktree
  `.worktrees/chan-bsp-backtest`（分支 feat/chan-bsp-backtest）开发后已合并。
- [x] 1.2 运行现有基线（lint/typecheck/test:ci + `openspec validate --changes`），
  区分自动化通过与环境阻塞。全绿：typecheck ✓、lint:check ✓、全量 test:ci
  186 suites / 1555 tests ✓、`openspec validate --all --strict` 94 项 ✓、
  ci:contracts ✓（monitoring 不在本地跳过）、git diff --check ✓。
- [x] 1.3 **imputer 矫正层修正（前置，全局，用户拍板 2026-08-21）**：
  `strategy-series-imputer.ts` 的 `isQuantityAnchor` 排除合法 `"0"`
  （0/null 同为异常非锚点，统一走补齐：backfilled → forwardFilled → unavailable），
  `isOhlcAnchor` 四值任一为 0 → 整根 bar 无效（非锚点）；更新头注释契约文本；
  补 `strategy-series-imputer.spec.ts` 用例（量价"0"不再 observed、OHLC 含 0
  整根补齐、全 0 窗口 unavailable）；共享窗口/DSL 求值回归确认 resolution 枚举
  与补齐规则不变（仅锚点判定收紧，语义=矫正层宁缺毋假）。
  ——commit `fa523648`；imputer/imputer.spec 9 新用例 + 共享窗口/DSL 回归 59/59。

## 2. 实体与 migration

- [x] 2.1 `backtest_runs.kind`：`libs/shared-data` 的 `BacktestRun` 实体加 `kind` 列
  （enum `StrategyKind`，default `rule_dsl`）+ forward-only migration 021
  （`ENUM('rule_dsl','chan_bsp') NOT NULL DEFAULT 'rule_dsl'`），生产 MySQL 执行 + readback；
  存量 run 全部 rule_dsl 天然安全。
  ——commit `f243bfd2`（实体 + `deploy/database/migrations/021_backtest_runs_kind.sql`）；
  本地隔离 mysql:8.4 readback 见 5.3；**生产 MySQL 执行待部署窗口**（forward-only
  加列，default rule_dsl，无回滚风险）。
- [x] 2.2 create run 服务（apps/mist `backtest-run-command.service.ts`）：
  **新增 `StrategyDefinition` repository 加载**（经 `version.strategyDefinitionId`，
  拿 `kind` + `periods`），按 `definition.kind` 分派编译——`rule_dsl` 现有
  `planService.compileStoredVersion` 不动；`chan_bsp` → `compileChanBspConfigSafe`
  （本地封装现成，捕获 `ChanBspConfigError` → `BadRequestException`）。
  ——commit `072b085e`。
- [x] 2.3 create 侧门禁与校验（同服务）：
  quantity 门禁按 kind 短路（仅 `rule_dsl` plan 检查 `fields`，chan_bsp 跳过）；
  `definition.kind === 'chan_bsp'` 且 `dto.period ∉ {1,5,15,30,60}` → HTTP 400，
  错误码 `CHAN_BSP_PERIOD_UNSUPPORTED`（chan_bsp 域风格，同
  `CHAN_BSP_CONFIG_INVALID` 族），且 **run 不落库**（早失败，创建即知错）。
  ——commit `072b085e`（L125 code 实证）。
- [x] 2.4 create 侧 `run.kind` 快照：`runRepository.create({..., kind: definition.kind})`
  （rule_dsl 缺省兼容）；definition 不存在/kind 非法 → 现有 NotFound/错误路径。
  ——commit `072b085e`。

## 3. 回测编译分派（apps/backtest）

- [x] 3.1 `backtest-run.executor.ts`：**新增 `StrategyDefinition` repository 注入**，
  `replay` 内按 `run.kind` 分派编译——`rule_dsl` 现有 `compileStoredStrategyRule`
  不动；`chan_bsp` → `compileChanBspConfig(version.rule, definition.periods)`
  （`@app/signal` 共享；definition 按 `run.strategyDefinitionId` 加载）；
  编译失败 `ChanBspConfigError` → 现有 `BACKTEST_EXECUTION_FAILED` 路径。
  ——commit `aff953ed`。
- [x] 3.2 quantity 门禁按 kind 短路（执行侧）：仅 `rule_dsl` plan 检查
  `fields` 含 `k.volume/k.amount`；chan_bsp 天然跳过（不降级 DSL 门禁；
  create 侧已同款短路，见 2.3）。——commit `aff953ed`（spec 5.1 门禁跳过用例锁定）。
- [x] 3.3 period 校验（**执行侧防御兜底**）：`run.kind === 'chan_bsp'` 且
  `run.period ∉ {1,5,15,30,60}` → `BacktestRunFailure` 新枚举值
  `BACKTEST_CHAN_BSP_PERIOD_UNSUPPORTED` fail fast（run 置 failed +
  error_message）——覆盖老 run（migration 021 前）、绕过 create 的穷路径；
  create 侧已早失败（见 2.3）。——commit `aff953ed`（错误码 L15 实证 + spec fail-fast 用例）。
- [x] 3.4 后续方法签名适配 union plan（`rule_dsl | chan_bsp`）：
  `replayStartFor`、`hasBars`、窗口 trim 阈值（`plan.requiredBarCount` 两 kind 都有）、
  `rule_snapshot` 写入（chan_bsp 用 `executionPlan.ruleSnapshot`）。
  ——commit `aff953ed`（`ReplayPlan` union、`plan.plan.requiredBarCount`、replayStartFor 按 kind 分支）。

## 4. 回测求值分派 + 回放（apps/backtest）

- [x] 4.1 `replaySecurity` 逐 bar 循环按 plan kind 分派：`rule_dsl` 现有
  `evaluateStrategyPlan(imputer.read(), plan)` 不动；`chan_bsp` →
  `ChanBspDetector.evaluate(imputer.read(), plan)` + per-(securityId)
  `ChanBspEpisodeCursor`（identity 复用 `chanBspIdentityKey`：definitionId/
  securityId/source/level/units）→ fresh 事件 → 构造 `BacktestSignalResult`
  （context_snapshot 含 chanBsp 字段组：type/units/level/zhongshuIndex/zg/zd，
  与实时 candidate 同构）。
  **矫正层输入契约（第一原则）**：detector 输入必须是 `imputer.read()` 的
  `ProjectedStrategyBar[]` 矫正视图（OHLC/量价补齐 + 0 异常化 + resolution），
  **禁止原始历史 bar 直通**——与实时窗口视图同一 `StrategySeriesImputer`
  语义；无 look-ahead：初始段双向补齐（锚点全部早于评估起点）、逐根 append
  仅前向且不因未来锚点改写（单测锁住）。——commit `aff953ed`；spec 断言
  detector 收到 ProjectedStrategyBar 视图（stub 用例 5.1）。
- [x] 4.2 **完整信号流（无预热，与实时一致）**：不预热——第一根 ≥ startDate
  的 bar 评估时，窗口内（含 hydrate 段）全部已确认点作为首批事件输出，各自
  保留真实确认时刻（可 < startDate）；advance 记账只防重复（unitIndex 单调），
  startDate 前已确认点不得静默吞掉（回测暴露完整信号流，含提前/错误信号）。
  ——commit `aff953ed`；spec 两页 stub 用例锁定"每点恰一次 + signalTime 真实"。
- [x] 4.3 统计/持久化复用：同数组 `results` 批量 insert（flushResults）、
  `signalCount`（触发次数：每次评估 ≥1 匹配计 1）、`matchedSecurityCount`
  （per security 去重 Set）——chan_bsp 多点同评估 = 多行计 1 次触发，统计如实
  反映（signalCount 含 startDate 前补报触发，与实时激活补报一致）。
  ——commit `aff953ed` + `f22c2c30`（触发语义与 spec 同步）。
- [x] 4.4 **共享 snapshot 函数（libs/signal，两侧共用）**：新建
  `libs/signal/src/runtime/chan-bsp/chan-bsp.snapshot.serializer.ts`——
  `serializeChanBspContextSnapshot(event, level)` 返回
  `{ chanBsp: { type, units, level, zhongshuIndex, zg, zd } }`（形状与实时
  candidate 一致）；**实时侧 `evaluateChanBsp` 的 contextSnapshot 内联构造收敛
  到该函数**；回测 result 构造同样调用；单测（形状断言 + 与实时 candidate 同构）。
  ——commit `681855e6`（serializer + 实时收敛 + index 导出 + 同构断言 spec）。

## 5. 单测

- [x] 5.1 `backtest-run.executor.spec.ts` 增补：
  已知 K 序列回放出一买/二买/三买/一卖/二卖/三卖点（chancore characterization
  fixture 派生序列，与实时 detector spec 同源）；完整信号流（startDate 前已确认
  点出现在结果中且 signal_time 为真实确认时刻、startDate 后新点正常输出、防重复
  记账幂等键无冲突、被推翻点已落库不删）；同 bar 多点多行 + matchedSecurityCount
  去重；quantity 门禁对 chan_bsp 跳过；period ∉ {1,5,15,30,60} 双级拒绝；
  chan_bsp 编译失败防御路径。
  ——commit `aff953ed`；4 用例（完整信号流 stub 两页防重复 / 0-null 量价门禁跳过 /
  真实 detector 空结果诚实 / period fail fast）+ DSL 回归全绿（11/11）。
  （注：真实 detector 45 根日线不足段级结构 → 空结果诚实，已按 design D8 语义
  覆盖；detector 出点行为由 chan-bsp.detector.spec 与 chancore 单测覆盖。）
- [x] 5.2 create 侧单测（apps/mist `backtest-run-command.service.spec.ts` 增补）：
  chan_bsp 版本创建 run 成功（分派编译 + `run.kind='chan_bsp'` 快照 + 门禁跳过）；
  DSL 版本回归不动；chan_bsp + period ∉ {1,5,15,30,60} → HTTP 400 `CHAN_BSP_PERIOD_UNSUPPORTED`
  且 **run 不落库**；
  definition 不存在 → 现有 NotFound 路径。
  ——commit `072b085e`；4 新用例 + DSL 回归（8/8）。
- [x] 5.3 migration 021 单测/readback（`database-schema-safety` 模式）。
  ——本地隔离 mysql:8.4（生产同版本，容器 `mist-mysql-readback` 已清理）：
  `tools/run-migrations.mjs` 全量应用 001-021（ledger 21 条，最后
  `021_backtest_runs_kind.sql`）→ `SHOW COLUMNS FROM backtest_runs LIKE 'kind'`
  = `enum('rule_dsl','chan_bsp') NOT NULL DEFAULT 'rule_dsl'` → 存量插入
  （不传 kind）backfill 为 `rule_dsl`（id=2 实证）→ 020/021 均为 additive
  加列、受保护表（含 backtest_signal_results 唯一键）未被触碰（migration
  仅 ALTER ADD COLUMN）→ 2026-08-22 完成。

## 6. 可观测性

- [x] 6.1 info 生命周期日志：`backtest chan_bsp plan compiled`（runId/
  definitionId/versionId/level/units）；完整信号流首批补报为正常行为不单独日志。
  ——commit `aff953ed`（executor L204 `backtest chan_bsp plan compiled runId=… level=… units=…`）。
- [x] 6.2 warn 判断点日志：period 非法拒绝（reason code 有界枚举）；结构不足为常态
  空结果**不日志**（与实时 DSL 不匹配一致，避免刷屏）。
  ——commit `aff953ed`：period 拒绝走 `BacktestRunFailure` failAndCleanup 错误路径
  （error 日志带 reason code）；结构不足空结果不记日志（spec 4.2 用例证实）。

## 7. 验证与收尾

- [x] 7.1 完整基线：lint/typecheck/test:ci（`--forceExit`）/ci:contracts/
  `openspec validate --all --strict`/`git diff --check`。
  ——全部通过：typecheck ✓、lint:check ✓、全量 test:ci 186 suites/1555 tests ✓、
  ci:contracts ✓（monitoring 不在本地跳过）、`openspec validate --all --strict`
  94 项 ✓、git diff --check ✓。
- [x] 7.2 提交并推送；与项目负责人确认后评估归档条件——归档前置：
  `extract-backtest-runtime` 5.6 cutover 部署验收完成 + `add-chan-bsp-realtime-evaluation`
  shadow 实盘观察结论可供对照（两者均为环境/部署项，不阻塞本 change 编码与单测）。
  ——已提交推送（master `f22c2c30`，8 commit：fa523648/f243bfd2/681855e6/072b085e/
  aff953ed/81276090/f22c2c30 + spec c0ed5f24）；归档前置 = extract 5.6 cutover +
  父 change shadow（环境项）。