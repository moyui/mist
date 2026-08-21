# current-day-realtime-candle-foundation Specification

## Purpose
Define the bounded one-minute realtime candle foundation: per-(securityId,source) aggregation, exact Decimal8 quantity handling, fail-closed finalization, market-sealing independence from downstream consumers, approved capacity limits and current-day-only Redis state.
## Requirements
### Requirement: Accepted Snapshots Shall Produce Bounded One-Minute Candle State
Mist SHALL aggregate accepted canonical realtime snapshots by `(securityId,source)` into bounded one-minute
open candle state and SHALL serialize snapshot, due and finalizer mutations for the same market series.

#### Scenario: An accepted snapshot belongs to an active A-share bucket
- **WHEN** the candle product mode permits aggregation
- **THEN** the snapshot MUST update only its canonical `(securityId,source)` market-series open state
- **AND** the candle identity MUST be `(securityId,source,bucketStartMs)`
- **AND** Node latest/open state, quantity baselines, due, watermark, manifest and Redis keys MUST retain that
  exact source dimension

#### Scenario: A security changes realtime source during the same trading day
- **WHEN** the accepted allowlist moves a security from TDX to QMT or from QMT to TDX
- **THEN** the new source MUST use an independent market-series state and candle identity
- **AND** it MUST NOT inherit the prior source's open candle, cumulative baseline, due, watermark or terminal row

#### Scenario: Provider identity is mapped
- **WHEN** an adapter supplies `providerSymbol` for a canonical security and source
- **THEN** `providerSymbol` MUST remain provenance or bounded diagnostics only
- **AND** it MUST NOT participate in Node/Redis candle, baseline, due, watermark or manifest identity
- **AND** it MUST NOT directly invoke strategy, MySQL or notification behavior

#### Scenario: TDX supplies capture-time-backed canonical event time
- **WHEN** an accepted TDX snapshot maps validated datasource `capturedAt` to canonical `eventTime`
- **THEN** candle bucketing MUST use that canonical instant without inspecting native time aliases
- **AND** the sealed closing snapshot MUST retain both `eventTime` and `capturedAt` so the source remains auditable
- **AND** QMT candle bucketing MUST continue to require its native-time-derived canonical `eventTime`

### Requirement: Quantity Values Shall Remain Exact Through Candle Aggregation
Realtime cumulative volume and amount, baselines, deltas and sealed values SHALL use canonical decimal strings
or `null`; their A-share units SHALL remain shares and CNY yuan from accepted snapshot through sealed candle,
and arithmetic MUST NOT pass through JavaScript `number`.

#### Scenario: A cumulative quantity changes
- **WHEN** the aggregator computes a delta or detects a counter reset
- **THEN** it MUST parse and calculate through the shared `Decimal8` capability backed by scale-eight native
  bigint
- **AND** it MUST use only compare, add or subtract and MUST range-check every result before formatting
- **AND** missing or invalid values MUST NOT be replaced with zero

#### Scenario: One cumulative quantity is absent after a trusted same-day baseline
- **WHEN** an accepted snapshot has `null` for cumulative volume or amount and that field already has a trusted
  baseline in the same trading day
- **THEN** the aggregator MUST retain that field's prior cumulative counter as unchanged
- **AND** the snapshot MUST contribute no additional delta for that field without converting the raw `null` to
  a decimal value
- **AND** volume and amount MUST be handled independently

#### Scenario: One cumulative quantity has no trusted same-day baseline
- **WHEN** an accepted snapshot has `null` for a cumulative field before that field has established a trusted
  baseline in the trading day
- **THEN** that field MUST remain unavailable rather than start from zero or inherit a prior-day counter
- **AND** valid required OHLC evidence MAY still produce a sealed candle whose corresponding quantity is `null`
- **AND** the other quantity field MUST follow its own independent evidence

#### Scenario: A cumulative counter is explicitly unchanged
- **WHEN** a non-null cumulative value equals its trusted same-day baseline
- **THEN** the exact delta contribution MUST be canonical zero
- **AND** a later greater value MUST be compared with the retained baseline through `Decimal8`

