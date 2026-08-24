# Design — add-chan-bsp-backtest-evaluation

## 1. 现状与影响链（producer → wire → decoder → state → consumer）

```
strategy_definitions(kind=chan_bsp, rule=chan_bsp config, periods 单值)
  → strategy_versions(rule 快照)
  → create run（apps/mist backtest-run-command.service）← 本 change（D1/D3/D6）：
      按 definition.kind 分派编译 + 门禁按 kind 跳过 + period 早失败 + run.kind 快照
  → executor.replaySecurity（apps/backtest，按 run.kind 分派）
      ① 编译分派                          ← 本 change：+definition 加载拿 periods（D2）
      ② quantity 门禁（plan.fields）        ← 本 change：chan_bsp 跳过（D3）
      ③ hydrate 初始段（imputer 两段式，已落地）
      ④ 逐根 append + 按 kind 分派求值     ← 本 change：chan_bsp → detector + 游标（D4）
      ⑤ BacktestSignalResult 入库          ← 本 change：chan_bsp 事件 context 同构（D5）
  → signalCount/matchedSecurityCount 统计（复用）
```

## 2. 关键决策

### D1. kind 快照：`backtest_runs.kind` 列（migration 021）

- **方案 A（选定）**：migration 021 给 `backtest_runs` 加
  `kind ENUM('rule_dsl','chan_bsp') NOT NULL DEFAULT 'rule_dsl'`；create run 时从
  `definition.kind` 快照写入。回测以 **run** kind 分派。
- 理由：`BacktestRun` 本身就是**一次回测的执行快照**——`period`/`source`/
  `target_universe`/`startDate`/`endDate` 全在 run 上，同一 definition 可多次回测
  （不同时间窗/标的/数据源），每次 run 独立快照。kind（解释器选择）与
  `period`/`source` 同属执行语义，放 run 与现有模型一致：
  - 改动面最小：create run 服务一处写点，不扩大策略域表面
    （`strategy_versions` 不动，实时 registry 读取路径不受影响）；
  - 存量安全：migration 021 default `rule_dsl`，存量 run 全部天然正确；
  - 权威自洽：run 提交时快照 definition.kind（kind 创建后不可变，DTO 已核实），
    run 生命周期内恒定，回放期无需 join 任何表。
- 方案 B（否决）：`strategy_versions.kind` 版本快照。否决理由：kind 是**执行语义**
  而非策略 rule 语义（rule 本身仍是 JSON，解释器选择属于消费端；`signalKind` 在
  版本上是因为它参与 rule 求值语义，kind 不参与 rule 求值只选择解释器）；
  版本表是策略域共享表面，加列影响所有版本写路径，收益低于 A 且无额外安全。
- 说明：`compileChanBspConfig` 仍以 `definition.periods` 为入参（与实时 registry
  编译期一致——periods 是定义级参数，D6 的 run.period ∈ {1,5,15,30,60} 校验
  保证回放级别合法，不依赖 definition.periods 参与合法性判断）。
- **加载路径**：create 服务（apps/mist）经 `version.strategyDefinitionId` 加载
  definition（拿 kind 快照 + periods 编译）；executor（apps/backtest）**新增注入
  `StrategyDefinition` repository**（当前只注入了 run/result/version/security 四个），
  按 `run.strategyDefinitionId` 加载 definition 拿 periods。两侧加载都是只读，
  不改变 definition 任何字段。

### D2. 编译分派（executor.replay L142 区域）

```ts
const plan: RealtimeStrategyExecutionPlan['plan'] =
  run.kind === 'chan_bsp'
    ? compileChanBspConfig(version.rule, definition.periods)
    : compileStoredStrategyRule(version.rule, version.signalKind as 'entry'|'exit');
```
- `compileChanBspConfig` 现成共享（`libs/signal`，registry L311 同款）；
- 编译失败（非法 config，理论不可达——管理面已校验）→ `ChanBspConfigError` →
  `BACKTEST_EXECUTION_FAILED`（现有错误路径）。
- 后续方法签名改为接收 union plan（`rule_dsl | chan_bsp`），
  `BacktestSignalResult` 的 `rule_snapshot` 存 `executionPlan.ruleSnapshot`。

### D3. quantity 门禁适配（**两级**）

- 现状：`plan.fields.some(k.volume|k.amount)` → `BACKTEST_QUANTITY_PROFILE_UNAVAILABLE`，
  存在于**创建侧**（apps/mist `backtest-run-command.service.ts` L90-98，DSL 编译后）
  与**执行侧**（executor replay L143-152，DSL 编译后）各一处。
