## Why

现有 signal-level backtest 已经由 `apps/mist` 的 HTTP 请求同步加载历史 K、执行规则并逐条写入结果，
长时间回放会占用公共 API 进程的内存、CPU 和数据库连接。策略运行时拆分后，需要把回测执行移到
独立故障域，同时保留当前公共 API 和共享 evaluator 语义。

## What Changes

- 新建单词命名的 Nest application：项目名 `backtest`、目录 `apps/backtest`、根模块
  `BacktestAppModule`。
- `apps/mist` 继续持有 `/v1/strategy-backtests` 公共 API、鉴权和查询入口，但不再执行历史回放。
- 当前混合创建、同步执行与查询的 `StrategyBacktestService` 直接退出：`apps/mist` 新建
  `BacktestRunCommandService` 持有 durable register、RPC submission 和提交错误映射，新建
  `BacktestRunQueryService` 持有 run/signals MySQL 查询与 VO mapping；删除旧 `executeRun()`、回测 K
  repository/evaluator/context-builder 注入及其失效测试，不保留 feature flag、双跑或本地 fallback。
- `POST /v1/strategy-backtests` 改为异步 command-style 提交：持久登记并被 TCP handler 接受后立即
  返回 `202 Accepted`、`runId`、显式命名的初始状态 `initialStatus=PENDING` 和
  `Location: /v1/strategy-backtests/{runId}`，不等待回测计算或返回结果。
- 已创建 run 的提交失败使用稳定 HTTP 映射：`queue_full` 条件标记 FAILED 后返回
  `429 + BACKTEST_QUEUE_FULL`；backtest 未就绪返回 `503 + BACKTEST_NOT_READY`，TCP 连接失败返回
  `503 + BACKTEST_UNAVAILABLE`；command timeout 后仍可从 PENDING 条件标记 FAILED 时返回
  `504 + BACKTEST_COMMAND_TIMEOUT`。timeout 条件更新未命中后只 read back 一次，
  RUNNING/COMPLETED/FAILED 视为 command 已被接受并返回 `202`，PENDING/missing 或 readback error
  返回 `500 + INTERNAL_ERROR`。错误响应仍按已确认状态携带 `runId` 与 `Location`。
- `apps/backtest` 持有历史 K 读取、bounded context 构建、回测任务执行、运行状态推进和
  `BacktestSignalResult` 写入。
- Backtest V1 的公共请求只接受 `source=tdx|qmt`。`source=ef` 在创建 durable run 前由
  `CreateBacktestRunDto` 返回 `400 + VALIDATION_ERROR`；若启动补偿或异常数据遇到存量 PENDING EF run，
  runner 在读取 K 前将其稳定失败为 `BACKTEST_SOURCE_UNSUPPORTED`。本 change 不为 EF 查询、修复、
  quantity profile、迁移或回填。
- 每个 BacktestRun 只绑定一个必填 source，整个 `targetUniverse` 都从该 source 读取。TDX 当前
  `front` 与 QMT 当前 `front_ratio` 不被声明为等价，策略引擎也不负责统一复权：它只在选定 source
  的单一有序价格序列内计算。V1 不跨 source 拼接、fallback、比较或补 K，也不增加 adjustment mode
  字段；不同 source 的 run 是不同实验，不保证结果可直接比较。
- Backtest 对可识别的逐目标业务缺口采用“完成状态 + 结构化 warning”而不是新增 `PARTIAL` 状态：
  `BacktestRun.targetIssues` 持久化有界的 `{securityCode,code}` 数组，V1 code 只允许
  `SECURITY_NOT_FOUND|NO_HISTORICAL_BARS`。至少一个目标可执行时 run 正常 COMPLETED；所有目标都被
  跳过时 FAILED 并使用 `BACKTEST_NO_EXECUTABLE_TARGETS`。无信号命中仍是无 warning 的正常成功；
  有历史 K 但整个区间只得到 `unknown/unavailable` 也按正常零信号完成，不新增
  `NO_EVALUABLE_BARS`。只有 MySQL、K invariant、evaluator 或结果持久化等真正异常才使整个 run
  失败，且不得降级成 target warning。
