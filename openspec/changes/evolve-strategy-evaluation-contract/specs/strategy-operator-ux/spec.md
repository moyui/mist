## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Operators Shall Manage Strategy Definitions

The strategy workspace SHALL allow operators to create and inspect strategy definitions and change only their
lifecycle state. Existing definition content SHALL remain read-only.

#### Scenario: Strategy registry is loaded

- **WHEN** strategy definitions are returned by the backend
- **THEN** the workspace MUST show definition name, status, current version, target universe, period, source,
  signal kind and timestamps where available

#### Scenario: A strategy definition is created

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