- **边界区分（为什么回测有门禁而实时没有）**：imputer 预热/窗口补齐两侧同一语义
  （`dynamic-series-imputation`），其定位是**矫正层**——为下一阶段（回测/实时求值）
  消除错误数据，宁缺毋假（live spec 既定：suspended day with no bar MUST NOT
  create an evaluation anchor）。三分数据状态：
  ① bar 缺失（停牌/无成交时段）——TDX 接口实证（000838 *ST发展 2026-08-03~08-07
  停牌）：**fillData=false/true 均无 bar**，序列天然缺失，imputer 不发明 bar
  （"nothing is invented"），窗口跳过，不产生假值；② 字段 null——imputer 双向补
  （真实锚点）；③ 字段 = 合法 decimal `"0"`——**0 异常化（本 change 前置修正，
  用户拍板）**：量价 0 与 null 同视为异常（非锚点），OHLC 任一为 0 则整根 bar
  无效（非锚点），统一走补齐方案——后向最近有效锚点 `backfilled` → 前向
  `forwardFilled` → 全无 `unavailable`（不虚构）。效果：QMT 占位 bar（OHLC=前收
  + V/A=0）量价被矫正为补值；脏数据全 0 bar 整根失效。**错误 bar 被消除而非传播**。
- quantity 门禁与 0 异常化**互补不互斥**：0 异常化消除"假 0 传播"（0 二义性），
  但补齐值（backfilled/forwardFilled）仍非真实观察值，且历史 K 尚存其他缺口
  （TDX 1m 几乎无 bar、QMT 日线缓存仅近 1 个月等）——profile 被 HIL 证明前，
  消费量价的 DSL 策略维持整次拒绝（证明制立场不变）；chan_bsp 不消费量价，
  矫正后的序列（压缩窗口 + 平价 bar）对结构识别诚实，跳过门禁成立。
- chan_bsp plan 无 `fields` 属性 → 两侧都改为按 kind 短路：
  `if (plan.kind === 'rule_dsl' && plan.plan.fields.some(...)) throw ...`。
- **chan_bsp 跳过合法性的语义论证**：chan_bsp 不消费量价（只吃 OHLC + 力度），
  且历史 OHLC 系统性缺失时 detector 因窗口不足返回**诚实空结果**（无信号），
  与 DSL 量价"恒 0 值产出假信号"性质不同——空结果诚实、假信号不诚实。
- create 侧注意：现有 `compileStoredVersion(version)` 对 chan_bsp 配置会在编译期
  就失败（chan_bsp 配置不是 DSL 树）——**分派必须先行**（chan_bsp → 
  `compileChanBspConfigSafe`，apps/mist 已有本地封装），门禁短路才有意义。
- **不**新增"chan_bsp 侵权量价"的校验——chan_bsp config 根本无量价字段（schema 限定
  units/points/direction），天然不消费。

### D4. 求值分派 + 回放语义（replaySecurity 逐 bar 循环）

**第一原则：chan_bsp 求值必须过矫正层**（与 rule_dsl 同一输入契约）：
- detector 的输入必须是矫正层输出——`StrategySeriesImputer` 的
  `ProjectedStrategyBar[]`（`imputer.read()`：OHLC 补齐 + 量价补齐 + 0 异常化 +
  resolution 标记），**禁止直接消费原始历史 bar**。矫正规则以 D3 与 tasks 1.3
  为准（锚点判定/双向补齐/不发明 bar），**与实时窗口视图同一语义**
  （"same rule evaluator semantics as live scans"——实时 detector 吃
  `SharedStrategyWindowStore.read()` 的矫正视图，回测 detector 吃
  `imputer.read()` 的矫正视图，两侧同一 `StrategySeriesImputer` 实现）。
- **矫正层生命周期（回测侧）**：executor 每 security 内联持有一个 imputer
  实例——`hydrate(初始段)` 双向补齐定死 + 逐根 `append` + `trim()` 滑窗。
  **无 look-ahead 视角模拟**：回测数据全在，但不做数据增量——append 的角色是
  "藏起未来"：评估任意 bar 时其 effective 值只依赖评估时刻已可见的数据，
  与实时自然流式得到的视图逐根相同；初始段（全部早于评估起点）可双向补齐，
  不构成 look-ahead。

