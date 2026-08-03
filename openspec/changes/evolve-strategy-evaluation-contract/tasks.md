# 执行任务

本文件只统计尚需执行的代码、数据审计、测试和发布门禁。已由项目负责人确认的 field、operator、
lookback、quantity projection、contextSnapshot、schema 目标和 creation-only 决策，以本 change 的
`design.md` 与 delta specs 为准，不再用已勾选任务重复计数。

## 1. 前置与生产审计

- [ ] 1.1 确认 `complete-current-day-realtime-candles` 的共享 `Decimal8` 和
  `extract-market-analysis-kernels` 已通过验收。
- [ ] 1.2 记录 strategy entities、migrations、stable specs、API/FE consumers、legacy manual scan、
  signal-level backtest 和 portfolio worktree 的当前边界。
- [ ] 1.3 只读审计真实 `schema_migrations`、column/index/constraint inventory，以及 strategy
  definitions/versions/signals/AlertEvents/backtest runs/results 存量。
- [ ] 1.4 发现任意存量、候选 migration 编号冲突或 source quantity profile 未证明时，停止 schema 或
  quantity-rule 实施并重新评审。

## 2. 公共 Domain Contract

- [ ] 2.1 实现 runtime-neutral canonical `StrategyBar`、`StrategyMarketDataPort`、replay/realtime
  criteria/result types 和 import-boundary tests；不得导入 TypeORM、Redis、HTTP/RPC、Nest adapter 或
  `apps/*` 源码。
- [ ] 2.2 实现共享 field catalog、exact node-shape validator、depth/condition limits、
  `calculationBarCount` 和 compiled `requiredBarCount`。
- [ ] 2.3 复用共享 `Decimal8` 实现 decimal create normalization、stored canonical validation、非负
  quantity 约束和 exact comparison；删除策略侧 number coercion 与重复 decimal parser。
- [ ] 2.4 实现两阶段 `unavailable | evaluated(matched)` pure evaluator、current/prior crossover 和
  bounded immutable context builder。
- [ ] 2.5 实现共享 `QuantityForwardFillProjector` 与 contextSnapshot serializer，覆盖同日
  forward-fill、日切、current/previous evidence、short-circuit 稳定性和 unavailable 不持久化。
- [ ] 2.6 接入已验收 Indicator kernels，并用共同 fixtures 固定 KDJ 13/14、MACD 130/131、普通比较和
  crossover 的 Backtest/realtime parity；V1 不开放 `chan.*`。

## 3. Registry、Schema 与 API

- [ ] 3.1 根据真实生产 preflight 提交最终 forward-only migration 编号、DDL、pre/postflight、readback
  和 repair-forward，未经确认不得修改 entity 或数据库。
- [ ] 3.2 同步 ORM metadata、raw SQL、schema audit 和 named-constraint tests；不得增加旧 rule rewrite、
  nullable/default 兼容或 Signal composite unique。
- [ ] 3.3 更新 strategy create/load/enable/realtime-registration 与 signal-level backtest，使其共用
  validator/compiler/evaluator/context serializer。
- [ ] 3.4 实现 creation-only 后端契约：POST 原子创建 definition/version 1，删除 PATCH controller、
  `UpdateStrategyDefinitionDto`、service update、注册和 tests，并证明旧 route/OpenAPI 不再存在。
- [ ] 3.5 在独立 `mist-fe` 交付中删除 update consumer，增加必填 signal kind 并保持 decimal string；
  后端与前端作为匹配版本发布。

## 4. 验证与交付

- [ ] 4.1 运行 backend/frontend 完整基线、隔离真实 MySQL migration/contract tests、strict OpenSpec 和
  `git diff --check`。
- [ ] 4.2 检索 `lookbackBars`、paired-rule、numeric decimal compatibility、raw bigint serialization、
  legacy PATCH/manual-scan coupling、重复 bar/port/decimal 实现和未批准字段。
- [ ] 4.3 记录自动化、环境阻塞、source quantity HIL 和 protected-table digest；未完成真实数据库与
  profile 证据前不得允许 runtime changes 依赖本 change。
- [ ] 4.4 经项目负责人审核 schema/API/parity evidence 后归档。
