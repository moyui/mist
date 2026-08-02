## ADDED Requirements

### Requirement: Realtime Alert Episodes Shall Use Active Membership
Realtime strategy evaluation SHALL use source-aware active episode membership only for duplicate suppression;
evaluation availability and bar completeness SHALL remain separate concepts. The membership store SHALL be
process-local and scoped to one Shanghai trading day.

#### Scenario: An episode identity is created
- **WHEN** a realtime strategy and signal kind are evaluated for one market-context chain
- **THEN** the key MUST contain definition id, immutable version id, security id, exact TDX/QMT source,
  period and signal kind
- **AND** bar type and timestamp MUST NOT participate in the episode key
- **AND** a version or source change MUST use a different episode

#### Scenario: An inactive episode evaluates with a match
- **WHEN** the approved episode key is not active and evaluation returns `status='evaluated', matched=true`
- **THEN** the episode stage MUST return `emit` and offer one candidate to the current mode boundary
- **AND** `emit` MUST NOT claim that persistence committed or an external notification was sent

#### Scenario: A shadow candidate reaches the observation boundary
- **WHEN** realtime strategy mode is `shadow` and an `emit` candidate outcome is recorded
- **THEN** the episode key MUST become active immediately after that observation
- **AND** no Signal or AlertEvent row MAY be written
- **AND** a later evaluated match MUST be suppressed until an evaluated non-match clears the key

#### Scenario: An on-mode candidate commits atomically
- **WHEN** realtime strategy mode is `on` and the Signal plus linked PENDING AlertEvent transaction commits
- **THEN** the episode key MUST become active only after the commit
- **AND** monitoring MUST record the bounded `created` persistence outcome
- **AND** the key MUST NOT become active merely because evaluation matched or the transaction started

#### Scenario: An approved persistence duplicate is identified
- **WHEN** on-mode persistence precisely conflicts with `uq_strategy_alert_events_dedupe_key` for the same result
- **THEN** monitoring MUST record the bounded `duplicate_skipped` persistence outcome
- **AND** the episode key MUST become active because the equivalent persisted result already exists
- **AND** a generic duplicate code, fuzzy SQL message, another unique, foreign-key, nullability, type, or unknown
  constraint failure MUST NOT be classified as this outcome

#### Scenario: Candidate persistence fails
- **WHEN** the transaction rolls back, AlertEvent persistence fails, or any unapproved TypeORM/MySQL error occurs
- **THEN** the episode key MUST remain inactive
- **AND** the original error MUST propagate to the owning BullMQ worker boundary
- **AND** the failure MUST NOT be converted to suppression, success, or an automatic retry
- **AND** a later evaluated match MAY form a new candidate

#### Scenario: Evaluation is unavailable
- **WHEN** context or analysis returns `status='unavailable'`
- **THEN** active membership MUST remain unchanged
- **AND** no candidate, activation or false reset MUST be inferred

#### Scenario: An active episode remains matched
- **WHEN** the approved episode key is active and evaluation returns `status='evaluated', matched=true`
- **THEN** active membership MUST remain
- **AND** another candidate MUST NOT be produced

#### Scenario: An episode evaluates without a match
- **WHEN** evaluation returns `status='evaluated', matched=false` for an active or inactive key
- **THEN** the key MUST be inactive
- **AND** a later evaluated match MAY form a new episode

#### Scenario: Bar completeness differs
- **WHEN** a complete or incomplete `StrategyBar` is evaluated
- **THEN** its type MUST NOT directly activate, clear or suppress an episode
- **AND** only an evaluated matched/non-matched result MAY drive episode membership

#### Scenario: The signal process restarts
- **WHEN** the process-local episode store is initialized after restart
- **THEN** its active set MUST be empty
- **AND** the next evaluated match MAY create a new candidate without reconstructing continuity from MySQL or Redis