#### Scenario: A sealed or historical bar reaches strategy context
- **WHEN** its `volume` or `amount` is `null`
- **THEN** the raw bar MUST continue to preserve that unavailable interval quantity
- **AND** candle aggregation MUST NOT copy a prior bar's interval value
- **AND** a downstream strategy projection MAY apply its separately specified same-trading-day forward-fill policy
  without mutating the raw bar or calling the effective value an unchanged cumulative counter

#### Scenario: A canonical quantity has already been unit-normalized
- **WHEN** an accepted A-share snapshot enters candle aggregation
- **THEN** the aggregator MUST treat cumulative volume as shares and cumulative amount as CNY yuan
- **AND** it MUST NOT repeat provider unit scaling or reinterpret units from `source`

### Requirement: Candle Finalization Shall Fail Closed
At the approved grace cutoff, Mist SHALL freeze the exact candle candidate. A successful finalization SHALL
atomically record either a valid sealed candle or an explicit market-evidence discarded watermark; an
infrastructure failure SHALL remain a diagnosed gap and SHALL NOT invent missing OHLC, quantity or discard
evidence.

#### Scenario: V1 timing limits are loaded
- **WHEN** realtime candle productization starts
- **THEN** `REALTIME_CANDLE_GRACE_MS` MUST default to `5000` and accept only integer values from `1000` through
  `30000`
- **AND** TDX and QMT MUST use that same configured grace in V1
- **AND** the due scanner MUST run at the fixed `1000ms` interval
- **AND** the hard horizon MUST be `bucketEndMs + 60000ms`

#### Scenario: An active listener enters a complete minute bucket
- **WHEN** `(securityId,source)` belongs to the active listener inventory at the bucket start
- **THEN** the candle foundation MUST register that bucket for finalization at `bucketEnd + grace` even if no
  snapshot has yet created an open candle
- **AND** this expected-bucket due MUST remain owned by market foundation rather than strategy mode or Signal

#### Scenario: An expected bucket receives no snapshot
- **WHEN** its finalizer reaches the approved cutoff without any open candle
- **THEN** the bucket MUST commit an explicit discarded watermark
- **AND** it MUST NOT invent or store OHLC, volume, amount, price or a valid closed candle

#### Scenario: The next bucket opens before the prior grace cutoff
- **WHEN** the first accepted snapshot for the next minute arrives while the prior minute remains within grace
- **THEN** rollover MUST open and register the next bucket without finalizing the prior bucket
- **AND** the prior bucket MUST remain independently addressable by its full candle identity until cutoff
- **AND** normal per-series state MUST contain at most the current bucket and one prior grace-pending bucket

#### Scenario: A prior-bucket snapshot arrives within grace
- **WHEN** its acceptedAt is no later than that bucket's `bucketEndMs + graceMs`
- **THEN** it MAY update only the matching grace-pending candle identity
- **AND** it MUST NOT roll the current bucket backward or mutate another minute

#### Scenario: A snapshot arrives after grace
- **WHEN** its acceptedAt is later than its bucket's cutoff
- **THEN** it MUST NOT mutate the frozen candidate, cumulative baseline, terminal state or downstream trigger

#### Scenario: A due bucket is finalized
- **WHEN** the scanner handles a due identity
- **THEN** it MUST select exactly `(securityId,source,bucketStartMs)` rather than the current bucket for that
  market series
- **AND** a different current or pending minute MUST remain unchanged

#### Scenario: Redis finalization temporarily fails
- **WHEN** the atomic terminal commit does not succeed
- **THEN** the frozen candidate, due identity and pre-commit baseline MUST remain available for idempotent retry
- **AND** no post-commit trigger may be emitted
- **AND** the scanner MUST retry that exact immutable candidate at most once per scan until the hard horizon

#### Scenario: Redis finalization reaches the hard horizon
- **WHEN** no terminal commit has succeeded by `bucketEndMs + 60000ms`
- **THEN** Mist MUST release the frozen candidate and expose `finalization_horizon_exceeded` as a bounded
  infrastructure diagnostic