- 按 plan kind 分派（求值，均在矫正视图上）：
  - `rule_dsl`：现有 `evaluateStrategyPlan(plan, imputer.read())` 不动；
  - `chan_bsp`：`chanBspDetector.evaluate(imputer.read(), chanBspPlan)` →
    `cursor.advance(identity, events)` 取 fresh → 每 fresh 事件构造
    `BacktestSignalResult`（结构同实时 `ShadowStrategyCandidate` 的 chan_bsp 分支）。
- **完整信号流（无预热，与实时一致）**：`ChanBspEpisodeCursor` 初始
  `lastEmittedUnitIndex = -1`，实时侧 `evaluateChanBsp` **无预热**——策略激活后
  第一次评估即 emit 窗口内全部已确认点（订阅补报语义）。回测同款：第一根
  ≥ startDate 的 bar 评估时，窗口内（含 hydrate 段）**全部已确认点**作为首批
  事件输出，各自保留真实确认时刻 `signal_time`（可 < startDate）。
  **回测的意义 = 暴露完整信号流（含提前/错误信号）**：提前确认的点（通常即
  "买早了"的错误信号）必须出现在结果中，不能静默吞掉；已 emit 的点落库后
  即使后续结构演化推翻（点从 detector 输出消失）也不删除——错误信号一览无余。
- **advance 记账（防重复，非防提前）**：`fresh = 窗口事件中 unitIndex > 上次已
  emit 最大索引者`——同窗口在后续 bar 评估时旧点不重复 emit（否则同一
  `signal_time` 重复行撞 `(run, security_code, signal_time)` 幂等键）。
- identity 构造复用实时侧 `chanBspIdentityKey`：`(definitionId, securityId,
  source, level, units)`；cursor 是 per-run 实例（进程内新建，天然隔离，无需
  清理路径；run 完成后随 executor 实例丢弃）。
- **flushResults 复用**：chan_bsp 结果与 DSL 结果同数组 `results`，同一批量 insert。

### D5. 信号结果形态与统计

- `BacktestSignalResult.context_snapshot`：
  `{ chanBsp: { type, units, level, zhongshuIndex, zg, zd } }`（与实时 candidate
  同构，字段语义见 `add-chan-bsp-realtime-evaluation` delta）。
- **共享 snapshot 函数（用户拍板，替代手工构造）**：新增
  `serializeChanBspContextSnapshot(event, level)`（`libs/signal/src/runtime/
  chan-bsp/`，与 `ChanBspConfigError` 同域；形状与
  `strategy-context-snapshot.serializer.ts` 同风格）——**实时 `evaluateChanBsp`
  与回测 result 构造两侧共用**，不再各自手工拼装（当前实时侧为内联
  `Object.freeze` 构造，本 change 顺手收敛到共享函数，两侧字段形状由单点保证）。
- 每事件一行：同 bar 确认一买+二买 = 2 行（各自 signal_time 为事件确认时刻）。
- `signalCount` = 信号**触发次数**（现有 `onSignal` 计数：每次评估产生 ≥1 匹配
  计 1 次——chan_bsp 同次评估多点计 1）；结果行数 ≥ 触发次数（每事件一行）；
  `matchedSecurityCount` = matchedCodes（per security 去重，现有 Set 逻辑不动）；
  **完整信号流下 signalCount 含 startDate 前补报的触发**（与实时"激活补报"一致，
  统计如实反映）。
- `BacktestRun` 保持 period/source/definition/version 唯一权威
  （`strategy-signal-backtesting` 现有 requirement；结果行不重复这些列）。

### D6. 管理面 period 约束（**双级校验**）与错误码

- **创建侧早失败**（主校验）：create run 服务按 kind 分派后，对 chan_bsp 版本校验
  `dto.period ∈ {1,5,15,30,60}`，非法 → HTTP 400，错误码 `CHAN_BSP_PERIOD_UNSUPPORTED`
  （chan_bsp 域风格，与 `CHAN_BSP_CONFIG_INVALID` 同族；可区分"配置错 vs 周期错"），
  **run 不落库**。理由：create 服务已加载 definition + 编译 plan，校验成本为零，
  创建即知错；
- **执行侧防御**（兜底）：executor replay 编译前对 `run.kind === 'chan_bsp'` 且
  `run.period ∉ {1,5,15,30,60}` → `BacktestRunFailure` 新枚举值
  `BACKTEST_CHAN_BSP_PERIOD_UNSUPPORTED`（遵循 `BACKTEST_*` UPPER_SNAKE 枚举规范，
  run 置 failed + error_message）——覆盖老 run（migration 021 default rule_dsl 前
  无该约束）、绕过 create 的穷路径（直连 RPC、重放等）。
