## ADDED Requirements

### Requirement: Sealed candles are handed off durably
After a valid market commit, Mist SHALL offer one versioned wake-up reference to BullMQ on a physically isolated
queue Redis and SHALL compensate failed enqueue windows through a bounded reconciler.

#### Scenario: Primary enqueue succeeds
- **WHEN** a valid closed candle commit is confirmed
- **THEN** the producer MUST use job ID `rt-strategy-v1-{tradingDay}-{securityId}-{bucketStartMs}`
- **AND** the job MUST NOT contain securityCode, history, rule, native data, epoch, sequence or notification data

#### Scenario: Primary enqueue fails
- **WHEN** the buffer is full, queue command times out or queue Redis is unavailable
- **THEN** candle sealing MUST remain committed
- **AND** the reconciler MUST be able to add the same deterministic job later

### Requirement: Realtime evaluation uses shared bounded memory
The worker SHALL maintain one hard-limited shared ring window per `securityId + period`, append each sealed
candle once, and SHALL NOT query MySQL or a unified market-K service for realtime warmup.

#### Scenario: Several strategies need the same period
- **WHEN** multiple enabled definitions match one security and period
- **THEN** they MUST share normalized bars, period calculation, indicators and Chan context

#### Scenario: Worker starts without enough retained bars
- **WHEN** bounded Redis replay cannot satisfy required lookback
- **THEN** affected context MUST be unknown
- **AND** no candidate or cursor success may be inferred from missing history

### Requirement: Realtime periods use complete session-aligned bars
The worker SHALL derive A-share 1/5/15/30/60 minute completed bars from ordered sealed 1m candles, aligning
09:30 and 13:00 sessions independently.

#### Scenario: Higher period is complete
- **WHEN** every expected constituent minute exists and is valid
- **THEN** OHLC MUST use first/max/min/last and quantities MUST use exact decimal addition

#### Scenario: A constituent is unavailable
- **WHEN** any expected minute is missing, discarded, conflicting or crosses the lunch break
- **THEN** the higher-period context MUST be unknown
- **AND** it MUST NOT be filled forward or persisted

### Requirement: Chan context reuses stable Phase B
Realtime evaluation SHALL expose only the existing Phase B latest Fenxing/Bi/Channel and count projection from
the shared ordered window.

#### Scenario: Chan projection is built
- **WHEN** a complete ordered window is evaluated
- **THEN** the adapter MUST use deterministic temporary ordinals and record algorithm version/input fingerprint
- **AND** temporary ordinals MUST NOT become database K identity or persisted Chan state

### Requirement: Episode state is explicitly tri-state
Each episode SHALL store `unknown|false|true` under
`definitionId + versionId + securityId + period + signalKind`, excluding source and transport generation.

#### Scenario: Complete context changes state
- **WHEN** unknown/false evaluates true, true remains true, or a complete context evaluates false
- **THEN** runtime MUST respectively create one candidate, suppress repetition, or reset to false

#### Scenario: Context is incomplete
- **WHEN** history, decimal, period, indicator or Chan context is unavailable
- **THEN** episode MUST become or remain unknown

#### Scenario: Episode capacity is exhausted
- **WHEN** a new episode would exceed a hard limit
- **THEN** evaluation MUST fail closed without evicting active true entries

### Requirement: Realtime registry is immutable and validated
Enabled strategy definitions SHALL be indexed by canonical security identity and period using immutable
generation-tagged entries containing paired rules, lookback and realtime eligibility.

#### Scenario: Registry loads an invalid strategy
- **WHEN** identity, period, source, decimal rule, version ownership or retained lookback is invalid
- **THEN** the version MUST be marked realtime-ineligible with a stable reason

#### Scenario: Persistence begins after registry change
- **WHEN** definition status/current version/generation changed after evaluation
- **THEN** persistence MUST skip without creating signal or alert side effects

### Requirement: Realtime modes isolate evaluation side effects
`REALTIME_STRATEGY_MODE` SHALL be `off|shadow|on`, default off, and SHALL remain independent from transport,
candle and future notification modes.

#### Scenario: Strategy mode is shadow
- **WHEN** a complete candidate is evaluated in shadow
- **THEN** the same context and episode path MUST run
- **AND** StrategySignal and StrategyAlertEvent writes MUST be zero

#### Scenario: Strategy mode is on
- **WHEN** a complete candidate passes registry revalidation
- **THEN** Signal with `signalSource=live` and linked PENDING AlertEvent MUST commit in one transaction
- **AND** only commit success or the named logical-candle unique conflict may advance episode/cursor

#### Scenario: Strategy mode is off
- **WHEN** strategy mode is off
- **THEN** producer, worker and reconciler MUST remain stopped while transport and candle modes remain independent

### Requirement: Notification delivery is outside realtime evaluation
This capability SHALL stop at persisted PENDING AlertEvent.

#### Scenario: Realtime alert event commits
- **WHEN** strategy on commits a linked pending alert
- **THEN** no WeCom, WeChat, AstrBot, delivery retry, dead-letter or delivery-state mutation may run
