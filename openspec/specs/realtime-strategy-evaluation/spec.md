# realtime-strategy-evaluation Specification

## Purpose
Define realtime strategy evaluation: lightweight candle_finalized wake-up triggers, minimal self-describing BullMQ contracts, same-day best-effort handoff recovery, fixed queue namespace and retention, promotion gates for realtime modes and the Signal application boundary.
## Requirements
### Requirement: Strategy Triggers Shall Be Lightweight Wake-Up References
Realtime market changes SHALL wake strategy evaluation through a versioned trigger that excludes full history,
strategy rules, native provider payload and notification data.

#### Scenario: A candle bucket reaches a terminal outcome
- **WHEN** the approved handoff is enabled
- **THEN** it MUST offer a bounded wake-up reference
- **AND** market sealing MUST NOT wait for evaluation

### Requirement: Candle-Finalization Trigger Contracts Shall Be Minimal And Self-Describing
The V1 `candle_finalized` job SHALL identify the exact 1m market terminal outcome and expose its business time
without copying a complete candle or provider payload into BullMQ.

#### Scenario: A sealed candle finalization is produced
- **WHEN** a valid realtime 1m candle has been committed
- **THEN** the job name MUST be `candle_finalized`
- **AND** its data MUST contain exactly `contractVersion=1`, `securityId`, the exact TDX/QMT `source`,
  `period='1m'`, RFC3339 `triggerTime`, `outcome='sealed'` and finite `triggerPrice`
- **AND** `triggerTime` MUST represent the same canonical instant as the candle `bucketStartMs`
- **AND** `triggerPrice` MUST represent the sealed candle close
- **AND** it MUST NOT contain a complete candle, history, strategy rule, native snapshot, notification payload,
  `securityCode`, `providerSymbol` or a redundant `tradingDay`

#### Scenario: A discarded candle finalization is produced
- **WHEN** the candle foundation commits a discarded terminal outcome for a realtime 1m bucket
- **THEN** the job name MUST be `candle_finalized`
- **AND** its data MUST contain exactly `contractVersion=1`, `securityId`, the exact TDX/QMT `source`,
  `period='1m'`, RFC3339 `triggerTime`, `outcome='discarded'` and `triggerPrice=null`
- **AND** it MUST NOT contain a discard reason or invent OHLC, quantity or trigger-price evidence

#### Scenario: A deterministic job identity is created
- **WHEN** the producer adds the `candle_finalized` job
- **THEN** jobId MUST be
  `candlefinal-v1-{source}-{securityId}-{period}-{Date.parse(triggerTime)}`
- **AND** it MUST use a BullMQ-safe separator other than `:`
- **AND** `source` MUST participate in the identity
- **AND** outcome MUST NOT participate because one bucket can commit only one terminal outcome

#### Scenario: The signal worker consumes a sealed trigger
- **WHEN** `apps/signal` receives a valid sealed `candle_finalized` job
- **THEN** it MUST resolve only the identified Redis sealed candle on the normal path
- **AND** it MUST map that sealed 1m candle to a canonical bar with `type='complete'` and append it to the
  shared market window before evaluation
- **AND** it MUST NOT query complete history for each trigger
- **AND** a resulting persisted Signal context MUST retain `triggerTime` and `triggerPrice` so downstream
  notification consumers do not query BullMQ or market Redis

#### Scenario: The signal worker consumes a discarded trigger
- **WHEN** `apps/signal` receives a valid discarded `candle_finalized` job
- **THEN** it MUST NOT resolve or construct a 1m StrategyBar or run the 1m evaluator
- **AND** it MUST advance the finalization cursor and period builder for that missing constituent slot
- **AND** any derived Signal MUST use the emitted derived bar time and close as its trigger evidence

#### Scenario: A retained job is added again
- **WHEN** BullMQ still contains the same deterministic jobId
- **THEN** queue-level duplicate suppression MAY ignore the second add
- **AND** worker canonical identity/content deduplication MUST remain authoritative after job retention expires

### Requirement: Candle-Finalization Triggers Shall Use NestJS BullMQ Integration
V1 candle-finalization triggers SHALL use `@nestjs/bullmq` and `bullmq` as the durable asynchronous handoff
between the market candle producer and `apps/signal`.

#### Scenario: Trigger transport is wired
- **WHEN** realtime trigger implementation begins
- **THEN** the producer and consumer MUST use the approved NestJS BullMQ modules
- **AND** they MUST connect to the existing `MIST_REALTIME_REDIS_URL` in the accepted single-node topology
- **AND** BullMQ MUST use its own prefix and connection owner, separate from market-data keys and clients
- **AND** they MUST NOT use Nest Redis Pub/Sub transport or TCP events as the durable queue

#### Scenario: The producer becomes ready before the worker
- **WHEN** `apps/mist` submits a valid job before the Signal BullMQ Worker is ready
- **THEN** BullMQ MUST retain the job in its waiting state for later consumption
- **AND** the producer MUST NOT wait for Signal process health or worker readiness
- **AND** market sealing MUST remain complete independently of Signal startup outcome