- 历史读取消费前置 `evolve-strategy-evaluation-contract` 单一持有的 canonical `StrategyBar`、
  `StrategyMarketDataPort` 与 domain types，并只实现共享
  `StrategyMarketDataPort.readReplayPage()` 的 MySQL adapter：
  `StrategyReplayPageCriteria → StrategyReplayPage`。该能力按单一
  `(securityId, source, period)` 使用 timestamp cursor 和固定内部页大小 1000 有界读取 MySQL `k`，返回 canonical
  `StrategyBar`；historical mapping 将必填 `type` 设为 `complete`，并在已验收 profile 下把
  provider/source-specific 存量量额精确映射为 `volume=股`、`amount=人民币元`。TDX A 股预期为
  volume 原值（股）、amount `×10000`；QMT A 股预期为 integral volume `×100`（手→股）、amount
  原值（人民币元），非零 fractional volume 不舍入并 fail closed。TDX/QMT 的 1m 与日线必须先完成
  raw provider → MySQL exact string → canonical value 的真实 fixture/HIL，未验收前引用量额的 plan
  realtime/backtest-ineligible，但价格与 Indicator replay 不受影响。MySQL `k` 保持现有值，不在本
  change 迁移或回填。分页不使用 OFFSET，不成为用户 lookback、HTTP/env 配置或 per-run hard limit；
  context/Indicator/projector 状态必须跨页连续。该能力不是公共 HTTP/RPC 接口，也不要求
  `apps/backtest` 连接 market Redis；本 change 不重新声明 realtime methods 或公共 bar/port types。
- Backtest V1 把 provider 已返回并写入 MySQL 的每一行 historical K 视为权威历史事实，即使上游
  TDX/QMT 请求使用 `fillData/fill_data=true`。不同 timestamp 的相同 OHLCVA 是合法输入，不按重复 K
  删除；reader 不识别 provider-filled provenance、不重建 gap、不改写 `type=complete`，也不触发历史
  清理或重导。只有 MySQL 中实际不存在的 timestamp 才是缺 K；`QuantityForwardFillProjector` 仍只
  处理 persisted row 中显式为 null 的量额。
- replay page 查询固定使用 `security_id/source/period` 等值前缀、inclusive `startAt/endAt`、后续页
  `timestamp > afterTimestamp`、`ORDER BY timestamp ASC LIMIT 1000`，只选择 `StrategyBar` 所需列。
  V1 复用现有
  `uq_k_security_source_period_timestamp(security_id,source,period,timestamp)`，不新增 K index/migration，
  不使用 OFFSET、relation join、`FORCE INDEX` 或预先 `COUNT(*)`。实现/发布前必须在真实 MySQL 8.4
  对高密度 1m 与日线 group 的 first/middle page 保存 `SHOW INDEX`、`EXPLAIN FORMAT=JSON` 和
  `EXPLAIN ANALYZE`，证明命中该索引且无 full table scan/filesort；V1 先记录真实执行时间与估算偏差，
  不预设经验阈值。证据失败时停止并重新评审，不直接猜测索引 migration。
- V1 以“Backtest 读取期间所选 MySQL historical K 不会被并发写入”为运行前提，不实现跨页数据库
  snapshot guard。reader 不持有长事务或锁，不比较 `COUNT/MAX(updated_at)`，不复制 K、不建 revision/
  staging 表，也不为此新增 retry、错误码或 migration。实时 Redis candle 写入是另一条链路，不违反
  该前提。
- Backtest 与 realtime 共用纯函数 `QuantityForwardFillProjector`：raw `StrategyBar` 的量额 null 保持
  不变，evaluation view 只在同 `(securityId, source, period, tradingDay)` 向前取最近有效值。回测区间
  若从日内开始且规则消费量额，runner 内部从该交易日开端有序重放以建立 seed，但只从用户请求的
  `startAt` 发布结果；不得读取 future 或继承前一交易日。日线每根 K 属于不同 tradingDay，因此 null
  日线保持 unavailable，停牌日没有 K 时也不虚构 evaluation anchor。
- `BacktestSignalResult.contextSnapshot` 与 live Signal 复用共享 serializer。snapshot 中的
  `k.volume/k.amount` 保持实际参与 evaluation 的 canonical scalar；compiled plan 所需 current/prior
  quantity observation 另存 `quantityEvidence` 的 `raw/effective/resolution`，resolution 仅允许
  `observed|forwardFilled`。unavailable 不产生 result/snapshot，不新增结果列、表或 migration。
- V1 直接以 MySQL `BacktestRun` 作为权威持久任务登记：`apps/mist` 创建 PENDING run，
  `apps/mist` 通过 NestJS Microservices TCP request-response 发送版本化 runId 触发，
  `apps/backtest` 接收后执行；不增加 Redis/BullMQ backtest queue。
- V1 只运行一个 `backtest` 实例，以 `status=PENDING` 条件更新原子领取；进程中断后将遗留 RUNNING
  run 标记为 FAILED，由用户创建新 run，不自动重试。
