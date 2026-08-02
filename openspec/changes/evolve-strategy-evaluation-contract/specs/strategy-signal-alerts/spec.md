## ADDED Requirements

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

#### Scenario: Production identity data cannot be mapped safely
- **WHEN** a stored `securityCode` is missing, ambiguous or cannot be mapped to one canonical `securityId`
- **THEN** migration implementation MUST stop before destructive DDL
- **AND** a repair-forward plan MUST be reviewed instead of guessing or preserving a compatibility alias