#### Scenario: The shared Redis dependency fails
- **WHEN** the single Redis service is unavailable
- **THEN** health MUST report that market state and BullMQ share the same physical failure domain
- **AND** it MUST NOT claim Redis-level isolation between candle and queue state
- **AND** a queue write failure after candle commit MUST NOT roll back the committed candle

### Requirement: Handoff Recovery Shall Be Same-Day And Best-Effort
V1 SHALL limit automatic handoff recovery to one bounded startup pass for the current Shanghai trading day and
SHALL NOT claim transactional consistency between committed candles and BullMQ jobs.

#### Scenario: Post-commit enqueue fails
- **WHEN** a sealed or discarded market commit succeeds but its single `queue.add()` attempt fails
- **THEN** the committed market terminal outcome MUST remain committed
- **AND** the producer MUST record the enqueue failure
- **AND** it MUST NOT retry in the market-sealing hot path

#### Scenario: The market producer starts during an enabled trading day
- **WHEN** realtime strategy mode is `shadow` or `on` and Redis plus the BullMQ producer are ready
- **THEN** `apps/mist` MUST run one bounded startup-compensation pass
- **AND** it MUST consider only manifest-reachable sealed and discarded outcomes for the current Shanghai
  trading day and current listener inventory
- **AND** it MUST submit them with the same contract and deterministic jobId
- **AND** it MUST NOT scan previous trading days or schedule a continuous reconciler

#### Scenario: A same-day job was already completed or failed
- **WHEN** startup compensation attempts to add its deterministic jobId again
- **THEN** completed and failed jobs MUST still be retained through the same-day compensation window
- **AND** BullMQ duplicate identity MUST prevent creation of a second retained job
- **AND** a failed job MUST remain failed without automatic startup retry

#### Scenario: Startup compensation fails
- **WHEN** its bounded scan, read or enqueue operation fails
- **THEN** the attempt MUST record a failed outcome and terminate
- **AND** it MUST NOT loop, back off or run again on a timer during that process lifetime

#### Scenario: The recovery limit is reported
- **WHEN** operators inspect realtime handoff health or evidence
- **THEN** the system MUST describe recovery as same-day best-effort compensation
- **AND** it MUST NOT claim exactly-once delivery, complete reconciliation, candle/queue consistency or
  cross-day replay
- **AND** it MUST NOT add an enqueued marker, Redis/MySQL outbox or two-phase candle/queue commit in V1

### Requirement: V1 Shall Permit Natural Queue Backlog
V1 SHALL retain one independent job per 1m finalization and SHALL defer backlog admission limits and batching
until runtime evidence justifies a separate change.

#### Scenario: The worker is slower than the producer
- **WHEN** waiting jobs accumulate
- **THEN** the producer MUST continue submitting individual `candle_finalized` jobs
- **AND** it MUST NOT apply a backlog-count admission check, queue rate limit or threshold-based drop
- **AND** it MUST NOT group multiple candles into one batch job

#### Scenario: Startup compensation finds multiple candles
- **WHEN** the single current-day compensation pass submits them
- **THEN** it MUST retain one deterministic job per sealed or discarded 1m finalization
- **AND** it MUST submit them in stable `triggerTime`, `source`, then `securityId` order
- **AND** it MUST NOT use `Queue.addBulk()` in V1

#### Scenario: Queue capacity is observed
- **WHEN** realtime strategy queue integration is enabled
- **THEN** monitoring MUST expose job-state counts, shared Redis memory, AOF growth and drain throughput
- **AND** the system MUST NOT claim that the queue has a hard backlog bound
- **AND** sustained pressure MUST require the operator to set strategy mode to `off` and use a separately reviewed capacity
  change rather than an unreviewed runtime threshold

### Requirement: Cross-Day Waiting Jobs Shall Expire Before Evaluation
A queued realtime trigger SHALL be eligible only on the same Asia/Shanghai calendar day as its
`triggerTime`.

#### Scenario: A delayed job is consumed later on the same Shanghai day
- **WHEN** its `triggerTime` and the injected worker clock resolve to the same Asia/Shanghai calendar day
- **THEN** the worker MUST continue normal candle-finalization processing
- **AND** post-close processing on that same day MUST NOT be expired solely because the session ended

#### Scenario: A delayed job is consumed on a later Shanghai day
- **WHEN** its `triggerTime` resolves to an earlier Asia/Shanghai calendar day than the injected worker clock
- **THEN** the worker MUST complete it with the bounded queue outcome `expired_trading_day`
- **AND** it MUST NOT read the Redis candle, mutate a shared window or episode, run analysis/evaluation, or
  create Signal/AlertEvent
- **AND** this outcome MUST NOT be represented as strategy evaluation `unavailable`

#### Scenario: An expired outcome is observed
- **WHEN** monitoring records `expired_trading_day`
- **THEN** it MUST aggregate only the bounded outcome
- **AND** securityId, source and triggerTime MUST remain in bounded diagnostics rather than metric labels