- 正常运行不周期轮询 MySQL；`apps/mist` 与 `apps/backtest` 只在各自启动时执行一次 PENDING
  补偿。`apps/backtest` 在对外 ready 和启动 runner 前固定 cutoff，按 `createdAt ASC, id ASC`
  最多恢复 `BACKTEST_CONCURRENCY + BACKTEST_QUEUE_CAPACITY` 个旧 PENDING；超量 run 条件标记 FAILED 并记录
  `BACKTEST_STARTUP_QUEUE_FULL`。`apps/mist` 固定自己的 cutoff 后只执行一次 3 秒有界 health 检查；
  `backtest.ready=true` 才补发，unreachable/timeout/非 200/非法 contract/ready false 时不等待、不重试、
  不轮询，并将 cutoff 内仍为 PENDING 的旧 run 条件标记 FAILED，使用
  `BACKTEST_STARTUP_UNAVAILABLE`。重复 run 幂等 accepted；TCP 发送/接收失败且 run 仍为 PENDING 时
  同样明确标记 FAILED。
- 本地等待队列的最大排队数量由 `libs/config` 的 `backtestEnvSchema` 对
  `BACKTEST_QUEUE_CAPACITY` 统一校验，并由 Nest `ConfigService` 注入；业务代码不得直接读取
  `process.env`。该配置默认 `8`，只接受 `1–64` 的整数。
- 单个 `backtest` service 允许多个 run 并发执行；`BACKTEST_CONCURRENCY` 由同一
  `backtestEnvSchema` 校验并经 `ConfigService` 注入，默认 `2`、范围 `1–8`。waiting capacity 只计算
  未开始的 distinct run，active run 只占 execution slot；默认总 admitted 上限为
  `2 active + 8 waiting`。V1 在同一 Node 进程内并发推进 page I/O；每个 run 使用独立内部常量
  `BACKTEST_CALCULATION_BATCH_SIZE=100`，每处理 100 根实际消费 K 或到达 page end 时检查 deadline，
  并用 `setImmediate` 让出 event loop。该值不进入 env/HTTP/RPC/strategy，也不引入 bar 级并行、
  worker_threads、多 Backtest 实例或多核并行承诺。
- `BACKTEST_CONCURRENCY` 只表示同时 active 的 run 数。单个 run 内的去重
  `(securityId,source,period)` group 以最简单的逐组串行方式执行，不新增股票级 worker pool 或并发
  配置；group 的先后顺序不是公共业务契约。每个 group 的 context/projector/Indicator 状态隔离，最终
  signal 集合和 count 不得依赖内部遍历顺序。
- 每个 RUNNING run 使用独立的协作式执行 deadline。`BACKTEST_RUN_TIMEOUT_MS` 由
  `backtestEnvSchema` 校验并经 `ConfigService` 注入，默认 `1800000ms`（30 分钟），只接受
  `60000–86400000ms` 的整数；预算从 PENDING 原子领取为 RUNNING 后开始，排队时间不计入。runner 在
  K 分页、计算批次、结果 batch 与完成提交边界检查；到期仅将当前 run 以稳定
  `BACKTEST_EXECUTION_TIMEOUT` 失败类进入既有 cleanup，释放其 execution slot，不重试、续跑或重新
  入队。该配置不是 HTTP/RPC/strategy 输入；V1 不以 `Promise.race` 伪装取消已发出的 MySQL 查询，
  driver query timeout 仍是独立数据库边界。
- 每个 run 只使用一个实际消费 K 总数上限：`BACKTEST_MAX_BARS_PER_RUN` 由 `backtestEnvSchema`
  校验并经 `ConfigService` 注入，默认 `10000000`，只接受 `10000–50000000` 的整数。计数跨全部去重后的
  securityId/source/period replay group，并包含用户 `startAt` 前用于 quantity forward-fill seed 的 K；
  恰好达到上限可以完成，准备消费第 `limit + 1` 根时以稳定
  `BACKTEST_BAR_LIMIT_EXCEEDED` 失败类进入既有 cleanup、删除部分结果并释放 slot，不返回部分成功。
  V1 不另设日期跨度、证券数量、结果数量或按 period 区分的上限，也不执行预先 `COUNT(*)`；该限制不是
  HTTP/RPC/strategy 输入。
- TCP command 使用 `libs/config` `mistEnvSchema` 中唯一的端到端
  `BACKTEST_COMMAND_TIMEOUT_MS`，默认 `3000ms`，只接受 `500–30000ms` 的整数；它覆盖连接与
  handler response，超时后不得自动重发。
