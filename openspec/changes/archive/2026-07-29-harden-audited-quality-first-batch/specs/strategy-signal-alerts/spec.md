## ADDED Requirements

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