### Requirement: Failed And Stalled Jobs Shall Not Retry Automatically
V1 SHALL execute each job at most once after it becomes active and SHALL prefer a failed outcome over BullMQ
automatic retry or stalled recovery.

#### Scenario: The processor throws an exception
- **WHEN** Redis, MySQL, analysis, evaluation or persistence fails
- **THEN** the job MUST use `attempts=1` with no backoff
- **AND** the exception MUST reach the processor boundary and move the job to failed
- **AND** it MUST NOT be converted to success or strategy evaluation unavailable

#### Scenario: The active worker loses its job lock
- **WHEN** a crash, event-loop stall or lock-renewal failure causes the job to become stalled
- **THEN** the worker MUST use `maxStalledCount=0`
- **AND** the first stalled detection MUST move the job to failed rather than wait
- **AND** it MUST NOT execute the job again automatically

#### Scenario: A failed job remains in the same-day queue
- **WHEN** startup compensation encounters its deterministic jobId
- **THEN** the failed job MUST remain retained for the accepted compensation window
- **AND** startup compensation MUST NOT retry or replace it
- **AND** V1 MUST NOT expose a manual retry API, dead-letter queue, automatic repair or retry scheduler

#### Scenario: The signal worker shuts down normally
- **WHEN** application shutdown begins
- **THEN** the registered worker MUST be closed through the standard Nest/BullMQ provider lifecycle
- **AND** V1 MUST NOT add a Signal-specific draining state, shutdown coordinator, deadline configuration,
  error code, or task-compensation protocol
- **AND** failed and stalled outcomes MUST remain separately observable

### Requirement: Realtime Jobs Shall Use Real Dependency Timeouts
Each `candle_finalized` job SHALL use one shared-configured overall deadline, and every blocking dependency operation
SHALL use timeout behavior that its client or server can actually enforce. The overall deadline SHALL be
`REALTIME_STRATEGY_JOB_TIMEOUT_MS=30000`; Redis connect and command ceilings SHALL be 5000ms and 3000ms,
MySQL connect and historical SELECT ceilings SHALL each be 5000ms, and the InnoDB lock-wait ceiling SHALL be
3 seconds. Adapter-specific strategy timeout environment variables SHALL NOT be added.

#### Scenario: A processor starts a new stage
- **WHEN** the processor is about to validate expiry, resolve Redis observation, hydrate historical context, run
  analysis/evaluation, or begin persistence
- **THEN** it MUST check the remaining job deadline using the injected Clock
- **AND** it MUST NOT start that stage after the deadline has expired
- **AND** it MUST check the deadline again after the stage returns

#### Scenario: A dependency deadline is configured
- **WHEN** Redis or MySQL performs a potentially blocking operation
- **THEN** Redis MUST use its native connection and command timeout behavior on a client separate from the
  BullMQ blocking connection
- **AND** historical SELECT MUST use a MySQL server-side statement deadline that actually terminates the query
- **AND** the Signal/AlertEvent transaction MUST use finite shared connection and InnoDB lock-wait deadlines
- **AND** an outer `Promise.race` or timer that leaves the underlying operation running MUST NOT be represented
  as cancellation

#### Scenario: A job or dependency timeout occurs
- **WHEN** the overall deadline or a connection, command, query, or lock-wait deadline expires
- **THEN** the error MUST reach the BullMQ processor boundary and move the job to failed
- **AND** it MUST NOT be retried automatically, converted to evaluation unavailable, or caught as success
- **AND** no later analysis, evaluation, or persistence stage MAY start
- **AND** the failed job MUST follow the approved 24-hour retention and bounded observability policy

#### Scenario: Synchronous analysis is executed
- **WHEN** Indicator, quantity projection, or evaluator code runs
- **THEN** it MUST operate only on the approved bounded window and finite execution plan
- **AND** V1 MUST NOT add an application-only soft timeout that cannot interrupt the synchronous operation

#### Scenario: A timeout budget needs adjustment
- **WHEN** shadow or HIL evidence shows that an approved ceiling is unsuitable
- **THEN** the shared config or infrastructure contract MUST be reviewed and changed explicitly
- **AND** an adapter MUST NOT introduce an unreviewed local override

### Requirement: Queue Namespace And Result Retention Shall Be Fixed
V1 SHALL use one code-defined BullMQ namespace and SHALL retain completed and failed jobs for at least the
same-day startup-compensation window without adding runtime retention configuration.

#### Scenario: Queue modules are registered
- **WHEN** the producer Queue and signal Worker are constructed
- **THEN** both MUST use prefix `mist-bullmq`
- **AND** both MUST use queue name `strategy-trigger`
- **AND** 1m finalization jobs MUST use job name `candle_finalized`
- **AND** these names MUST be shared code constants rather than environment variables

#### Scenario: Queue and market Redis clients are constructed
- **WHEN** realtime strategy mode is `shadow` or `on`
- **THEN** the backend market writer, backend BullMQ producer, Signal market reader and Signal BullMQ Worker MUST
  remain separate connection owners