- Backtest hybrid app 固定两个内部 listener：HTTP health 使用既有 Nest `PORT=8004`，Nest TCP 使用
  新增 `BACKTEST_RPC_PORT=8005`，两者必须不同。`apps/mist` 通过
  `BACKTEST_RPC_HOST=127.0.0.1`、同一 `BACKTEST_RPC_PORT=8005` 和
  `BACKTEST_HEALTH_URL=http://127.0.0.1:8004/health` 获取本地默认；Compose 分别覆盖为
  `backtest`、`8005`、`http://backtest:8004/health`。所有值由 `libs/config` 校验，两个 listener 都只
  在 Compose 网络内可达，不发布 host port 或 web-gateway route。
- 复用 `standardize-service-boundary-contracts` 提供的 `libs/transport/rpc`：
  `backtest.run.submit.v1` 使用必填 correlation 的
  `RpcRequestV1<SubmitBacktestRunCommandV1>` 和
  `RpcResultV1<null, SubmitBacktestRunErrorCodeV1>`；command 只含 `runId`，error union 只含
  `queue_full|not_ready|run_failed`。pattern、types 与 decoder 由新增 `libs/backtest` domain library
  单一持有；不进入 `libs/transport` 或 `libs/strategy`，也不建立 Backtest 专属 transport envelope。
- 公共 `202/429/503/504/500` 响应复用 `libs/transport/http`：成功返回真实 body statusCode、显式
  `BACKTEST_ACCEPTED` message；已创建 run 的错误 identity 放在 typed `ApiErrorDto.data`，HTTP
  requestId 传播为 RPC correlationId。
- evaluator、validator、Strategy-owned Indicator calculations、quantity projector、Backtest command type 和 backtest entities 保持在
  职责明确的 `libs/*`；contextSnapshot serializer 同样由共享 strategy library 持有，`apps/mist` 与
  `apps/backtest` 不互相导入应用源码。
- V1 明确不支持用户取消回测：不增加 cancel HTTP/RPC、DTO/VO、状态、字段、migration、前端操作或
  监控语义；客户端断开不撤销已持久化 run，deadline、进程中断和执行错误继续进入 FAILED。
- runner 可以在 RUNNING 期间分批提交 `BacktestSignalResult`，但这些记录只是内部未发布数据；
  每个 run 的 result buffer 使用固定内部常量 `BACKTEST_RESULT_BATCH_SIZE=100`，满 100 条即以一次短
  batch insert 提交，run 结束时提交不足 100 条的 remainder，再进入 COMPLETED。该值不进入 env、
  HTTP、RPC 或 strategy；失败不逐行 fallback、重试、跳过或拆批，统一进入既有 cleanup。
  `COMPLETED` 是唯一公共发布门。signals GET 对 PENDING/RUNNING 返回
  `200 + success=false + BACKTEST_RESULTS_NOT_READY`，对 FAILED 返回
  `200 + success=false + BACKTEST_RESULTS_UNAVAILABLE`，只有 COMPLETED 返回最终集合（包括合法空集合）。
- runner-owned 失败和启动时遗留 RUNNING 收口使用一次短事务：只有条件 FAILED 转换成功时才在同一
  事务删除部分结果；条件更新未命中时不删，cleanup 失败不递归重试。该边界不增加
  `isPartial`、published 字段、staging table 或 migration。
- 保留现有 `uq_backtest_signal_results_run_security_time`，只约束同一 run 内相同证券与信号时间的
  重复结果；用户重复回测必须创建新 `BacktestRun`，不同 run 可以产生相同信号。V1 不把唯一键冲突
  解释为幂等成功，不增加专用 classifier、skip、readback 或 retry，冲突统一进入 runner 持久化失败
  与部分结果清理路径。
- signals GET 使用 `BacktestSignalResultQueryDto → BacktestSignalResultPageVo →
  ApiResponseDto<BacktestSignalResultPageVo>`：`limit` 默认 50、范围 1–100，opaque cursor 按
  `signalTime ASC, id ASC` 做 keyset pagination，响应只含 `items + nextCursor`，不做 offset 或
  `COUNT(*)`。COMPLETED 结果不可变，因此跨页不需要 snapshot token 或长事务；HTTP consumer 可以
  按需加载下一页，不需要自动拉完整结果集。