- 不做：不改 create DTO 的 enum（`Period` 含 1440 等，DTO 层无法针对版本校验）；
  日线档（1440）不在合法域（实时档同源）。

### D7. 可观测性（沿用 backtest-otel-metrics 纪律）

- info 生命周期日志：chan_bsp run 编译成功（`backtest chan_bsp plan compiled`
  runId/definitionId/versionId/level/units）；完整信号流首批补报（含 startDate
  前点）属正常行为不单独日志（结果行可见）。
- warn 判断点日志：chan_bsp period 非法拒绝（reason code 有界枚举）、
  target_issue 复用现有；结构不足 = 常态空结果**不日志**（同实时侧纪律）。
- error：run failed 现有路径（补 reason 字段）；编译失败
  `ChanBspConfigError` → `BACKTEST_EXECUTION_FAILED`。
- 指标：**不新增**（回测指标面 10 gauges 已覆盖 run/command 统计，事件级
  计数由信号统计表达；metrics 初始基线不锁用途，遇盲区再迭代）。

### D8. 测试策略

- executor spec：DSL 回归（现有断言不动）+ 新增 chan_bsp 场景：
  1. 已知 K 序列回放出一买/二买/三买卖点（复用 chancore characterization fixture
     派生序列，与实时 detector spec 同源）；
  2. **完整信号流**：hydrate 段（startDate 前）已确认的点**出现在结果中**且
     signal_time 为其真实确认时刻（与实时"激活即补报"一致）；startDate 后新
     确认点正常输出；
  3. 同 bar 多点 = 多行结果，matchedSecurityCount 仍按 security 去重；
  4. **防重复记账**：同一确认点在后续 bar 评估中不重复 emit（幂等键无冲突）；
     被结构演化推翻的点已落库不删；
  5. quantity 门禁对 chan_bsp 跳过（含 volume 缺失的历史序列不抛）；
  6. period ∉ {1,5,15,30,60} → 双级拒绝（create 4xx + executor fail fast）；
  7. `chan_bsp` 版本编译失败路径（非法 config 理论不可达，防御断言）。
- create 侧 spec（apps/mist `backtest-run-command.service.spec.ts` 增补）：
  chan_bsp 版本创建 run 成功（分派编译 + `run.kind='chan_bsp'` 快照 + 门禁跳过）；
  DSL 版本回归不动；chan_bsp + period ∉ {1,5,15,30,60} → HTTP 4xx 且 **run 不落库**；
  definition 不存在 → 现有 NotFound 路径。
- migration 021 单测/readback：按 `database-schema-safety` 现有模式。
- 全量基线：test:ci（--forceExit）+ openspec validate --all --strict。

## 3. 前置与顺序

| 依赖 | 状态 | 说明 |
|---|---|---|
| `add-chan-bsp-realtime-evaluation`（父 change） | master（46fe0d73） | 本 change 的逻辑父：detector/config/episode 共享库现成；7.2/7.3 shadow 未完成不阻塞本 change 编码，父子一起评估归档节奏 |
| `add-dynamic-series-imputation` | master（5357dfba，已归档） | 回测两段式 hydrate 已落地 |
| `extract-backtest-runtime` | active（33/36） | 引擎已在 master；其 5.6 cutover 部署验收完成前，本 change 的实盘验证不启动 |

## 4. 错误码设计（本 change 新增）

- 创建侧：`CHAN_BSP_PERIOD_UNSUPPORTED`（HTTP 400，chan_bsp 域风格，
  同 `CHAN_BSP_CONFIG_INVALID` 族；run 不落库）；
- 执行侧：`BacktestRunFailure` 新枚举值
  `BACKTEST_CHAN_BSP_PERIOD_UNSUPPORTED`（遵循 `BACKTEST_*` UPPER_SNAKE 规范，
  run 置 failed + error_message）。

## 5. 不做（边界）

- 区间套/多级别递归（语义未定，ChanCore 冻结）；
- 回测信号治理（冷却/分级/投递抑制 = 未来"计算引擎"）；
- 日线档 chan_bsp 回测（level 仅 {1,5,15,30,60}，日线不在）；
- chan_bsp 专用 portfolio/收益模拟（`strategy-signal-backtesting` 排除）；
- mist-fe 变更（结果展示沿用现有 BacktestSignalResult 结构）。