- **AND** they MUST NOT share one ioredis client object
- **AND** BullMQ MUST NOT use ioredis `keyPrefix`
- **AND** BullMQ MAY manage additional blocking or duplicated Worker connections without exposing their exact count
  as a business contract

#### Scenario: Redis disconnects during a live handoff
- **WHEN** a market adapter or BullMQ producer command cannot execute because Redis is unavailable
- **THEN** the command MUST fail fast rather than wait in an application offline replay queue
- **AND** a failed queue add MUST NOT roll back a committed candle
- **AND** the BullMQ Worker MAY reconnect using its standard transport lifecycle
- **AND** transport reconnection MUST NOT change `attempts=1`, `maxStalledCount=0` or introduce a business retry

#### Scenario: Strategy mode is disabled
- **WHEN** realtime strategy mode is `off`
- **THEN** the backend MUST NOT construct the realtime BullMQ producer
- **AND** Signal MUST NOT construct the BullMQ Worker or market Redis reader
- **AND** candle Redis ownership MUST remain governed independently by realtime productization mode

#### Scenario: A job completes or fails
- **WHEN** BullMQ applies result retention
- **THEN** `removeOnComplete` and `removeOnFail` MUST both use `age=86400` seconds
- **AND** neither policy MUST use a count limit
- **AND** immediate boolean removal MUST NOT be enabled
- **AND** lazy retention beyond 24 hours MAY occur until a later result triggers cleanup

#### Scenario: A waiting job crosses the day boundary
- **WHEN** it has not reached completed or failed
- **THEN** result retention MUST NOT remove it
- **AND** the worker MUST consume it under the approved `expired_trading_day` rule

### Requirement: V1 Realtime Evaluation Shall Accept Only Finalized Candle Outcomes
V1 SHALL process deterministic `candle_finalized` triggers for sealed or discarded 1m terminal outcomes and
SHALL exclude snapshot-update evaluation from its trigger, queue and evaluator contracts.

#### Scenario: A raw snapshot changes
- **WHEN** the market ingress updates its latest in-memory snapshot
- **THEN** it MUST NOT enqueue a strategy job or create a realtime strategy candidate directly

#### Scenario: An unsupported trigger reaches the worker
- **WHEN** a job name or trigger kind is not the V1 `candle_finalized` contract
- **THEN** contract validation MUST reject it before market-data resolution
- **AND** it MUST NOT enter a window, episode, Signal or AlertEvent persistence

#### Scenario: Snapshot evaluation is proposed later
- **WHEN** a future product requires unsealed-K strategy evaluation
- **THEN** a separate focused change MUST define the complete contract and failure semantics
- **AND** this V1 contract MUST NOT be treated as implicit authorization for a snapshot extension
- **AND** backtest MUST NOT be required to simulate snapshots

### Requirement: Realtime Evaluation Shall Use The Signal Application Boundary
Realtime trigger consumption, shared windows, analysis and episode orchestration SHALL run in `apps/signal`,
separate from public strategy API controllers and from `apps/schedule`.

#### Scenario: The public backend is restarted independently
- **WHEN** the approved deployment topology supports independent worker lifecycle
- **THEN** strategy API ownership MUST remain in `apps/mist`
- **AND** signal evaluation ownership MUST remain in `apps/signal`
- **AND** schedule MUST remain disabled

### Requirement: Realtime Candidates Shall Persist Atomically
In enabled on mode, an approved candidate SHALL persist its Signal and linked PENDING AlertEvent in one MySQL
transaction and SHALL classify only an exact `uq_strategy_alert_events_dedupe_key` conflict as idempotent. The
runtime SHALL rely on that transaction and MUST NOT pre-query `dedupeKey` existence.

#### Scenario: AlertEvent persistence fails
- **WHEN** Signal creation occurred inside the same transaction
- **THEN** both writes MUST roll back

#### Scenario: The exact dedupe constraint conflicts
- **WHEN** the AlertEvent insert conflicts with `uq_strategy_alert_events_dedupe_key`
- **THEN** the newly inserted Signal MUST roll back with the transaction
- **AND** the worker MUST complete the persistence stage as bounded `duplicate_skipped`

### Requirement: The Signal Application Shall Expose No Manual Execution Boundary
`apps/signal` SHALL execute strategies only from approved realtime triggers. Its TCP listener SHALL carry
registry-refresh control-plane commands and SHALL NOT expose a manual strategy-execution command.

#### Scenario: Signal ingress paths are hosted
- **WHEN** the `signal` Nest application starts
- **THEN** one Hybrid `SignalAppModule` process MUST host internal HTTP health/diagnostics, TCP registry-refresh RPC
  and the BullMQ realtime worker
- **AND** all three paths MUST share one immutable registry, window and analysis-state owner
- **AND** the runtime MUST NOT split them into independently stateful Signal processes
- **AND** the web gateway MUST NOT expose the internal Signal HTTP listener as a public business API