- 仓库 migration 当前连续到 `013`，因此本 change 的候选文件序列为
  `014_add_backtest_target_issues.sql` 和
  `015_add_backtest_result_pagination_index.sql`；候选编号本身不是生产 schema 证据。只有真实
  `schema_migrations`、列/index inventory 和代表性 `EXPLAIN` 门禁确认候选编号未使用且目标对象不
  存在后，才正式固定。`014` 只以一次 `ALTER TABLE` 为 `backtest_runs` 增加非空、默认 `[]` 的 JSON
  列 `target_issues`；`015` 只以一次 `ALTER TABLE` 增加
  `idx_backtest_signal_results_run_time_id(backtest_run_id, signal_time, id)`。两个文件由现有 runner
  分别登记，避免 MySQL DDL 部分成功后整个多语句文件未登记；不修改现有 unique 或存量结果数据，
  也不回推历史 run 的逐目标 issue。
- run GET 始终返回 `targetIssues`；调用方轮询到终态后可以据此提醒“完成但有目标跳过”或“没有可执行
  目标”。这不是主动通知链路：本 change 不增加 WebSocket、SSE、webhook、WeCom、AstrBot、
  AlertEvent 或 notification queue，页面关闭后 V1 没有站外提醒。实际 `mist-fe` 展示改造由独立前端
  change 实现，本 change 只固定后端/OpenAPI 契约。
- 增加独立 backtest runtime 的内部结构化 `GET /health`：root `status` 表示进程存活，嵌套
  `backtest.ready/state` 表示启动补偿与 command acceptance，另返回低基数 active/waiting/configured
  capacity diagnostics。该 endpoint 不经 Nginx；Compose 只用它探测进程，部署验收和 Backtest-scoped
  compensation 另检查 `backtest.ready=true`。队列满不改变 ready，health 不实时查询 MySQL。
- 增加独立 backtest runtime 的部署、容量和监控门禁。V1 不为 Backtest Compose service
  新增 CPU/内存 hard limit、reservation 或对应环境变量；运行资源仍通过既有 concurrency、waiting
  capacity、execution deadline、consumed-bar limit 和 bounded batch 约束，HIL 只记录实际占用而不猜测
  一组发布阈值。
- 查询状态、“不支持取消”、部分结果可见性、result unique conflict、signals pagination 和逐目标
  warning 已经确认；migration 的实际编号和生产应用门禁必须在 schema inventory 后固定。内部 RPC
  envelope、Backtest pattern/payload/result 已按上述 V1 契约确认。
- 本 change 只迁移现有 signal-level backtest，不新增资金、仓位、订单、成交、费用、净值或
  portfolio simulation。

## Capabilities

### New Capabilities

- `backtest-runtime`: 定义独立 backtest application、执行所有权、控制面边界和运行时隔离。

### Modified Capabilities

- `strategy-signal-backtesting`: 将历史回放执行与结果写入从公共 API 进程迁移到 `apps/backtest`。
- `strategy-platform-roadmap`: 将 backtest runtime extraction 纳入 focused child-change 依赖图。
- `windows-docker-appliance`: 增加经逐项评审确认的 `backtest` service 和运行配置。
- `monitoring-health-alerts`: 增加 backtest command、执行、容量、失败和持久化观测。

## Impact

- **前置依赖**：`define-strategy-runtime-architecture`、`standardize-service-boundary-contracts` 和
  `evolve-strategy-evaluation-contract` 必须先通过公共边界与共享计算语义门禁；`extract-chan-core`
  不属于 Backtest 前置依赖。
- **`mist`**：新增 `apps/backtest`，拆分 controller、command contract、executor、persistence
  orchestration 和 tests，建立 shared market-data replay capability，并增加与 NestJS 10 对齐的
  `@nestjs/microservices` 直接依赖。
- **`mist-deploy` / `mist-monitoring`**：新增经确认的 service、配置、health、metrics、rollback
  和 Windows appliance 验证。
- **HTTP/API**：保留 `/v1/strategy-backtests` 路径；POST 成功提交后返回 `202 + runId + PENDING`
  和 run `Location`，当前状态与结果继续从既有 GET 资源读取。
- **数据库**：复用 `BacktestRun` 作为任务登记和 `BacktestSignalResult` 作为结果边界；使用
  forward-only migration 增加已确认的 `backtest_runs.target_issues` JSON 列和结果分页索引，单实例
  失败语义不新增 lease/heartbeat 字段，其他新列或索引必须另行确认。
- **不包含**：`mist-fe` 实现、主动 notification delivery、realtime Signal/AlertEvent、provider
  realtime 数据、`apps/schedule` 或 portfolio simulation。
