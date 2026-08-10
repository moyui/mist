# 执行任务

本文件只统计产品代码、数据库、测试、部署和环境证据。已确认的 HTTP/RPC、run lifecycle、容量、
启动补偿、历史读取、错误、分页、partial-result、source/quantity 和 persistence 语义，以本 change 的
`design.md` 与 delta specs 为准，不再用已勾选任务表示开发进度。

## 1. 前置与基线

- [x] 1.1 确认 `standardize-service-boundary-contracts` 和 `evolve-strategy-evaluation-contract` 已通过
  验收；`extract-chan-core` 不属于 Backtest 前置依赖。
- [x] 1.2 记录 `mist`、`mist-deploy`、`mist-monitoring` 的 branch、HEAD、dirty/worktree、Compose、
  active changes 和现有同步 Backtest 影响链。
- [x] 1.3 运行现有 Backtest controller/service、schema integrity 和完整 backend 基线，区分自动化通过
  与环境阻塞。
- [x] 1.4 只读审计真实 `schema_migrations`、BacktestRun/BacktestSignalResult 存量、物理列、named
  constraints 和 index；候选 migration 编号或无存量假设不成立时停止 DDL。  ——2026-08-10 完成（evidence/2026-08-10-production-audit.md）：016 migration 已应用、target_issues 列+run_time_id 复合索引已生效、runs=5/results=28、物理列/FK/索引完整。

## 2. Runtime、RPC 与 Admission

- [x] 2.1 新建 Nest project `backtest`、`apps/backtest`、`BacktestAppModule` 和独立 bootstrap/build，
  不注册公共策略 API或导入 `apps/mist`/`apps/signal` 源码。
- [x] 2.2 新建单词命名的 `libs/backtest` domain library，在 `src/contracts` 单一持有 Backtest
  pattern/command/error code/decoder；caller/handler 从 `@app/backtest` 导入，并与 approved
  `@app/transport/rpc` envelope、correlation 和 exception boundary 装配。不得把 contract 放入
  `libs/strategy`、`libs/transport` 或任一 app source；仅提供 exact root barrel alias，禁止 wildcard、
  external deep import、domain contract 导入 transport/Nest/TypeORM/Redis 或 caller/handler 重复 raw
  pattern。
- [x] 2.3 在 `libs/config` 实现并注入已批准的 Backtest ports、capacity、concurrency、command/run
  deadline 和 bar-limit 配置；业务代码不得直接读取 `process.env`。
- [x] 2.4 实现单实例 PENDING 原子领取、active/waiting admission、幂等重复 command、bounded queue 和
  queue-full/error mapping；同一 run 使用自动清理的 keyed admission chain，dedupe 早于 capacity，
  capacity/reservation 间无 await，active/waiting state 与 admission chain 分离，且不同 correlation
  的重复请求分别构造 result。memory acceptance 不新增持久化状态；runner 以 PENDING 条件 claim，
  affected=0 无 readback 丢弃，claim/cleanup/schedule 的所有出口 finally exactly-once release slot 并
  admit 至多一个 oldest waiting identity。
- [x] 2.5 实现 Backtest 自身启动 reconciliation、遗留 RUNNING failure、cutoff/FIFO 恢复与 scoped
  readiness；实现 `apps/mist` 一次性 3 秒 health compensation，不等待、轮询或阻塞其他 API。

## 3. Historical Replay 与 Evaluation

- [x] 3.1 只实现共享 `StrategyMarketDataPort.readReplayPage()` 的 MySQL adapter，使用 approved
  source-exact criteria、固定内部 page size 和 timestamp keyset pagination，不连接 market Redis。
- [x] 3.2 只选择构造 canonical `StrategyBar` 所需列，完成 TDX/QMT A 股 historical quantity profile
  mapping、共享 `KPriceProjector` 的 MySQL fixed-scale OHLC 投影、provider-filled row、duplicate
  timestamp/value 和 null 语义的 tests；不得增加 K migration、全局 decimal coercion 或消费者私有转换。
- [x] 3.3 实现跨页连续的 bounded context、QuantityForwardFillProjector、Indicator/evaluator state、
  group 串行执行、cooperative deadline 和实际消费 K 总量限制。
- [x] 3.4 实现 target resolution、`targetIssues`、无历史/全目标不可执行、unavailable 零结果和真正
  database/evaluator failure 的区分。
- [x] 3.5 实现 bounded calculation/persistence batches、BacktestRun 状态推进和
  BacktestSignalResult/contextSnapshot 写入；非目标数据库错误直接到 run boundary。
- [x] 3.6 实现并验证结果唯一键冲突的普通数据库失败语义、COMPLETED publication barrier 和 immutable
  result pages；不得把重复业务运行自动去重。

## 4. Schema 与公共 API Cutover

- [ ] 4.1 只有真实 preflight 通过后才新增最终 forward-only migration；分别处理 `target_issues` 与
  result pagination index，并同步 ORM/raw SQL/audit/repair-forward。
- [x] 4.2 保留 `/v1/strategy-backtests` owner 在 `apps/mist`，把 POST 改为 durable register + TCP
  accepted 后返回真实 202、`BacktestRunReceiptVo{runId,initialStatus=PENDING}` 和 Location；receipt 不为
  刷新当前状态增加 DB readback，当前状态只从 run GET 读取。
- [x] 4.3 实现 run GET 与 signals GET 的 approved DTO/VO、business/not-found/error envelope、opaque
  keyset cursor、1–100 limit、targetIssues 和 partial-result visibility；cursor 使用不签名、不加密的
  内部 Base64URL contract，并执行 512 字符、严格字段、时间与 run scope 校验。
- [x] 4.4 用 negative contract tests 证明 V1 无 cancel API/RPC、无自动 retry、无 EF create、无公开
  Backtest runtime route，且 frontend 不在本 change 修改。
- [x] 4.5 将旧混合 service 拆为 `BacktestRunCommandService` 与 `BacktestRunQueryService`，删除
  `StrategyBacktestService.executeRun()`、API 进程 K/evaluator/context 依赖和失效测试；检索并证明没有
  replay facade、feature flag、fallback、双跑或跨 app source import。

## 5. 部署、监控与验收

- [x] 5.1 增加单实例 Backtest image/build、Compose service、内部 HTTP/RPC 配置、PowerShell defaults、
  deploy/start order 和 health contract；`mist-backend` 不以 Compose healthy 硬依赖 Backtest。
- [ ] 5.2 增加 scoped readiness、active/waiting/capacity、command/run/duration/persistence/failure、
  target issue 和 lost-ACK 低基数 monitoring 与 contract tests。Backtest health 与 command outcomes
  已实现；Mist 侧一次性 startup-compensation/lost-ACK outcome 的 monitoring 仍待补齐。
- [ ] 5.3 运行 `mist`、`mist-deploy`、`mist-monitoring` 完整基线、strict OpenSpec、退役路径检索和
  `git diff --check`。
- [ ] 5.4 在隔离真实 MySQL 执行 migration pre/postflight/readback、protected digest、first/middle page
  SQL shape、`SHOW INDEX` 和 representative `EXPLAIN`/大范围 replay 门禁。
- [ ] 5.5 完成 Windows appliance restart/isolation 与 TDX/QMT 1m/日线 historical quantity HIL；未证明
  profile 时 quantity plan 保持 ineligible。
- [ ] 5.6 经项目负责人审核数据库、API、runtime、deployment 和 HIL evidence 后，先部署并验收尚未接
  command 的 `backtest`，再部署 RPC-only `mist-backend` 完成 cutover；V1 不新增专用 rollback protocol。
