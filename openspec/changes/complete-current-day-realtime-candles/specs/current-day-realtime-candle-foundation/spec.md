## ADDED Requirements

### Requirement: Accepted Snapshots Shall Produce Bounded One-Minute Candle State
Mist SHALL aggregate accepted canonical realtime snapshots by `securityId` into bounded one-minute open candle
state and SHALL serialize snapshot and finalizer mutations for the same security.

#### Scenario: An accepted snapshot belongs to an active A-share bucket
- **WHEN** the candle product mode permits aggregation
- **THEN** the snapshot MUST update only its canonical security's bounded open state
- **AND** it MUST NOT directly invoke strategy, MySQL or notification behavior

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
After an evidence-calibrated grace interval, finalization SHALL atomically record either a valid sealed candle
or an explicit discarded watermark and SHALL NOT invent missing OHLC or quantity evidence.

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

### Requirement: Candle Limits Shall Be Approved Before Enablement
Grace, hard horizon, queue, memory, record size, retention and Redis capacity limits SHALL be documented with
evidence and approved before product mode is enabled.

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
