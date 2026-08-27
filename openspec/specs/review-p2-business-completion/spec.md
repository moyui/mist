# review-p2-business-completion Specification

## Purpose
Track the P2 business-completion remediation: auditable completion evidence, shared adapter error wrapping and QMT WebSocket dependency handling with explicit closure criteria.
## Requirements
### Requirement: Business P2 completion is auditable
The business P2 completion pass SHALL distinguish verification-only repositories
from repositories that receive code changes.

#### Scenario: Monitoring P2 is verified without churn
- **WHEN** this change records monitoring P2 status
- **THEN** it MUST point to the archived monitoring health-alert repair scope or
  current monitoring verification commands
- **AND** it MUST NOT modify monitoring behavior without a current failing test

#### Scenario: Frontend P2 is verified without churn
- **WHEN** this change records frontend P2 status
- **THEN** it MUST point to the archived frontend runtime-quality scope or
  current frontend verification commands
- **AND** it MUST NOT modify frontend behavior without a current failing test

#### Scenario: Datasource P2 receives implementation evidence
- **WHEN** this change modifies datasource code
- **THEN** each modified P2 concern MUST have a targeted failing test recorded
- **AND** final evidence MUST include targeted tests plus repository-level
  datasource verification

### Requirement: Datasource REST routes share adapter error wrapping
TDX legacy and QMT REST routes SHALL translate adapter call failures through
shared route helpers instead of duplicating bare exception wrappers per endpoint.

#### Scenario: Route files are inspected
- **WHEN** repository hygiene tests inspect TDX legacy and QMT REST route files
- **THEN** those route files MUST NOT contain per-endpoint `except Exception`
  handlers
- **AND** shared dependency helpers MUST remain the only route-layer place that
  converts unexpected adapter exceptions into HTTP 500 responses

#### Scenario: Adapter call fails
- **WHEN** a TDX or QMT REST route adapter awaitable raises an unexpected
  exception
- **THEN** the shared helper MUST raise an HTTP 500 error with the same detail
  text shape as before

### Requirement: QMT WebSocket dependencies use app state
QMT WebSocket routing SHALL read runtime adapter and WebSocket manager
dependencies from FastAPI app state rather than importing `qmt.main` runtime
globals.

#### Scenario: Route source is inspected
- **WHEN** repository hygiene tests inspect QMT route files
- **THEN** QMT route files MUST NOT import `qmt.main` for runtime singletons

#### Scenario: WebSocket subscription uses injected adapter
- **WHEN** a test injects a QMT adapter through `app.state.qmt_adapter`
- **THEN** the QMT WebSocket subscription path MUST use that adapter
- **AND** canonical `WSMessage` pong, error, and subscription acknowledgement
  envelopes MUST remain unchanged

### Requirement: Datasource adapters centralize raw SDK exception conversion
TDX and QMT adapter clients SHALL catch raw SDK exceptions in adapter call
helpers rather than duplicating bare `Exception` handlers across public adapter
methods.

#### Scenario: Adapter source is inspected
- **WHEN** repository hygiene tests inspect TDX and QMT adapter clients
- **THEN** public adapter methods MUST NOT contain broad `except Exception`
  SDK wrappers
- **AND** only initialization, heartbeat, and low-level SDK call helpers MAY
  catch raw `Exception`

#### Scenario: Native SDK call fails
- **WHEN** a native TDX or QMT SDK call raises an unexpected exception
- **THEN** the adapter call helper MUST convert it to `AdapterError`
- **AND** existing method-level error messages MAY preserve their current
  operation-specific context by wrapping `AdapterError`

