## MODIFIED Requirements

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

### Requirement: Matching Scans Shall Persist Signals And Alert Events

Mist SHALL persist live strategy signals and alert events when enabled strategy
rules match.

#### Scenario: A strategy match is found

- **WHEN** an enabled strategy current version matches a scanned security
- **THEN** the backend MUST persist a `StrategySignal`
- **AND** the signal MUST include non-null context and rule snapshots
- **AND** it MUST persist a linked `StrategyAlertEvent` in pending status
- **AND** the signal and alert writes MUST commit or roll back together

## ADDED Requirements

### Requirement: Strategy Entity Relations Match Physical Foreign Keys

TypeORM metadata SHALL expose the same definition/version, signal/alert, and
run/result relationships enforced by repository migrations.

#### Scenario: Strategy entity metadata is inspected

- **WHEN** TypeORM relation metadata is built
- **THEN** scalar foreign-key columns that remain in the schema MUST have
  relation properties using the same physical join-column names
- **AND** the metadata MUST NOT create duplicate compatibility columns
