## ADDED Requirements

### Requirement: Accepted snapshots and open candles remain bounded in backend memory

Mist backend SHALL retain only the latest transport-accepted full snapshot and a bounded set of open candle states for each canonical `securityId`, and SHALL NOT create Redis snapshot, latest-snapshot, timepoint-history, or mutable-candle recovery keys.

#### Scenario: Snapshot has a trustworthy event time

- **WHEN** an accepted snapshot contains valid session `eventTime`
- **THEN** it MUST directly replace the previous in-memory latest object
- **AND** it MAY update the matching in-memory open candle
- **AND** no full snapshot timepoint series may accumulate in Node.js or Redis
- **AND** the complete provider native object MUST remain only in the bounded latest object

#### Scenario: Snapshot has no trustworthy event time

- **WHEN** an accepted snapshot has null or invalid `eventTime`
- **THEN** the in-memory latest object MUST still be replaced
- **AND** the snapshot MUST NOT update candle state

#### Scenario: Grace overlaps adjacent buckets

- **WHEN** the previous bucket is waiting for cutoff while the next bucket starts
- **THEN** the two adjacent in-memory candle states MAY coexist
- **AND** this expected overlap MUST NOT invalidate either candle or degrade product health
- **AND** expected and hard open-bucket limits MUST remain configured and observable

#### Scenario: Open-state capacity is exhausted

- **WHEN** per-symbol or global open/pending capacity reaches its hard limit
- **THEN** transport and latest processing MUST continue
- **AND** existing open states MUST NOT be silently evicted or merged
- **AND** the affected candle MUST be marked invalid with reason `queue_overflow`

### Requirement: One product writer serializes each symbol in process

The first production version SHALL run one `mist-backend` realtime product writer and SHALL serialize snapshot updates and candle finalization through one in-process queue keyed by canonical `securityId`.

#### Scenario: Tasks target the same symbol

- **WHEN** accepted snapshots or a due finalizer target the same key
- **THEN** they MUST execute strictly in queue order
- **AND** the finalizer MUST NOT bypass the keyed queue

#### Scenario: Snapshot is accepted near cutoff

- **WHEN** common ingress accepts a snapshot
- **THEN** it MUST record `acceptedAt` and submit the product task before asynchronous product I/O
- **AND** `acceptedAt <= bucketEnd + sourceGrace` MUST retain queue order ahead of a later finalizer
- **AND** `acceptedAt > bucketEnd + sourceGrace` MUST record `late_after_grace` without mutating the candle

#### Scenario: Tasks target different symbols

- **WHEN** product tasks have different queue keys
- **THEN** they MAY execute concurrently while waiting on Redis I/O
- **AND** no worker thread or third-party in-process queue library is required

#### Scenario: A queued task belongs to an old epoch

- **WHEN** a task reaches queue head after its stream epoch is no longer current
- **THEN** it MUST be discarded before changing candle state

### Requirement: Redis stores only due, closed, watermark, and manifest market state

Mist SHALL persist current-day candle state under day/source/security partitions without a Redis mutable open-candle Hash.

#### Scenario: A new in-memory bucket is created

- **WHEN** the first valid snapshot starts a bucket
- **THEN** Mist MUST add its cutoff to the Redis due index once
- **AND** it MUST establish manifest and the Node-calculated relative TTL targeting `dayEnd + 72h`
- **AND** later snapshots in that bucket MUST NOT rewrite a full mutable record to Redis or AOF

#### Scenario: A valid candle is finalized

- **WHEN** a valid in-memory candle reaches its calibrated cutoff
- **THEN** one Redis `MULTI/EXEC` MUST write its closed Hash field, advance watermark, remove due state, and refresh manifest/TTL
- **AND** the closed field MUST be written only once per successful finalization attempt
- **AND** sealing MUST NOT wait for strategy, MySQL, BullMQ, or another business consumer

#### Scenario: Finalization is retried