#### Scenario: The first valid trigger of a new trading day arrives
- **WHEN** the trigger trading day differs from the episode store trading day
- **THEN** the runtime MUST clear the complete active set before evaluating that trigger
- **AND** it MUST replace the store trading day with the trigger trading day
- **AND** a condition that remained matched overnight MAY produce a new Signal on its first current-day match
- **AND** the runtime MUST NOT restore prior-day episode membership from Redis, MySQL or prior Signals

#### Scenario: Realtime strategy mode is switched off
- **WHEN** the Signal runtime transitions to `off`
- **THEN** the active episode set MUST be cleared
- **AND** a later promotion MUST begin with an inactive set

#### Scenario: Registry or listener ownership changes
- **WHEN** a registry cutover or listener removal makes an episode key unreachable
- **THEN** that key MUST be removed from active membership
- **AND** active membership MUST remain a subset of the current listener and compiled eligible-plan key universe
- **AND** the runtime MUST NOT evict an unrelated active key to repair an invariant breach

#### Scenario: Episode capacity is designed
- **WHEN** V1 episode storage is configured
- **THEN** it MUST NOT add a fixed capacity environment variable, TTL, cooldown, timed cleaner or Redis/MySQL
  episode persistence
- **AND** capacity monitoring MUST use the bounded process-level active count and MUST NOT label by episode identity

#### Scenario: A registry cutover overlaps an in-flight job
- **WHEN** the job completes under its captured old registry generation after the latest registry removed its key
- **THEN** the accepted snapshot semantics MAY allow that in-flight result to complete
- **AND** the obsolete key MUST NOT remain in the latest active membership set
- **AND** V1 MUST NOT add a global execution lock solely to prevent that final in-flight result

### Requirement: Live Signal Persistence Shall Have One Runtime Owner
Realtime evaluations SHALL persist `StrategySignal` and linked PENDING `StrategyAlertEvent` only from
`apps/signal`. Operator-requested execution SHALL use Backtest and SHALL NOT write live records.

#### Scenario: A realtime candidate is accepted
- **WHEN** an approved realtime trigger produces an on-mode candidate
- **THEN** only `apps/signal` MAY persist the live Signal/PENDING AlertEvent pair
- **AND** `apps/mist`, `apps/backtest` and `apps/schedule` MUST NOT persist that live pair

#### Scenario: An operator executes a strategy manually
- **WHEN** the operator creates a BacktestRun
- **THEN** the backtest runtime MUST persist only BacktestSignalResult rows
- **AND** it MUST NOT persist StrategySignal or StrategyAlertEvent rows

## MODIFIED Requirements

### Requirement: Matching Scans Shall Persist Signals And Alert Events

Mist SHALL persist live strategy signals and alert events only when an enabled strategy matches an approved
realtime trigger in `apps/signal`.

#### Scenario: A realtime strategy match is found

- **WHEN** an enabled strategy current version matches a realtime market context
- **THEN** `apps/signal` MUST persist a `StrategySignal`
- **AND** the signal MUST include non-null context and rule snapshots
- **AND** it MUST persist a linked `StrategyAlertEvent` in pending status
- **AND** the signal and alert writes MUST commit or roll back together

### Requirement: Live Persistence Identity Shall Name One Result Bar

Each live result SHALL use a deterministic persistence identity containing definition id, immutable version id,
canonical security id, exact TDX/QMT source, period, signal kind and the actual result bar timestamp.

#### Scenario: A one-minute result identity is created

- **WHEN** a sealed 1m StrategyBar produces an entry or exit candidate
- **THEN** `signalTime` MUST equal that sealed bar's canonical timestamp
- **AND** `dedupeKey` MUST equal
  `live-v1:{definitionId}:{versionId}:{securityId}:{source}:{period}:{signalKind}:{signalTimeEpochMs}`

#### Scenario: A derived-period result identity is created

- **WHEN** a 5m, 15m, 30m or 60m derived StrategyBar produces a candidate
- **THEN** `signalTime` MUST equal the derived bar's theoretical `bucketStartMs`
- **AND** it MUST NOT use the final 1m trigger time that woke the computation