- **AND** it MUST NOT write a fabricated discarded watermark or emit a strategy trigger
- **AND** the missing terminal outcome MUST remain observable as a market-data gap

#### Scenario: Listener inventory changes during a bucket
- **WHEN** a listener is added mid-bucket without an accepted snapshot
- **THEN** expected-bucket due registration MUST begin with the next complete bucket and MUST NOT backfill an
  earlier missing minute
- **AND** a due registered while the listener was active at bucket start MUST still finalize the current bucket
  if the listener is removed before cutoff

#### Scenario: The candle process restarts after theoretical buckets were missed
- **WHEN** startup cannot recover an open/due/terminal record for an already elapsed bucket
- **THEN** it MUST continue from recoverable current state and subsequent buckets
- **AND** it MUST NOT synthesize prior missing terminal records
- **AND** the recovery gap MUST remain a bounded market diagnostic

#### Scenario: Startup finds a committed terminal with a stale due member
- **WHEN** a current-day candle terminal exists but its exact due member remains
- **THEN** candle recovery MUST remove the stale due idempotently
- **AND** B1 MUST NOT emit a duplicate post-commit trigger

#### Scenario: Startup finds a due bucket whose Node state was lost
- **WHEN** an exact current-day due exists without a committed terminal and restart has lost its mutable candle
- **THEN** recovery MUST commit a discarded watermark with reason `backend_restart_open_state_lost`
- **AND** it MUST NOT reconstruct, seal or store guessed OHLC or quantity

#### Scenario: Restart occurs during an active minute
- **WHEN** startup finds that the already-registered current bucket lost its pre-restart mutable evidence
- **THEN** that bucket MUST remain ineligible for a valid sealed candle and MUST finalize as restart-loss discard
- **AND** accepted snapshots MAY continue updating latest-memory state
- **AND** valid candle aggregation MUST resume with the next complete bucket

#### Scenario: Candle product shutdown begins
- **WHEN** the Nest application starts graceful shutdown
- **THEN** candle ownership MUST stop the due scanner, expected-bucket registration and new candle task
  acceptance before disconnecting its owned Redis client
- **AND** already admitted keyed tasks MUST receive one best-effort drain under the existing bounded Redis
  command timeout
- **AND** shutdown MUST NOT force-finalize or delete open/grace-pending candidates, delete unfinished due, or
  emit a shutdown-specific terminal or trigger
- **AND** process termination MAY truncate the drain and leave current-day due for the approved restart path

#### Scenario: A bucket lacks required OHLC or session evidence at finalization
- **WHEN** its finalizer reaches the approved cutoff without required non-quantity evidence
- **THEN** the bucket MUST be marked discarded
- **AND** no valid closed candle MUST be emitted

#### Scenario: A bucket lacks only one quantity field at finalization
- **WHEN** required OHLC, identity, session and timing evidence is valid but volume or amount never established a
  trusted same-day baseline
- **THEN** the candle MAY be sealed as valid with that quantity field equal to `null`
- **AND** finalization MUST NOT fill zero, copy the other field or copy a prior candle value

### Requirement: Market Sealing Shall Be Independent Of Downstream Consumers
Market Redis commit success SHALL NOT depend on trigger queues, strategy workers, MySQL strategy writes or
notification delivery.

#### Scenario: A downstream consumer is unavailable
- **WHEN** a valid candle is sealed
- **THEN** market state MUST complete according to its own contract
- **AND** downstream failure MUST NOT roll back or delay that seal

#### Scenario: A discarded watermark has a downstream consumer
- **WHEN** a discarded terminal outcome is committed
- **THEN** market state MUST remain complete before any post-commit handoff is attempted
- **AND** downstream failure MUST NOT roll back, delay or convert the discard into a valid candle

### Requirement: Candle Limits Shall Be Approved Before Enablement
Grace, hard horizon, queue, memory, record size, retention and Redis capacity limits SHALL be documented with
evidence and approved before product mode is enabled.