- **WHEN** recovery retries a bucket already covered by the sealing watermark
- **THEN** it MUST NOT reopen or duplicate the closed candle
- **AND** direct `HSET` of the same closed field MAY be used for idempotent retry
- **AND** no content hash compare or Redis read-before-write is required

#### Scenario: Redis outcome is uncertain

- **WHEN** the client cannot determine whether finalization committed
- **THEN** further product mutations for that key MUST pause
- **AND** closed/watermark/due state MUST be reloaded before resuming

### Requirement: Redis product I/O fails quickly without replaying stale commands

The realtime Redis client SHALL fail product commands within bounded time and SHALL NOT replay commands queued while disconnected.

#### Scenario: Redis is disconnected

- **WHEN** a due-registration or finalization command is issued while Redis is unavailable
- **THEN** `enableOfflineQueue` MUST be disabled
- **AND** `maxRetriesPerRequest`, connection timeout, and command timeout MUST be explicitly bounded
- **AND** the product Promise task MUST settle without blocking later queue cleanup indefinitely
- **AND** the failed candle MUST NOT be backfilled when Redis reconnects

### Requirement: Node open state is reclaimed independently of Redis due registration

Every in-memory open bucket SHALL have a local cutoff and hard cleanup horizon even when its Redis due registration fails.

#### Scenario: Due registration fails or times out

- **WHEN** a new bucket cannot confirm its due/manifest registration
- **THEN** the bucket MUST be invalid with reason `redis_due_registration_failed`
- **AND** a local Node sweep MUST enqueue its discard/cleanup through the same `securityId` queue
- **AND** Node open state MUST be released no later than the configured hard cleanup horizon
- **AND** Redis recovery MUST NOT cause that candle to be reconstructed or backfilled

#### Scenario: Redis is available during local cleanup

- **WHEN** the local sweep handles an invalid bucket after Redis has recovered
- **THEN** it MAY idempotently remove residual due state and advance a discarded watermark
- **AND** cleanup failure MUST NOT retain Node open state beyond the hard limit

### Requirement: Backend restart discards incomplete open buckets

Open candle OHLC SHALL NOT be reconstructed from incomplete checkpoints after backend restart.

#### Scenario: Backend restarts with an unsealed due bucket

- **WHEN** Redis due/watermark state identifies a bucket but no complete in-memory open state exists
- **THEN** that bucket MUST be finalized as `discarded` with reason `backend_restart_open_state_lost`
- **AND** no closed candle may be synthesized
- **AND** monitoring MUST expose the discard and affected bucket identity

#### Scenario: Processing resumes after restart

- **WHEN** a new valid snapshot arrives after restart
- **THEN** the latest closed candle or watermark closing cumulative totals MAY restore volume/amount baseline
- **AND** a current bucket lacking complete price or baseline continuity MUST be discarded
- **AND** later buckets MAY recover normally once a trustworthy baseline exists

### Requirement: Closed candles contain compact canonical closing snapshots

Mist SHALL store one compact versioned closed candle per bucket without copying the complete provider-native object or order book.

#### Scenario: Valid candle is closed

- **WHEN** finalizer persists a valid candle
- **THEN** its record MUST include source/security identity, bucket bounds, provisional OHLC, volume/amount, cumulative closing totals, quality, and compact `closingSnapshot`
- **AND** `closingSnapshot` MUST include only allowlisted canonical fields needed by product display or future consumers
- **AND** it MUST include stable event/captured time, price, cumulative volume/amount, quality, epoch, and sequence when available
- **AND** it MUST NOT contain the complete native object, order book, a Redis snapshot key, or a Node object reference

#### Scenario: Closing record exceeds its limit

- **WHEN** serialized closed record or `closingSnapshot` exceeds its configured byte limit
- **THEN** the candle MUST fail closed rather than truncate silently
- **AND** a structured diagnostic MUST report the schema and measured bytes without logging the payload

### Requirement: Productization mode isolates rollout stages

Mist SHALL expose `REALTIME_PRODUCTIZATION_MODE=off|shadow|on` independently from TDX/QMT transport modes.

#### Scenario: Mode is off

