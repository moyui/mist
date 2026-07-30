## MODIFIED Requirements

### Requirement: Strategy Rules Shall Be Evaluated Deterministically
Manual, backtest and realtime paths SHALL share one pure paired-rule evaluator with explicit known/unknown
results and separate exact-decimal and finite-number comparator paths.

#### Scenario: Paired rule matches context
- **WHEN** an entry or exit rule has complete current/prior context and matches
- **THEN** the evaluator MUST return a known match with `entry|exit` signal kind without writing data

#### Scenario: Required context is unavailable
- **WHEN** lookback, decimal, indicator, period or Chan context is incomplete
- **THEN** the evaluator MUST return unknown
- **AND** unknown MUST NOT be treated as false

### Requirement: Matching Scans Shall Persist Signals And Alert Events
Mist SHALL persist typed live strategy signals and alert events when enabled paired rules produce candidates.

#### Scenario: A strategy candidate is committed
- **WHEN** an enabled current version produces an entry or exit candidate and registry ownership remains valid
- **THEN** the backend MUST persist a `StrategySignal` with `signalKind`, non-null rule/context snapshots and
  `signalSource=live`
- **AND** it MUST persist a linked `StrategyAlertEvent` in pending status
- **AND** both writes MUST commit or roll back together

### Requirement: Alert Events Shall Be Deduplicated
Mist SHALL suppress duplicate logical candle events by definition, version, security, period, signal kind and
signal time, independent of source provenance.

#### Scenario: The same logical candle candidate is retried
- **WHEN** producer, reconciler or worker retry reaches an existing logical-candle unique key
- **THEN** the backend MUST NOT create another signal or alert
- **AND** only the named unique-index conflict may be classified as successful dedupe

#### Scenario: Another database error occurs
- **WHEN** persistence fails for any reason other than the named logical-candle unique index
- **THEN** the error MUST propagate for retry
- **AND** episode/cursor MUST NOT advance