#### Scenario: Queue limits are loaded
- **WHEN** realtime candle productization starts
- **THEN** `REALTIME_CANDLE_QUEUE_MAX_PENDING_PER_SERIES` MUST default to `8` and accept integers from `1`
  through `256`
- **AND** `REALTIME_CANDLE_QUEUE_MAX_PENDING_GLOBAL` MUST default to `256` and accept integers from `16`
  through `4096`
- **AND** startup MUST fail when the global value is lower than the per-series value
- **AND** both values MUST be owned and validated by `libs/config`

#### Scenario: A snapshot task exceeds queue capacity
- **WHEN** the exact market-series queue rejects an accepted snapshot task
- **THEN** an existing matching candidate MUST be invalidated with `queue_overflow`
- **AND** a missing candidate MUST retain a bounded overflow diagnostic while its registered expected due
  remains responsible for finalization
- **AND** the snapshot MUST NOT be silently coalesced or treated as successfully applied

#### Scenario: A due or finalizer task exceeds queue capacity
- **WHEN** queue admission rejects a due/finalizer task
- **THEN** the candle evidence MUST remain unchanged and the due MUST remain pending for a later scanner pass
- **AND** the scheduling overflow MUST NOT create a market discard
- **AND** the existing hard horizon MUST continue to bound retry lifetime

#### Scenario: A due scan or startup replay reads Redis
- **WHEN** the owner reads current-day due members
- **THEN** each range command MUST return at most `64` members
- **AND** it MUST NOT use an unlimited `ZRANGEBYSCORE`, `KEYS` or wildcard scan

#### Scenario: A canonical Redis record is serialized
- **WHEN** candle foundation prepares a sealed candle, due member or manifest payload
- **THEN** its UTF-8 length MUST be at most `2048`, `128` or `1024` bytes respectively
- **AND** a limit breach MUST be classified as an internal contract/infrastructure failure rather than a market
  discard

#### Scenario: Active inventory is at its V1 maximum
- **WHEN** TDX and QMT each contain the allowed maximum of five distinct securities
- **THEN** Node candle state MUST remain structurally bounded by at most ten latest snapshots and twenty
  current/prior candle candidates plus fixed per-series metadata
- **AND** increasing either allowlist maximum MUST require a capacity review before enablement

#### Scenario: Candle mode is considered for promotion
- **WHEN** any required limit lacks accepted evidence
- **THEN** mode MUST remain `off` or `shadow`
- **AND** production closure MUST NOT be claimed

### Requirement: Realtime Candle State Shall Be Current-Day Only
Market-owned Redis candle state SHALL expire at the next Shanghai calendar-day boundary, and Node mutable
realtime state SHALL be replaced before accepting data from a new trading day.

#### Scenario: A market-data key is written for trading day D
- **WHEN** sealed/discarded state, watermark, due or manifest data is committed
- **THEN** the exact market-owned key MUST expire at Shanghai time D+1 00:00
- **AND** its identity MUST include canonical `securityId` and exact source rather than `providerSymbol`
- **AND** the expiry MUST NOT delete or modify BullMQ keys sharing the Redis endpoint
- **AND** cleanup MUST NOT use `FLUSHDB`, a wildcard key scan or a key-expiration notification as a business
  trigger

#### Scenario: The first accepted snapshot of a new trading day arrives
- **WHEN** its trading day differs from the Node candle state's current trading day
- **THEN** prior-day latest/open mutable state MUST be discarded before the new snapshot is aggregated
- **AND** the rollover MUST execute inside the existing per-security serialized boundary
- **AND** V1 MUST NOT add a midnight timer or preserve prior-day mutable state for cross-day recovery

#### Scenario: Prior-day history is needed after Redis expiry
- **WHEN** a downstream consumer hydrates context on the next trading day
- **THEN** historical bars MUST come from the owning MySQL provider-history boundary
- **AND** prior-day Redis candle state MUST NOT be restored, retained longer or used as historical fallback