#### Scenario: Transport and evidence fields differ

- **WHEN** a persistence identity is formed
- **THEN** job id, trigger price, context or rule JSON, bar type, trading day, creation time and registry generation
  MUST NOT participate in the identity
- **AND** the identity MUST NOT suppress another result time, source, period, signal kind, immutable version or
  BacktestRun

### Requirement: Alert Events Shall Be Deduplicated

Mist SHALL suppress duplicate live alert events when the same approved realtime result is processed more than
once under the persistence identity accepted by this change. V1 SHALL reuse
`uq_strategy_alert_events_dedupe_key` and SHALL NOT add a second composite unique to `strategy_signals`.

#### Scenario: A duplicate realtime candidate is processed

- **WHEN** a realtime candidate precisely conflicts with `uq_strategy_alert_events_dedupe_key`
- **THEN** the backend MUST NOT create another signal
- **AND** it MUST NOT create another alert event
- **AND** monitoring MUST record the bounded `duplicate_skipped` persistence outcome

#### Scenario: A live result enters persistence

- **WHEN** an on-mode candidate reaches the persistence boundary
- **THEN** the runtime MUST NOT perform a `dedupeKey` existence query before the transaction
- **AND** the named database unique MUST remain the authoritative concurrent decision

### Requirement: Matching signal and alert persistence is atomic

The realtime signal runtime SHALL persist a matched `StrategySignal` and its linked pending
`StrategyAlertEvent` in one database transaction and SHALL report creation only after that transaction commits.

#### Scenario: Both writes succeed

- **WHEN** an approved realtime candidate has no existing result under the accepted persistence identity
- **THEN** the signal and linked pending alert event commit together
- **AND** the runtime records the bounded `created` persistence outcome only after commit

#### Scenario: Alert event persistence fails

- **WHEN** signal creation succeeds inside the transaction but alert event persistence fails
- **THEN** the transaction rolls back the signal
- **AND** the episode remains inactive
- **AND** the runtime MUST NOT record a created outcome

### Requirement: Concurrent alert dedupe is a successful skip

The realtime signal runtime SHALL rely only on `uq_strategy_alert_events_dedupe_key` to serialize concurrent
creation of the same live result. Only a conflict from that exact index SHALL be classified as a skipped
duplicate.

#### Scenario: Two realtime deliveries race on one persistence identity

- **WHEN** two deliveries attempt the same approved live persistence identity concurrently
- **THEN** exactly one signal and linked alert event commit
- **AND** the losing transaction rolls back its signal and records one bounded `duplicate_skipped` outcome
- **AND** the existing alert status MUST remain unchanged

#### Scenario: Another database error occurs

- **WHEN** signal/alert persistence fails for any reason other than `uq_strategy_alert_events_dedupe_key`
- **THEN** the worker MUST propagate the original error
- **AND** it MUST NOT classify the failure as a skipped duplicate

#### Scenario: A generic duplicate error is observed

- **WHEN** MySQL reports only a generic duplicate code, another constraint name or an unverified fuzzy message
- **THEN** the runtime MUST NOT classify it as `duplicate_skipped`
- **AND** exact constraint-name extraction MUST be verified against real MySQL driver evidence

## REMOVED Requirements

### Requirement: Enabled Strategies Shall Be Scanned

**Reason**: The legacy manual scan service is retired. Realtime triggers and BacktestRuns own separate execution
workflows, so there is no shared operator-triggered live scan operation.

**Migration**: Delete the manual scan controller/service and route. Operator-requested execution uses
`POST /v1/strategy-backtests`; realtime evaluation is triggered only by the approved sealed-bar queue.

### Requirement: Scan APIs Shall Use Version-First Paths

**Reason**: `/v1/strategy-scans/run` is removed and has no Signal execution successor.

**Migration**: Remove the public route, OpenAPI contract and frontend consumer. Keep version-first strategy,
signal, alert-event and backtest APIs.
