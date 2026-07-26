## ADDED Requirements

### Requirement: Realtime market product path is independently observable

Monitoring SHALL cover Redis availability, closed-candle commits, Node open-state bounds, due/finalizer backlog, source-specific grace, discard/recovery, restart loss, local cleanup, resident capacity, AOF write amplification/rewrite, and disk headroom separately from transport owner and freshness.

#### Scenario: Redis fails while transport is healthy

- **WHEN** owner, subscriptions, and accepted snapshots remain healthy but Redis operations fail
- **THEN** monitoring MUST report a product-path failure
- **AND** it MUST NOT classify transport as disconnected

#### Scenario: Redis command fails fast

- **WHEN** Redis is disconnected or a product command exceeds its timeout
- **THEN** monitoring MUST expose operation, timeout/retry outcome, affected bucket count, and local-cleanup backlog
- **AND** reconnect MUST NOT report replay or recovery of skipped realtime candles

#### Scenario: Finalizer backlog exceeds threshold

- **WHEN** due age or backlog exceeds threshold
- **THEN** monitoring MUST alert with source and market dimensions
- **AND** a structured log MUST identify affected security/buckets without using symbol as a metric label

#### Scenario: Adjacent Node open buckets overlap normally

- **WHEN** previous grace-waiting and current buckets coexist within expected bounds
- **THEN** monitoring MUST record open-count distribution, normal-overlap security count, and oldest age
- **AND** it MUST NOT alert or degrade product health

#### Scenario: Node open state reaches hard limit

- **WHEN** per-symbol or global open/pending state reaches its hard limit
- **THEN** monitoring MUST report a product capacity failure
- **AND** it MUST confirm transport/latest continues and no open state was silently evicted

### Requirement: Grace calibration and late frames are observable

Monitoring SHALL expose source/session arrival distribution and calibrated-grace misses.

#### Scenario: Shadow calibration is running

- **WHEN** TDX or QMT frames are processed in shadow
- **THEN** monitoring MUST expose `arrivalOffsetMs` P50/P95/P99/P99.9/max by source, market, and session
- **AND** candidate grace late-frame and affected-bucket counts MUST be exposed
- **AND** symbol and bucket MUST NOT be long-lived metric labels

#### Scenario: Frames exceed selected grace

- **WHEN** frames arrive after cutoff or sealing
- **THEN** `late_after_grace` and `late_after_finalize` MUST be reported separately
- **AND** structured logs MUST contain accepted time, cutoff, finalization time, queue delay, symbol, epoch, and sequence
- **AND** repeated threshold breaches MUST degrade product health without changing transport health

### Requirement: Redis resident capacity is measured and projected

Monitoring SHALL measure real compact record sizes, subscribed-security scale, current-day resident state, and `dayEnd+72h` projection rather than relying on a fixed 414-byte assumption.

#### Scenario: Closed records are written

- **WHEN** compact closing snapshots and closed candles are persisted
- **THEN** monitoring MUST expose P50/P95/P99/max bytes for both record types
- **AND** it MUST expose Redis `MEMORY USAGE` samples, `used_memory`, `used_memory_rss`, and fragmentation
- **AND** current-day and retention-window projected bytes MUST use measured bucket counts and subscribed-security counts

#### Scenario: Record exceeds byte limit

- **WHEN** a closing snapshot or closed record exceeds its configured hard limit
- **THEN** monitoring MUST alert and record schema/source/market/measured bytes
- **AND** the complete record or native payload MUST NOT be logged

#### Scenario: Subscription expansion exceeds accepted capacity

- **WHEN** desired subscribed securities exceed the capacity-evidence ceiling
- **THEN** product health MUST become degraded
- **AND** promotion or expansion MUST be blocked
- **AND** transport subscriptions outside the accepted product ceiling MUST NOT silently enter the candle path

### Requirement: Redis AOF write amplification and disk headroom are observable

Monitoring SHALL prove that accepted snapshot rate does not create per-frame full-record AOF writes and SHALL monitor AOF steady state and rewrite peaks.

#### Scenario: Shadow observes Redis writes

