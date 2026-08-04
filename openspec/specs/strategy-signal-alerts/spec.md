## Purpose

Define Mist strategy alert foundations for scanning enabled strategy
definitions, deterministic rule evaluation, persisted live strategy signals,
persisted alert events, duplicate suppression, and version-first scan APIs.
## Requirements
### Requirement: Enabled Strategies Shall Be Scanned

Mist SHALL provide a shared scan service that evaluates enabled strategy
definitions against current market context and SHALL fail closed when the
stored current version does not belong to the scanned definition.

#### Scenario: Manual scan is requested

- **WHEN** an operator requests a strategy scan
- **THEN** the backend MUST evaluate enabled strategy definitions
- **AND** it MUST use each definition current strategy version
- **AND** that version MUST exist and belong to the definition
- **AND** it MUST evaluate configured target universe, period, and source
  coverage

### Requirement: Strategy Rules Shall Be Evaluated Deterministically

The scan service SHALL evaluate declarative rule expressions through a pure
rule evaluator.

#### Scenario: Rule matches K-line context

- **WHEN** a rule expression matches the built K-line and security context
- **THEN** the evaluator MUST return a match result without writing data

#### Scenario: Rule does not match K-line context

- **WHEN** a rule expression does not match the built context
- **THEN** the evaluator MUST return a non-match result without writing data

### Requirement: Matching Scans Shall Persist Signals And Alert Events

Mist SHALL persist live strategy signals and alert events when enabled strategy
rules match.

#### Scenario: A strategy match is found

- **WHEN** an enabled strategy current version matches a scanned security
- **THEN** the backend MUST persist a `StrategySignal`
- **AND** the signal MUST include non-null context and rule snapshots
- **AND** it MUST persist a linked `StrategyAlertEvent` in pending status
- **AND** the signal and alert writes MUST commit or roll back together

### Requirement: Alert Events Shall Be Deduplicated

Mist SHALL suppress duplicate alert events for repeated scans of the same
strategy/version/security/period/source/timestamp.

#### Scenario: Duplicate signal candidate is scanned

- **WHEN** a scan sees a candidate whose alert dedupe key already exists
- **THEN** the backend MUST NOT create another signal
- **AND** it MUST NOT create another alert event
- **AND** the scan result MUST report the skipped duplicate

### Requirement: Scan APIs Shall Use Version-First Paths

Manual scan APIs SHALL be exposed from `apps/mist` using `/v1/<resource>` paths.

#### Scenario: Scan route metadata is inspected

- **WHEN** strategy scan controller route metadata is inspected
- **THEN** it MUST expose `/v1/strategy-scans/run`
- **AND** it MUST NOT include `/api/mist`, `/api/chan`, or `/strategy/v1`

### Requirement: Matching signal and alert persistence is atomic
The strategy scanner SHALL persist a matched `StrategySignal` and its linked pending `StrategyAlertEvent` in one database transaction and SHALL update created counters only after that transaction commits.

#### Scenario: Both writes succeed
- **WHEN** an enabled strategy matches and no existing alert event has the dedupe key
- **THEN** the signal and linked pending alert event commit together
- **AND** both created counters increment after commit

#### Scenario: Alert event persistence fails
- **WHEN** signal creation succeeds inside the transaction but alert event persistence fails
- **THEN** the transaction rolls back the signal
- **AND** neither created counter increments

### Requirement: Concurrent alert dedupe is a successful skip
The strategy scanner SHALL rely on the existing named database unique index to
serialize concurrent creation of the same alert dedupe key. Only a conflict
from that exact index SHALL be classified as a skipped duplicate.

#### Scenario: Two scans race on one dedupe key
- **WHEN** both scans pass the application pre-check and attempt the same
  dedupe key concurrently
- **THEN** exactly one signal and linked alert event commit
- **AND** the losing transaction rolls back its signal and reports one skipped
  duplicate

#### Scenario: Another database error occurs
- **WHEN** signal/alert persistence fails for any reason other than the named
  dedupe unique index
- **THEN** the scanner propagates the error
- **AND** it MUST NOT count the failure as a skipped duplicate

### Requirement: Strategy Entity Relations Match Physical Foreign Keys

TypeORM metadata SHALL expose the same definition/version, signal/alert, and
run/result relationships enforced by repository migrations.

#### Scenario: Strategy entity metadata is inspected

- **WHEN** TypeORM relation metadata is built
- **THEN** scalar foreign-key columns that remain in the schema MUST have
  relation properties using the same physical join-column names
- **AND** the metadata MUST NOT create duplicate compatibility columns

### Requirement: Signal Candidates Shall Carry Typed Evaluation Results
Realtime signal orchestration SHALL create a live signal candidate only from an approved
`status='evaluated', matched=true` result and SHALL preserve active episode membership when evaluation is
unavailable. Backtest orchestration SHALL use the same typed evaluation result but SHALL write only backtest
results.

#### Scenario: Evaluation is unavailable
- **WHEN** backtest or realtime orchestration consumes the result
- **THEN** no live Signal or AlertEvent MUST be created from that result

#### Scenario: Evaluation completes without a match
- **WHEN** orchestration receives `status='evaluated', matched=false`
- **THEN** no candidate MUST be created

#### Scenario: Evaluation completes with a match
- **WHEN** orchestration receives `status='evaluated', matched=true`
- **THEN** candidate eligibility MUST continue to the owning mode's suppression and persistence boundary
- **AND** the candidate kind MUST equal the immutable strategy version's required signal kind
- **AND** orchestration MUST NOT synthesize an opposite entry or exit candidate

### Requirement: Live Signal Rows Shall Use Canonical Identity Fields

The target live `StrategySignal` schema SHALL use non-null canonical `securityId` and non-null
`signalKind='entry'|'exit'`. This change SHALL own the production audit and forward-only migration for those
fields, while realtime persistence SHALL reuse the existing AlertEvent dedupe constraint.

#### Scenario: The live Signal schema is migrated
- **WHEN** production schema and stored-row preflight permit the approved migration
- **THEN** the resulting live Signal row MUST store `securityId` and `signalKind`
- **AND** it MUST NOT retain a `securityCode` compatibility column or dual write
- **AND** it MUST NOT add a second composite unique to `strategy_signals`
- **AND** `securityId` MUST reference `securities(id)` through named constraint
  `fk_strategy_signals_security` using `ON DELETE RESTRICT ON UPDATE RESTRICT`

#### Scenario: Production identity data cannot be mapped safely
- **WHEN** a stored `securityCode` is missing, ambiguous or cannot be mapped to one canonical `securityId`
- **THEN** migration implementation MUST stop before destructive DDL
- **AND** a repair-forward plan MUST be reviewed instead of guessing or preserving a compatibility alias

#### Scenario: A Security with persisted live Signals is removed or renumbered
- **WHEN** maintenance attempts to delete or update the referenced `securities.id`
- **THEN** `fk_strategy_signals_security` MUST reject the operation
- **AND** Signal and AlertEvent audit evidence MUST NOT be cascade-deleted through Security ownership