#### Scenario: Signal initializes its database dependency
- **WHEN** `SignalAppModule` is bootstrapped
- **THEN** it MUST use the shared Nest `TypeOrmModule.forRootAsync()` pattern for its process-local MySQL pool
- **AND** HTTP and TCP listeners MUST start only after configuration, TypeORM initialization and the initial
  registry query succeed
- **AND** an initial failure MUST reach the application startup boundary
- **AND** Signal MUST NOT add a custom connection manager, polling loop, fallback, `mysqlReady` or unscoped
  readiness state

#### Scenario: Realtime strategy mode is off
- **WHEN** the Signal internal health endpoint is queried with `realtimeMode=off`
- **THEN** root service `status` MUST remain `ok`
- **AND** the realtime Redis/BullMQ worker MUST remain unstarted by design
- **AND** the TCP registry-refresh boundary MAY remain available
- **AND** the health response MUST NOT expose an unscoped `ready` field

#### Scenario: Enabled realtime infrastructure cannot initialize
- **WHEN** `realtimeMode` is `shadow` or `on` and its Redis/BullMQ initialization fails during bootstrap
- **THEN** the failure MUST reach the application startup boundary
- **AND** the process MUST NOT accept jobs with a partially initialized worker

### Requirement: Signal Health Shall Use Datasource-Style Scoped State
Signal SHALL expose one internal raw `GET /health` contract whose root reports process liveness and whose scoped
responsibility objects report registry, market-data, queue and evaluation state.

#### Scenario: Signal health is queried
- **WHEN** the internal health handler can construct a valid response
- **THEN** it MUST return HTTP 200 with `status='ok'`, `instance='signal'` and
  `realtimeMode='off'|'shadow'|'on'`
- **AND** it MUST return raw `SignalHealthVo` JSON rather than a business `ApiResponseDto` envelope
- **AND** it MUST expose `registry`, `marketData`, `queue` and `evaluation` objects
- **AND** it MUST NOT expose a root `ready`, `mysqlReady`, `redisReady` or `workerReady` field
- **AND** it MUST NOT expose `/app/hello`, `/live` or `/ready` aliases

#### Scenario: Registry health is reported
- **WHEN** a registry snapshot exists
- **THEN** `registry` MUST expose scoped `ready`, positive process-local `generation`, non-negative
  `definitionCount` and `executionPlanCount`, nullable RFC3339 `lastRefreshAt`, nullable
  `success|failed` `lastRefreshOutcome` and nullable bounded `lastFailureCode`
- **AND** a failed refresh MUST preserve the previous ready snapshot and generation while reporting the failed
  refresh outcome

#### Scenario: Market-data health is reported
- **WHEN** Signal reads its process-local market state
- **THEN** `marketData.state` MUST be `off|ready|error`
- **AND** it MUST expose nullable RFC3339 `lastTriggerTime` and `lastAcceptedAt`
- **AND** it MUST expose non-negative process-local `windowGroupCount`, `rawBarCount` and `derivedBarCount`
- **AND** it MUST expose only a nullable bounded `lastFailureCode`, not raw exception details

#### Scenario: A finalization advances market state
- **WHEN** an accepted sealed or discarded finalization advances a `(securityId,source)` last-finalized cursor
- **THEN** `marketData.lastTriggerTime` MUST become the maximum accepted market time without regressing
- **AND** `marketData.lastAcceptedAt` MUST record the Signal service time of that cursor advance
- **AND** sealed MUST increment `rawBarCount` while discarded MUST NOT
- **AND** discarded MUST increment `derivedBarCount` only when it closes a period that emits a derived bar

#### Scenario: A finalization does not advance market state
- **WHEN** a job is expired, out of order, an identical duplicate, a contract/content conflict, or fails before
  canonical finalization acceptance
- **THEN** it MUST NOT update `marketData.lastTriggerTime`, `lastAcceptedAt`, `rawBarCount` or `derivedBarCount`
- **AND** reaching the queue terminal boundary MUST still update `queue.lastProcessedAt`

#### Scenario: Queue health is reported
- **WHEN** Signal reads its process-local Worker state
- **THEN** `queue.state` MUST be `off|ready|reconnecting|error`
- **AND** it MUST expose `workerRunning`, fixed `concurrency=1`, non-negative process-local `activeCount`,
  `processedCount` and `failedCount`
- **AND** `activeCount` MUST be at most one and `failedCount` MUST be a subset of `processedCount`
- **AND** it MUST expose nullable RFC3339 `lastProcessedAt`, nullable
  `completed|failed|expired_trading_day|out_of_order_trigger_discarded` `lastOutcome` and nullable bounded
  `lastFailureCode`
- **AND** these counters MUST NOT be described as BullMQ waiting or retained-result depth