- **WHEN** mode is `off`
- **THEN** accepted frames MUST remain memory-only

#### Scenario: Mode is shadow

- **WHEN** mode is `shadow`
- **THEN** Node aggregation and Redis due/closed/watermark persistence MUST run
- **AND** current-day product queries MUST remain disabled

#### Scenario: Mode is on

- **WHEN** mode is `on`
- **THEN** Redis-backed current-day queries MUST be enabled
- **AND** no strategy evaluation or notification path may be enabled by this mode

### Requirement: One-minute candles are session-aware provisional data

Mist SHALL maintain one effective-source candle state for each `tradingDay + securityId`, with source and provider symbol retained as partition metadata, from canonical event time, observed price, cumulative volume, and cumulative amount.

#### Scenario: Previous cumulative baseline is available

- **WHEN** latest closed/watermark state contains closing cumulative volume and amount
- **THEN** a new bucket MAY use those values as its baseline

#### Scenario: Baseline is unavailable mid-session

- **WHEN** no trustworthy closing totals exist during an active session
- **THEN** the current bucket MUST be invalid with reason `baseline_unavailable`
- **AND** its last observed cumulative values MAY establish the next bucket baseline

#### Scenario: Duplicate or out-of-order event arrives

- **WHEN** `eventTime` is less than or equal to the last event applied
- **THEN** memory latest MAY be overwritten
- **AND** candle OHLC, volume, amount, and sealing state MUST NOT regress
- **AND** the duplicate or late event MUST be counted diagnostically

#### Scenario: Cumulative counters retreat

- **WHEN** provider cumulative volume or amount is lower than baseline
- **THEN** no negative delta may be produced
- **AND** the bucket MUST be discarded with reason `counter_reset`
- **AND** the lower cumulative value MAY establish the next baseline

#### Scenario: Valid sampled candle closes

- **WHEN** a bucket has valid observed prices, ordering, baseline, session membership, and continuity
- **THEN** `open` MUST be first observed price, `high/low` observed extrema, and `close` last observed price
- **AND** quality MUST be `provisional`
- **AND** ordinary sampling gaps MUST NOT alone invalidate it

### Requirement: Structurally abnormal candles are discarded

Mist SHALL discard an entire candle when structural integrity is unsafe.

#### Scenario: Bucket becomes invalid

- **WHEN** it detects invalid time/price/OHLC, session violation, unavailable baseline, counter reset, queue overflow, epoch discontinuity, or backend restart state loss
- **THEN** finalization MUST NOT write a closed field
- **AND** it MUST advance the watermark with outcome `discarded` and remove due state
- **AND** later buckets MUST remain processable

#### Scenario: Redis is unavailable while a bucket is discarded

- **WHEN** due registration or discarded-watermark persistence fails because Redis is unavailable
- **THEN** finalization MUST NOT write a closed field
- **AND** local Node cleanup MUST still release the open state within its hard horizon
- **AND** the system MUST record `redis_due_registration_failed` or `redis_finalization_failed`
- **AND** it MUST NOT claim that a discarded watermark was persisted

### Requirement: Initialized effective-source identity is immutable at runtime

Mist SHALL retain one initialized effective `source + providerSymbol` identity for each realtime-enabled security and SHALL NOT implement an automatic runtime provider transition in this change.

#### Scenario: Effective-source change is requested

- **WHEN** a mutation would change or remove an initialized security's effective `source + providerSymbol`
- **THEN** the mutation MUST fail with `EFFECTIVE_SOURCE_CHANGE_UNSUPPORTED` before product state changes
- **AND** existing latest, open candle, cumulative baseline and closed source-specific Redis candles MUST remain unchanged
- **AND** no provider subscription control MUST be emitted

### Requirement: Candle closure uses calibrated source-specific grace

Mist SHALL finalize due candles without waiting for a later tick and SHALL calibrate TDX/QMT grace in shadow.

#### Scenario: Shadow calibration runs