- **WHEN** market frames and minute finalizations are processed
- **THEN** application metrics MUST expose due-registration and closed/finalization transaction rates
- **AND** AOF current/base bytes and byte-growth rate MUST be recorded
- **AND** full-record Redis write rate MUST scale with bucket creation/finalization rather than accepted-frame rate

#### Scenario: AOF rewrite runs

- **WHEN** Redis starts or completes AOF rewrite
- **THEN** monitoring MUST expose in-progress state, duration, last status, base/current bytes, peak bytes, and disk free space
- **AND** rewrite failure or sustained lag MUST degrade product health and alert

#### Scenario: Memory, AOF, or disk budget is approached

- **WHEN** warning thresholds for Redis memory, AOF size/growth, rewrite peak projection, Redis volume usage, or host disk free are crossed
- **THEN** monitoring MUST alert with remaining headroom and projected exhaustion time
- **AND** crossing a hard threshold MUST block `on` promotion or subscription expansion
- **AND** transport/latest processing MUST continue

### Requirement: Initialized realtime source identity is observable

Monitoring SHALL expose Security/source initialization audit failures, effective-source counts, and non-effective frames separately from transport health.

#### Scenario: Effective source mapping is healthy

- **WHEN** a Security effective source is initialized
- **THEN** monitoring MUST record one effective subscription
- **AND** security symbol MUST NOT be a long-lived metric label

#### Scenario: Initialization or startup audit is rejected

- **WHEN** provider identity is ambiguous or TDX/QMT priorities tie
- **THEN** product health MUST become degraded and alert
- **AND** a structured log MUST contain canonical identity, candidate sources/priorities, provider symbols, phase, and sanitized error

#### Scenario: Non-effective source reaches product path

- **WHEN** a non-effective frame is detected
- **THEN** structured logs MUST record initialized and rejected sources
- **AND** no candle state may be created from that frame

#### Scenario: Unsupported effective-source change is rejected

- **WHEN** a mutation attempts to change or remove an initialized effective `source + providerSymbol`
- **THEN** monitoring MUST expose the bounded rejection reason `EFFECTIVE_SOURCE_CHANGE_UNSUPPORTED`
- **AND** it MUST NOT report a source transition, unsubscribe/subscribe result or discarded-open count
- **AND** security identity MUST remain in structured diagnostics rather than long-lived metric labels

### Requirement: Discarded and restart-lost candles are observable

Monitoring SHALL expose discarded total, last discard time, consecutive count, local-cleanup backlog, and later successful processing with stable low-cardinality reasons; it SHALL NOT maintain a persistent minute-continuity product state.

#### Scenario: Candle is discarded

- **WHEN** finalizer discards an invalid bucket
- **THEN** metrics MUST identify source, market, and reason
- **AND** a versioned structured log MUST include canonical security, provider symbol, bucket/session, event/captured times, epoch/sequence, observed OHLC, cumulative counters/baselines, queue/Redis context, recovery source, consecutive count, trace, and sanitized error
- **AND** complete native objects, Redis values, credentials, and tokens MUST NOT be logged

#### Scenario: Backend restart loses open state

- **WHEN** a due bucket has no complete Node open state after restart
- **THEN** monitoring MUST increment reason `backend_restart_open_state_lost`
- **AND** discarded bucket identity MUST be visible in structured diagnostics
- **AND** no synthesized closed candle may be reported

#### Scenario: Candle processing recovers

- **WHEN** a later bucket re-establishes trustworthy baseline after discards
- **THEN** monitoring MUST update later-success and recovery count
- **AND** a recovery log MUST link prior reason, recovered bucket, baseline source, and consecutive count

#### Scenario: Due registration failed

- **WHEN** a bucket is marked `redis_due_registration_failed`
- **THEN** monitoring MUST expose the local sweep deadline, cleanup outcome, and remaining open-state count
- **AND** hard-horizon cleanup MUST be alertable without claiming a recoverable missing interval

#### Scenario: Structured log delivery fails

- **WHEN** log sink rejects an invalidation/discard/recovery log
- **THEN** candle safety behavior MUST remain fail closed
- **AND** transport MUST continue
- **AND** a low-cardinality log-failure metric MUST be attempted
