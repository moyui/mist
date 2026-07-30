## MODIFIED Requirements

### Requirement: Operators Shall Manage Strategy Definitions
The strategy workspace SHALL allow operators to inspect and change lifecycle state for paired-rule strategy
definitions.

#### Scenario: Strategy registry is loaded
- **WHEN** definitions are returned by the backend
- **THEN** the workspace MUST show name, status, current version, target universe, period, source, lookback and
  update timestamps where available

#### Scenario: Strategy definition is saved
- **WHEN** an operator submits valid metadata, entry rule, optional exit rule and lookback
- **THEN** the frontend MUST call the strategy create/update API
- **AND** it MUST refresh the selected definition after save

#### Scenario: Strategy lifecycle action is requested
- **WHEN** an operator enables or disables a strategy
- **THEN** the frontend MUST call the corresponding lifecycle API
- **AND** it MUST show realtime-ineligible reasons returned by the backend

### Requirement: Strategy Rule Editing Shall Be Explicit
The workspace SHALL expose separate entry/exit JSON editors and a bounded lookback input while preserving exact
decimal rule values as strings.

#### Scenario: Rule JSON is invalid
- **WHEN** an operator submits malformed JSON or a numeric `k.volume`/`k.amount` threshold
- **THEN** the frontend MUST block the request where locally detectable
- **AND** it MUST show the validation error near the corresponding editor

#### Scenario: Backend rejects a rule
- **WHEN** backend field/type/operator/eligibility validation rejects save or enablement
- **THEN** the frontend MUST show the API error without coercing or rewriting the rule

## ADDED Requirements

### Requirement: Realtime implementation does not create new product pages
This change SHALL limit frontend work to the existing strategy editor contract.

#### Scenario: Realtime pipeline is enabled
- **WHEN** strategy shadow or on is deployed
- **THEN** the frontend MUST NOT read Redis/BullMQ directly
- **AND** this change MUST NOT add realtime signal dashboards, notification UI or portfolio simulation UI