#### Scenario: A job terminates without evaluation
- **WHEN** a job completes as `expired_trading_day` or `out_of_order_trigger_discarded`
- **THEN** queue health MUST increment `processedCount` without incrementing `failedCount`
- **AND** it MUST record the corresponding bounded queue `lastOutcome`
- **AND** it MUST NOT update `evaluation.lastEvaluatedAt`
- **AND** an identical-content duplicate no-op and an ordinary successful job MUST use queue outcome `completed`

#### Scenario: Evaluation health is reported
- **WHEN** Signal reads its process-local evaluation state
- **THEN** `evaluation.state` MUST be `off|idle|running|error`
- **AND** it MUST expose nullable RFC3339 `lastEvaluatedAt`, non-negative `activeEpisodeCount`, nullable bounded
  `lastFailureCode` and nullable last outcome
- **AND** the last outcome MUST be one of
  `evaluated_matched|evaluated_not_matched|unavailable|failed`

#### Scenario: Health is queried while realtime mode is off
- **WHEN** initial registry loading succeeded with `realtimeMode=off`
- **THEN** `registry.ready` MUST be true
- **AND** marketData, queue and evaluation state MUST each be `off`
- **AND** `queue.workerRunning` MUST be false
- **AND** process-local counters MUST be zero and last time, outcome and failure fields MUST be null

#### Scenario: A runtime component is degraded after startup
- **WHEN** a reader, Worker, job or evaluation failure has been isolated by its owning boundary
- **THEN** root health MUST remain HTTP 200 with `status='ok'`
- **AND** the owning nested object MUST expose its scoped state, outcome or bounded failure code
- **AND** monitoring MUST evaluate nested capability state separately from Compose process health

#### Scenario: Health data is collected
- **WHEN** the health handler builds `SignalHealthVo`
- **THEN** it MUST read only process-owned snapshots, states and counters
- **AND** it MUST NOT query MySQL, send Redis `PING`, call BullMQ `getJobCounts`, scan keys, read Redis memory/AOF
  or modify runtime state
- **AND** waiting/retained queue depth and shared Redis capacity MUST remain owned by the monitoring probe

#### Scenario: Health exposes failure evidence
- **WHEN** any nested component records its last failure
- **THEN** it MUST expose only an owning-component bounded safe failure code
- **AND** it MUST NOT expose SQL, driver messages, stack traces, strategy or security identity, or exception objects

#### Scenario: A manual strategy execution is requested
- **WHEN** an operator wants to execute a strategy outside realtime processing
- **THEN** the request MUST use `POST /v1/strategy-backtests` and the BacktestRun workflow
- **AND** neither `apps/mist` nor `apps/signal` MAY execute a manual live scan
- **AND** the backtest MUST write only BacktestRun and BacktestSignalResult records
- **AND** it MUST NOT write live Signal or AlertEvent records

### Requirement: Signal Registry Shall Use Immutable Generations
`apps/signal` SHALL publish one process-local immutable strategy registry snapshot at a time and SHALL refresh
only the affected definition after an owning database transaction commits.

#### Scenario: Signal starts
- **WHEN** configuration and TypeORM initialization succeed
- **THEN** Signal MUST query all enabled definitions and their current versions once
- **AND** it MUST validate and compile the complete initial registry before publishing generation `1`
- **AND** a legitimate zero-definition result MUST publish an empty registry
- **AND** it MUST NOT periodically poll or reload the full registry for each trigger

#### Scenario: A strategy mutation commits
- **WHEN** enable or disable commits in `apps/mist`
- **THEN** `apps/mist` MUST send `signal.registry.refresh.v1` after that transaction
- **AND** the command MUST contain only a positive safe-integer `strategyDefinitionId`
- **AND** it MUST use `RpcRequestV1<RefreshSignalRegistryCommandV1>` and return
  `RpcResultV1<SignalRegistryRefreshV1, never>`
- **AND** the pattern, command, result and decoder MUST be owned by `libs/signal` and imported by both caller
  and handler from the same domain barrel
- **AND** the response MUST report the id, resulting positive `registryGeneration`, and
  `action=upserted|removed`
- **AND** the RPC wait MUST NOT execute inside the MySQL transaction

#### Scenario: One definition is refreshed
- **WHEN** Signal handles the refresh command
- **THEN** it MUST query only that definition aggregate and current version
- **AND** an enabled valid aggregate MUST be copy-on-write upserted
- **AND** a missing, draft, disabled or archived aggregate MUST be copy-on-write removed
- **AND** concurrent refresh cutovers MUST NOT lose another definition's accepted update
- **AND** the current registry pointer MUST change only after the complete next snapshot is valid

#### Scenario: An operation overlaps registry cutover
- **WHEN** a realtime job has captured the current registry snapshot
- **THEN** it MUST use that snapshot and generation until the operation ends
- **AND** a later operation MUST use the newest published snapshot
- **AND** one operation MUST NOT mix strategy versions from two registry generations

#### Scenario: Registry refresh fails
- **WHEN** the definition query, aggregate validation, RPC handler or cutover fails
- **THEN** Signal MUST retain the prior registry pointer and generation
- **AND** it MUST NOT publish a partial snapshot or automatically retry
- **AND** a restart-time full load MUST remain the only automatic convergence mechanism

