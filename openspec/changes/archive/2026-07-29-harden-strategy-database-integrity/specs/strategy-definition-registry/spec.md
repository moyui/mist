## MODIFIED Requirements

### Requirement: Strategy Definitions Shall Be Versioned

Mist SHALL store business strategy identity separately from immutable strategy
rule versions and SHALL update the definition and its current version
atomically.

#### Scenario: A strategy is created

- **WHEN** a client creates a strategy definition with valid declarative rules
- **THEN** the backend MUST persist one `StrategyDefinition`
- **AND** it MUST persist initial `StrategyVersion` number `1`
- **AND** the definition MUST reference that version as its current version
- **AND** all three writes MUST commit or roll back together

#### Scenario: A strategy is updated

- **WHEN** a client updates strategy rules or registry metadata
- **THEN** the backend MUST create a new `StrategyVersion`
- **AND** it MUST update the definition current version pointer
- **AND** previous versions MUST remain available for later signal and backtest
  reproducibility
- **AND** the definition update, version creation, and pointer update MUST
  commit or roll back together

#### Scenario: A current version is resolved

- **WHEN** the backend resolves a definition current version
- **THEN** the version MUST exist
- **AND** its `strategyDefinitionId` MUST equal the definition ID

### Requirement: Strategy Lifecycle Shall Be Explicit

Strategy definitions SHALL support draft, enabled, disabled, and archived
states without deleting stored versions.

#### Scenario: A strategy is enabled

- **WHEN** a client enables a strategy definition
- **THEN** the backend MUST verify that its current version exists and belongs
  to that definition
- **AND** the backend MUST reject enablement when the verification fails
- **AND** otherwise it MUST set the strategy status to enabled
- **AND** the stored current version MUST remain unchanged

#### Scenario: A strategy is disabled

- **WHEN** a client disables a strategy definition
- **THEN** the backend MUST set the strategy status to disabled
- **AND** existing signals, alert events, backtest runs, and versions MUST
  remain queryable
