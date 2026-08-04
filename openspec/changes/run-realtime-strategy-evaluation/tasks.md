# 执行任务

本文件只统计尚需执行的产品代码、测试、部署和 HIL。已确认的 context port、queue/handoff、period、
incomplete bar、episode、persistence、health、capacity 和 shutdown 语义，以本 change 的 `design.md`
与 delta specs 为准，不再用已勾选任务表示开发进度。

## 1. 前置与基线

- [x] 1.1 确认 `standardize-service-boundary-contracts` 与 `evolve-strategy-evaluation-contract` 的
  已交付契约，以及 `complete-current-day-realtime-candles` 的自动化、严格 contract、真实 snapshot
  fixture 离线回放和 shadow 基础，足以支撑本 change 的 `off|shadow` 开发；`extract-chan-core` 不属于
  Realtime Strategy 前置依赖。
  - [x] 1.1.1 验证 candle foundation 已实现 active-listener expected-bucket due：完全无 snapshot 的
    分钟也产生 discarded terminal watermark，Signal 不实现第二套 session/grace timer。
  - [x] 1.1.2 candle 真实交易时段 HIL 与本 change 6.4/6.5 的 timestamp、quantity、capacity、protected
    table 和负责人审核只作为切换 `on` 的硬门禁，不阻塞离线自动化、部署 `off` 或运行 `shadow`。
- [x] 1.2 记录 strategy schema/存量、market Redis、historical K、legacy manual scan、Compose、
  monitoring、protected-table 和受影响仓库 branch/HEAD/dirty/worktree 基线。
- [x] 1.3 建立 sealed/discarded finalization → handoff → context/period builder → analysis → evaluator → episode → transaction →
  monitoring/deploy 影响链并确认 current-day candle owner 的实际 hook。

## 2. Realtime Market Data Adapters

- [x] 2.1 只实现共享 `StrategyMarketDataPort` 的 MySQL/Redis/memory realtime adapters，不实现 replay
  method，不导入 Backtest application source。
- [x] 2.2 实现 source-exact historical/pre-anchor Redis seam、canonical mapping、timestamp/dedupe/conflict
  acceptance、共享 `KPriceProjector` 的 MySQL string/Redis number 投影和 hard-bound validation；
  MySQL/Redis 不跨源或同日重叠，不改变现有存储 shape 或复制消费者转换。
- [x] 2.3 实现按 listener/eligible-plan 分组的 shared ring window、group-max hydration、hot append、
  consumer removal 和 trading-day rollover cleanup。
- [x] 2.4 实现 quantity plan 的当日 pre-anchor projector seed、current finalization exactly-once 和
  unavailable semantics；不得读 current/future K、补 gap 或把合法缺失升级成系统错误。
- [x] 2.5 用 tests 证明 cold start/lookback expansion 只做一次 bounded hydration，正常 trigger 不逐
  策略重查完整历史，同 identity duplicate no-op、conflicting content fail closed。

## 3. Trigger 与 Handoff

- [x] 3.1 增加并锁定 approved `@nestjs/bullmq`/`bullmq` 依赖、queue/prefix/job constants 和独立
  producer/reader/worker Redis connection owners；off 模式不创建策略 queue 资源。
- [x] 3.2 通过 candle foundation 的可失败隔离 post-commit port，为 sealed/discarded 终态实现非阻塞
  `candle_finalized` handoff、严格 union payload、确定性 jobId 和 attempts/retention/stalled/deadline
  配置；queue failure 不回滚 market state，discarded 不传价格或原因。
- [x] 3.3 实现 `apps/mist` 当前交易日一次性 bounded startup compensation、稳定顺序、跨日 expiry、
  out-of-order discard 和 duplicate/restart/disconnect tests；不增加持续 reconciler、retry 或 batch。
- [x] 3.4 删除 legacy `StrategyScanController/Service`、scan DTO/result、Nest/schedule registration、
  OpenAPI 和 tests；证明不存在 manual Signal RPC、第二套 run lifecycle 或隐式 fallback。
- [x] 3.5 与独立前端项目建立 breaking release gate，删除 manual live-scan consumer；本 change 不直接
  修改前端代码。

## 4. Signal Runtime 与 Evaluation

- [x] 4.1 新建单实例 Hybrid Nest project `signal`、`apps/signal`、`SignalAppModule`、HTTP health、TCP
  registry-refresh 和 BullMQ worker，共享唯一 registry/window/analysis/episode state owner；新建
  `libs/signal/src/contracts`，单一持有 Signal control-plane pattern/command/result/error/decoder，
  caller/handler 统一从 exact `@app/signal` root barrel 导入，不得放入 transport、strategy 或 app
  source；禁止 wildcard/deep import、contract 导入 transport/Nest/TypeORM/Redis 或重复 raw pattern。
- [x] 4.2 实现 immutable registry refresh/commit、listener eligibility、source-aware group creation、
  disable/version in-flight race 和 bounded structural cleanup。
- [x] 4.3 实现 A 股 session 对齐的 1/5/15/30/60m period builder；从 sealed 1m 生成同形 complete 或
  incomplete StrategyBar，零可用组成 K 时不产出，迟到 K 不修订终态。
- [x] 4.4 接入共享 QuantityForwardFillProjector、Strategy-owned Indicator calculations、context builder/evaluator/serializer，
  覆盖 KDJ 13/14、MACD 130/131、restart parity 和多策略同组只计算一次。
- [x] 4.5 用 contract/negative tests 证明 V1 只接受 `candle_finalized` 且严格区分
  `sealed + finite triggerPrice` 与 `discarded + null`；snapshot/raw provisional input 不进入
  observation、window、episode、Signal 或 AlertEvent。

## 5. Episode 与持久化

- [x] 5.1 实现 source-aware active/inactive episode membership：matched activate/suppress、evaluated
  non-match clear、unavailable no-op、restart/off/day rollover clear 和 listener cleanup。
- [x] 5.2 实现 shadow 零策略表写入；on 模式使用短 MySQL transaction 原子写 live Signal 与 PENDING
  AlertEvent，并复用共享 contextSnapshot serializer。
- [x] 5.3 实现 approved logical identity、named AlertEvent dedupe conflict classifier、duplicate skip 和
  非目标数据库错误传播；本 change 不新增 migration 或 Signal composite unique。
- [x] 5.4 覆盖每日首次重发、持续命中抑制、incomplete K、disable/version race、transaction rollback、
  duplicate/conflict 和 unavailable 不落库 tests。

## 6. 部署、监控与 HIL

- [x] 6.1 增加 Signal build/Compose/PowerShell/env/start order、内部 HTTP/TCP、共享 Redis connection、
  TypeORM bootstrap 和 graceful shutdown；模式默认 off，gateway 不暴露 Signal route。
- [x] 6.2 实现 typed scoped health/diagnostics 和 trigger/context/window/evaluation/episode/persistence、
  queue、heap/GC、Redis memory/AOF/drain throughput 低基数 monitoring/contracts。
- [ ] 6.3 运行受影响仓库完整基线、真实 MySQL/Redis tests、strict OpenSpec、退役路径检索和
  `git diff --check`。
- [ ] 6.4 以 shadow 完成支持交易时段 restart、missing/duplicate/conflict、listener-bound memory、
  1/5/15/30/60 timestamp seam 和 TDX/QMT realtime/historical quantity profile HIL。
- [ ] 6.5 经项目负责人审核 shadow、protected-table 零写入、capacity 和 timestamp/quantity evidence 后
  才切 on；on HIL 必须验证 transaction、episode 与幂等，然后才能归档。