#### Scenario: Persistence commits but runtime refresh is not confirmed
- **WHEN** the owning mutation committed but refresh connection, handler or timeout fails
- **THEN** the public mutation MUST use the approved real `503`, `502` or `504` technical response
- **AND** its code MUST respectively be `SIGNAL_SERVICE_UNAVAILABLE`,
  `STRATEGY_RUNTIME_REFRESH_FAILED` or `STRATEGY_RUNTIME_REFRESH_TIMEOUT`
- **AND** typed data MUST contain only
  `{strategyDefinitionId,persistence:'committed',runtimeRefresh:'unknown'}`
- **AND** the response MUST NOT claim that the database mutation rolled back
- **AND** neither application MAY automatically retry or introduce periodic reconciliation

#### Scenario: Registry generation is observed
- **WHEN** diagnostics report `registryGeneration`
- **THEN** it MUST be a process-local positive safe integer beginning at `1`
- **AND** it MUST reset after process restart
- **AND** it MUST NOT be persisted or used for business idempotency

### Requirement: Signal Runtime Execution Shall Be Deterministic And Bounded
V1 SHALL use one realtime worker execution slot without adding a manual strategy-execution surface or
configurable concurrency surface.

#### Scenario: Realtime jobs are consumed
- **WHEN** the `strategy-trigger` worker is enabled
- **THEN** its code-defined BullMQ concurrency MUST be exactly `1`
- **AND** the runtime MUST NOT add a concurrency environment variable, per-symbol keyed queue, worker-thread
  pool, or second consumer for the same queue
- **AND** at most one `candle_finalized` job MAY be active in this Signal process

#### Scenario: Queue delivery is not chronological
- **WHEN** live enqueue or startup compensation delivers jobs in an order different from canonical K time
- **THEN** single-worker delivery order MUST NOT redefine market timestamp order
- **AND** a trigger older than the last finalized 1m trigger for the same `(securityId,source)` MUST complete with
  bounded outcome `out_of_order_trigger_discarded`
- **AND** that outcome MUST NOT read or insert the older bar, advance the period builder, run analysis/evaluation,
  mutate projector/episode, or create Signal/AlertEvent
- **AND** an equal canonical identity, outcome and content MUST remain a duplicate no-op while a
  sealed/discarded outcome conflict or sealed canonical-content conflict MUST fail at the worker boundary

#### Scenario: Hydration prepares one current trigger
- **WHEN** an empty or expanded window is hydrated at `triggerTime=t`
- **THEN** current-day preparation MUST consume only sealed 1m bars earlier than `t`
- **AND** the observation at `t` MUST be resolved and processed exactly once after hydration
- **AND** no later Redis bar MAY influence the evaluation at `t`

#### Scenario: Evaluation fails after the current finalization is accepted
- **WHEN** the current finalization has advanced shared market state and a later plan stage fails
- **THEN** the job MUST fail while the accepted bar or discarded slot and last-finalized trigger cursor remain advanced
- **AND** the runtime MUST NOT rewind in-memory market state, automatically retry the failed trigger or describe
  the state transition as a database rollback
- **AND** a subsequent newer trigger MAY continue under the ordinary worker error-isolation contract

#### Scenario: Eligible execution plans are evaluated
- **WHEN** a realtime job captures one registry snapshot and builds its eligible plans
- **THEN** plans MUST execute in stable `definitionId`, `versionId`, then numeric period order
- **AND** numeric period order MUST be `1m`, `5m`, `15m`, `30m`, then `60m`
- **AND** object iteration, registration, or asynchronous completion order MUST NOT determine evaluation order

#### Scenario: One ordered execution plan throws
- **WHEN** analysis, evaluator, or persistence raises a non-target exception
- **THEN** the current job MUST fail fast without starting later plans in the stable order
- **AND** previously committed short transactions MUST remain committed
- **AND** the complete job MUST NOT use one long cross-plan transaction

#### Scenario: Manual execution capability is inspected
- **WHEN** Signal RPC patterns, queue jobs, configuration, health, metrics and public contracts are reviewed
- **THEN** no manual strategy-execution pattern, job, timeout, admission slot, summary or error union MAY exist
- **AND** `signal.registry.refresh.v1` MUST remain control plane only and MUST NOT read K, run the evaluator or
  write Signal/AlertEvent

### Requirement: Realtime Modes Shall Be Promotion Gates
Realtime strategy mode SHALL default to off; shadow SHALL execute evaluation with zero strategy-table writes;
on SHALL require accepted prerequisites, capacity evidence and supported-session HIL.

#### Scenario: Implementation starts before production HIL is complete
- **WHEN** candle automation, strict contracts, captured-snapshot replay and the shadow foundation are accepted
- **THEN** realtime trigger, worker, context, evaluator, episode and transaction code MAY be implemented and
  validated in `off` or `shadow`
