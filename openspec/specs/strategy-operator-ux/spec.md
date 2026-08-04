## Purpose

Strategy operator UX makes the accepted strategy backend contracts usable from
`mist-fe`: operators can manage strategy definitions, inspect signals and
alerts, acknowledge alert events, trigger manual scans, and run signal-level
backtests without calling datasource services directly.
## Requirements
### Requirement: Strategy Workspace Shall Be Available

Mist frontend SHALL provide a strategy operator workspace for backend strategy
platform workflows.

#### Scenario: Operator opens strategy workspace

- **WHEN** an operator navigates to the strategy workspace
- **THEN** the frontend MUST render registry, signals, alerts, and backtests
  workflow areas
- **AND** it MUST NOT render a marketing or landing-only page in place of the
  usable workspace

### Requirement: Strategy UX Shall Use Mist Backend Strategy APIs

The strategy operator workspace SHALL call Mist backend strategy APIs through
the configured Mist API base path and version-first `/v1/*` endpoints.

#### Scenario: Strategy API calls are made

- **WHEN** the strategy workspace loads or performs a strategy action
- **THEN** the frontend MUST call Mist backend endpoints under `/v1/strategies`,
  `/v1/strategy-signals`, `/v1/strategy-alert-events`,
  `/v1/strategy-scans/run`, or `/v1/strategy-backtests`
- **AND** it MUST NOT call datasource services or raw provider endpoints
  directly

### Requirement: Operators Shall Manage Strategy Definitions

The strategy workspace SHALL allow operators to create and inspect strategy definitions and change only their
lifecycle state. Existing definition content SHALL remain read-only.

#### Scenario: Strategy registry is loaded

- **WHEN** strategy definitions are returned by the backend
- **THEN** the workspace MUST show definition name, status, current version, target universe, period, source,
  signal kind and timestamps where available

#### Scenario: Strategy definition is saved

- **WHEN** an operator submits valid strategy metadata, one rule and one signal kind
- **THEN** the frontend MUST call only the strategy create API
- **AND** it MUST refresh the registry after creation

#### Scenario: An existing strategy is selected

- **WHEN** the workspace displays an existing definition
- **THEN** its metadata, rule and signal kind MUST be read-only
- **AND** the workspace MUST NOT expose or call a strategy update API
- **AND** the operator MUST create a new definition for changed content

#### Scenario: Strategy lifecycle action is requested

- **WHEN** an operator enables or disables a strategy
- **THEN** the frontend MUST call the corresponding lifecycle API
- **AND** it MUST show the updated strategy status after completion

### Requirement: Strategy Rule Editing Shall Be Explicit

The strategy workspace SHALL edit declarative strategy rules only while creating a new definition and SHALL
surface validation failures.

#### Scenario: Rule JSON is invalid

- **WHEN** an operator submits malformed rule JSON in the creation form
- **THEN** the frontend MUST block the API call
- **AND** it MUST show a rule JSON parse error near the editor

#### Scenario: Backend rejects a rule

- **WHEN** the backend rejects a strategy create request
- **THEN** the frontend MUST show the API error near the creation editor

### Requirement: Operators Shall Inspect Signals And Alerts

The strategy workspace SHALL expose signal history and alert event triage.

#### Scenario: Signal history is loaded

- **WHEN** signal records are returned by the backend
- **THEN** the workspace MUST show strategy identity, version, security code,
  period, source, signal time, and rule snapshot or context access

#### Scenario: Alert events are acknowledged

- **WHEN** an operator acknowledges an alert event
- **THEN** the frontend MUST call the alert acknowledgement API
- **AND** it MUST update the alert event status in the workspace

### Requirement: Operators Shall Trigger Manual Scans

The strategy workspace SHALL provide a manual scan action for enabled strategy
definitions.

#### Scenario: Manual scan is triggered

- **WHEN** an operator triggers a strategy scan
- **THEN** the frontend MUST call `/v1/strategy-scans/run`
- **AND** it MUST show created signal count, created alert count, and duplicate
  skip count when returned by the backend

### Requirement: Operators Shall Run Signal-Level Backtests

The strategy workspace SHALL allow operators to create and inspect signal-level
backtest runs.

#### Scenario: Backtest is requested

- **WHEN** an operator submits strategy version, target universe, period,
  source, start date, and end date
- **THEN** the frontend MUST call the signal-level backtest create API
- **AND** it MUST show run status, signal count, matched security count,
  started timestamp, and completed timestamp when returned

#### Scenario: Backtest signal results are inspected

- **WHEN** backtest signal rows are returned by the backend
- **THEN** the workspace MUST show security code, period, source, signal time,
  rule snapshot, and context snapshot access

### Requirement: Strategy UX Shall Exclude Portfolio Simulation

The strategy workspace SHALL NOT present signal-level backtests as
portfolio-level execution simulation.

#### Scenario: Backtest run is displayed

- **WHEN** a backtest run or result is displayed
- **THEN** the workspace MUST NOT require or render cash, positions, orders,
  fills, fees, slippage, allocation, equity curve, or portfolio return fields

### Requirement: Strategy Editor Changes Shall Follow The Accepted Backend Contract
The frontend SHALL preserve backend field types and decimal strings. It SHALL NOT expose caller-owned lookback;
after the backend migration gate is approved it SHALL edit one rule plus one required signal kind, and SHALL NOT
expose paired-rule fields or an existing-definition update action.

#### Scenario: A new strategy contract field is proposed for the editor
- **WHEN** the backend decision remains open
- **THEN** the frontend MUST NOT create a provisional incompatible field

#### Scenario: The accepted creation shape is exposed
- **WHEN** the backend create API and migration for signal kind are available
- **THEN** the creation form MUST submit exactly one `rule` and one `signalKind='entry'|'exit'`
- **AND** it MUST NOT submit `entryRule`, `exitRule` or a pairing identifier

#### Scenario: The editor renders context demand
- **WHEN** a strategy field has an internally compiled `requiredBarCount`
- **THEN** the editor MUST NOT offer `lookbackBars` as an editable strategy property