- **WHEN** accepted frames are processed in shadow
- **THEN** Mist MUST calculate `arrivalOffsetMs=acceptedAt-bucketEnd`
- **AND** measure P50/P95/P99/P99.9/max and candidate miss rates for configured grace candidates
- **AND** aggregate only by bounded source, market, and session dimensions

#### Scenario: Product mode is promoted

- **WHEN** an operator requests mode `on`
- **THEN** every enabled source MUST have at least three complete supported trading days of accepted evidence
- **AND** explicit source grace and calibration identifier MUST be configured
- **AND** startup MUST fail closed when evidence/configuration is absent

#### Scenario: Ordinary minute becomes due

- **WHEN** close plus calibrated grace is reached
- **THEN** finalizer MUST close or discard it even without a later tick

#### Scenario: Final market bucket is due

- **WHEN** an A-share final minute reaches 15:02 or an HK closing-auction final minute reaches 16:10
- **THEN** finalizer MUST seal the eligible candle

#### Scenario: Frame arrives after finalization

- **WHEN** an old-bucket frame arrives after sealing
- **THEN** it MUST NOT reopen or mutate the closed candle
- **AND** `late_after_finalize` monitoring and structured diagnostics MUST be recorded

### Requirement: Redis capacity and write amplification are bounded

Mist SHALL enforce explicit per-record, subscription, resident-memory, AOF, rewrite, disk, and retention capacity budgets before product mode is promoted.

#### Scenario: Capacity projection is calculated

- **WHEN** shadow observes real TDX/QMT records and subscription counts
- **THEN** it MUST calculate current-day and `dayEnd+72h` projected resident bytes
- **AND** it MUST calculate Redis command rate, AOF byte rate, rewrite amplification, rewrite peak, and disk headroom
- **AND** projections MUST use measured P50/P95/P99/max record bytes rather than the earlier 414-byte assumption

#### Scenario: Capacity budget is exceeded

- **WHEN** record size, subscribed-security count, projected retention bytes, Redis memory, AOF bytes/write rate, rewrite lag/failure, or disk usage exceeds its configured threshold
- **THEN** product health MUST become degraded and alert
- **AND** promotion or subscription expansion MUST be blocked at the hard threshold
- **AND** transport/latest processing MUST continue

### Requirement: Current-day Redis data has bounded lifetime

All due, closed candle, sealing watermark, baseline checkpoint, and manifest keys SHALL expire no later than trading-day boundary plus 72 hours.

#### Scenario: Natural day rolls over

- **WHEN** `Asia/Shanghai` enters a new natural day
- **THEN** old-day keys MUST become invisible to product queries immediately
- **AND** correctness MUST NOT depend on physical deletion completing

### Requirement: Node Clock owns product processing time

Mist SHALL use provider `eventTime` only for market-data identity and one injectable Node `Clock` for product processing time; MySQL and Redis server clocks SHALL NOT participate in candle, schedule, finalizer, or cleanup decisions.

#### Scenario: A frame crosses a Node receive-time minute boundary

- **WHEN** a provider event belongs to one minute by canonical `eventTime` but reaches Node in the next minute
- **THEN** candle day/session/bucket identity MUST still use provider `eventTime`
- **AND** Node MUST record its own `acceptedAt` without replacing `eventTime` or datasource `capturedAt`

#### Scenario: Due candles and TTL are evaluated

- **WHEN** Mist scans a due ZSET, finalizes a candle, routes the current natural day, or refreshes TTL
- **THEN** it MUST use the shared Node `Clock`
- **AND** Redis due queries MUST use Node time as their score upper bound
- **AND** Node MUST calculate remaining lifetime to `dayEnd + 72h` and apply a relative `EXPIRE` or `PEXPIRE`
- **AND** Redis `TIME` and MySQL `NOW()` MUST NOT control product behavior

#### Scenario: Time-dependent logic is tested

- **WHEN** candle, finalizer, rollover, TTL, or schedule behavior is under test
- **THEN** the test MUST inject a fixed or fake Node `Clock`
- **AND** core time-dependent services MUST NOT depend on scattered non-replaceable `Date.now()` calls
