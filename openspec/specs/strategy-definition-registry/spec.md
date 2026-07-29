## Purpose

Define Mist strategy platform foundations for versioned declarative strategy
definitions, lifecycle APIs, rule validation, persisted signal/alert
boundaries, and reserved signal-level backtest interfaces.
## Requirements
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

### Requirement: Strategy Rules Shall Be Declarative And Validated

First-phase strategy definitions SHALL store declarative rule JSON and MUST NOT
accept arbitrary executable user code.

#### Scenario: A rule is accepted

- **WHEN** a rule expression uses allowed logical groups, allowed field roots,
  and allowed deterministic operators
- **THEN** the validator MUST accept the expression
- **AND** the persisted version MUST include validation metadata

#### Scenario: Executable code is rejected

- **WHEN** a rule expression contains arbitrary code text or an unsupported
  operator
- **THEN** the backend MUST reject the strategy request before persistence

### Requirement: Strategy Registry APIs Shall Use Version-First Paths

The strategy registry SHALL expose public APIs from `apps/mist` using
`/v1/<resource>` paths.

#### Scenario: Registry route metadata is inspected

- **WHEN** strategy controller route metadata is inspected
- **THEN** it MUST expose `/v1/strategies`
- **AND** it MUST expose detail, update, enable, disable, and version routes
  below `/v1/strategies/:id`
- **AND** it MUST NOT include `/api/mist`, `/api/chan`, or `/strategy/v1`

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

### Requirement: Signal And Alert Boundaries Shall Be Persisted

The registry foundation SHALL define persistence boundaries for later live
signals and alert events.

#### Scenario: Signal and alert entities are inspected

- **WHEN** shared strategy entities are inspected
- **THEN** `StrategySignal` MUST link to a strategy definition and strategy
  version
- **AND** `StrategyAlertEvent` MUST link to a signal and include status,
  dedupe, cooldown, and delivery result fields

### Requirement: Backtest Interfaces Shall Be Reserved Without Portfolio Fields

The registry foundation SHALL reserve signal-level backtest request and result
interfaces while excluding portfolio-level simulation.

#### Scenario: A backtest run is requested

- **WHEN** a client requests a backtest run with strategy version, target
  universe, period, source, start date, and end date
- **THEN** the backend MUST persist a `BacktestRun` in pending status
- **AND** it MUST NOT require cash, position, order, fee, slippage, or
  portfolio allocation fields

#### Scenario: Backtest result routes are inspected

- **WHEN** strategy backtest controller route metadata is inspected
- **THEN** it MUST expose `/v1/strategy-backtests`
- **AND** it MUST expose run detail and signal result routes