- **AND** incomplete trading-session candle HIL, timestamp/quantity seam evidence or capacity review MUST NOT be
  reported as complete merely because offline automation passes
- **AND** those missing production proofs MUST continue to block promotion to `on`

#### Scenario: A prerequisite change lacks accepted evidence
- **WHEN** strategy mode promotion is requested
- **THEN** mode MUST NOT be promoted to on

#### Scenario: Shadow capacity evidence is reviewed
- **WHEN** listener groups have stabilized during the accepted shadow session
- **THEN** continued unbounded bar or heap growth, failed consumer/day cleanup or a memory-pressure restart MUST
  block promotion to on
- **AND** successful evidence MUST NOT be described as a configured aggregate memory budget or numeric bar cap

### Requirement: Runtime Details Shall Be Approved Phase By Phase
Trigger transport, failure recovery, worker capacity, episode identity, persistence identity, deployment and
HIL details SHALL each be reviewed before their implementation phase.

#### Scenario: A runtime phase reaches an open decision
- **WHEN** the design does not contain an accepted value or behavior
- **THEN** the phase MUST pause before code changes

### Requirement: Consumer Session SHALL Align With The 242-Bucket Producer Universe

The Signal runtime `sessionPosition` SHALL accept triggerTimes in `[09:30, 11:31) ∪ [13:00, 15:01)`
Asia/Shanghai (half-open, matching the producer), so that the 11:30 and 15:00 session-terminal buckets are
consumed normally. TriggerTimes at or beyond 11:31 / 15:01 SHALL be rejected with `RangeError`, preserving
defense against producer-impossible garbage triggers (lunch break, deep post-close, pre-open).

The previous half-open session `[09:30, 11:30) ∪ [13:00, 15:00)` (240 buckets) caused the producer-legal
11:30/15:00 terminal triggers to throw `RangeError: finalized strategy trigger is outside A-share sessions`,
classifying legal input as garbage and filling the failed zset.

#### Scenario: A 15:00 terminal trigger is consumed normally

- **WHEN** a sealed `candle_finalized` trigger with `triggerTime = 15:00:00` Asia/Shanghai is processed
- **THEN** the job MUST NOT fail with `outside A-share sessions`
- **AND** the sealed 1m bar MUST enter the shared window
- **AND** the finalization cursor MUST advance
- **AND** in on-mode, evaluation and persistence MUST run as for any in-session trigger

#### Scenario: An 11:30 terminal trigger is consumed normally

- **WHEN** a sealed `candle_finalized` trigger with `triggerTime = 11:30:00` Asia/Shanghai is processed
- **THEN** the job MUST complete normally
- **AND** the sealed bar MUST enter the 1m window
- **AND** the cursor MUST advance

#### Scenario: A discarded terminal trigger advances the cursor without evaluation

- **WHEN** a discarded `candle_finalized` trigger with `triggerTime = 15:00:00` is processed (terminal bucket
  had no snapshot)
- **THEN** the job MUST complete normally
- **AND** the cursor MUST advance
- **AND** no evaluation MUST run (no bar to evaluate)

#### Scenario: A garbage trigger beyond 15:01 still fails

- **WHEN** a `candle_finalized` trigger with `triggerTime = 15:30:00` Asia/Shanghai is processed
- **THEN** the job MUST fail with `RangeError: finalized strategy trigger is outside A-share sessions`
- **AND** the failure SHALL NOT be reclassified as a normal completion

#### Scenario: A lunch-break trigger still fails

- **WHEN** a `candle_finalized` trigger with `triggerTime = 12:00:00` Asia/Shanghai is processed
- **THEN** the job MUST fail with `RangeError: finalized strategy trigger is outside A-share sessions`

#### Scenario: A pre-open trigger still fails

- **WHEN** a `candle_finalized` trigger with `triggerTime = 09:00:00` Asia/Shanghai is processed
- **THEN** the job MUST fail with `RangeError: finalized strategy trigger is outside A-share sessions`

### Requirement: Realtime Window Loading SHALL Tolerate Terminal-Minute Sealed Bars

The Signal strategy-market-data adapter SHALL align its own session boundary with the 242-bucket
producer universe when deriving higher-period bars from current-day sealed 1m bars, so that a sealed
11:30/15:00 terminal bar (including legacy dead-time bars still present in Redis from before this change)
does not fail the whole evaluation window load.

#### Scenario: A sealed 15:00 bar is derived into the current-day window

- **WHEN** `loadCurrentDayBars` loads a sealed 1m bar with `timestamp = 15:00:00` from Redis
- **THEN** the bar MUST be grouped into an afternoon derived slot
- **AND** the window load MUST NOT throw `realtime K is outside session`

#### Scenario: A sealed 15:02 legacy dead bar is tolerated during window load

- **WHEN** `loadCurrentDayBars` loads a legacy sealed 1m bar with `timestamp = 15:02:00` still present in
  Redis from a previous trading day
- **THEN** the window load MUST NOT fail the whole evaluation
- **AND** the bar SHALL be grouped into the terminal afternoon slot without throwing
