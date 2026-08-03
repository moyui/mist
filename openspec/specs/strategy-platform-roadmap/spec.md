## Purpose

Strategy platform roadmap governs Mist product expansion for strategy
registration, realtime signal alerts, signal-level backtesting, operator UX,
scheduled scans, and alert delivery boundaries without directly implementing
runtime code.
## Requirements
### Requirement: Strategy Platform Roadmap Shall Govern Product Expansion

The strategy platform roadmap SHALL define the product-scope sequence for
strategy registration, realtime signal alerts, and signal-level backtesting
without directly implementing runtime code.

#### Scenario: A strategy platform implementation is requested

- **WHEN** work begins on strategy registration, signal alerts, or backtesting
- **THEN** the work MUST enter a focused child OpenSpec change
- **AND** the child change MUST reference this roadmap or a newer superseding
  roadmap

### Requirement: Child Changes Shall Remain Independently Scoped

The roadmap SHALL decompose strategy platform work into independently
spec-able, testable, and archivable child changes.

#### Scenario: A child strategy change is created

- **WHEN** a follow-up OpenSpec change is created for the strategy platform
- **THEN** it MUST state owner repositories, runtime impact, API or data-model
  impact, validation commands, live-runtime relevance, and archive criteria

### Requirement: New Strategy APIs Shall Use Version-First Paths

Strategy platform APIs SHALL use the `/v1/<resource>` backend path style and
MUST NOT introduce feature-local version paths such as `/strategy/v1/*`.

#### Scenario: Strategy API child change is created

- **WHEN** a child change defines strategy registration, signal, alert, or
  backtest endpoints
- **THEN** the endpoints MUST use `/v1/strategies`,
  `/v1/strategy-signals`, `/v1/strategy-alert-events`, or
  `/v1/strategy-backtests`
- **AND** the child change MUST keep production gateway prefixes such as
  `/api/mist` and `/api/chan` out of controller path definitions

### Requirement: Existing Business APIs Shall Be Standardized Through Aliases

The roadmap SHALL include a child change that standardizes mixed existing Mist
business API paths by adding `/v1/<resource>` aliases before clients migrate.

#### Scenario: API style standardization child change is created

- **WHEN** `standardize-mist-v1-api-paths` or its successor is created
- **THEN** it MUST define `/v1` aliases for security, indicator, and Chan
  business endpoints
- **AND** after frontend, skills, smoke tests, and docs are migrated it MUST
  remove existing `/security/v1/*`, `/indicator/*`, and `/chan/*` route
  registrations

### Requirement: Strategy Platform Shall Use Mist For Public APIs

The strategy platform SHALL place public REST APIs in `apps/mist` and SHALL NOT
make `apps/schedule` the public API owner.

#### Scenario: Strategy API implementation is planned

- **WHEN** a child change defines strategy registration, signal query, alert
  acknowledgement, or backtest request endpoints
- **THEN** the endpoint controllers MUST belong to the Mist backend API surface
- **AND** the schedule app MUST NOT expose those public strategy endpoints

### Requirement: Shared Strategy Definition Shall Come First

The first implementation child change SHALL define a shared strategy
definition model that can be consumed by both realtime signal detection and
historical signal backtesting.

#### Scenario: Alert or backtest work starts before strategy definitions

- **WHEN** a child change proposes alert scanning or signal backtesting
- **THEN** it MUST either depend on `add-strategy-definition-registry`
- **OR** explicitly include the shared definition contract needed by both
  realtime and historical execution

### Requirement: Strategy Platform Shall Define A Shared Landing Model

The roadmap SHALL define a shared landing model for strategy definitions,
evaluation, signals, alert events, and signal-level backtesting.

#### Scenario: Strategy definition child change is created

- **WHEN** `add-strategy-definition-registry` or its successor is created
- **THEN** it MUST define `StrategyDefinition`, `StrategyVersion`,
  `StrategyEvaluationContext`, `StrategyEvaluationResult`, `StrategySignal`,
  `StrategyAlertEvent`, `BacktestRun`, and `BacktestSignalResult` boundaries
- **AND** it MUST explain which boundaries are implemented immediately and
  which are reserved for later backtest child changes

### Requirement: Initial Strategy Expressions Shall Be Declarative

The first strategy-definition phase SHALL use declarative, persisted, and
validated rule expressions instead of arbitrary user-provided code.

#### Scenario: A first-phase strategy definition is proposed

- **WHEN** the child change defines how users register strategy logic
- **THEN** it MUST model rules as declarative expressions over known Mist data
  or computed analysis outputs
- **AND** it MUST NOT require arbitrary user JS, Python, SQL, or shell code

### Requirement: Product Strategy Names Shall Avoid Runtime Strategy Ambiguity

The roadmap SHALL keep product strategy terminology separate from existing data
collection strategies and TDX/QMT desktop strategy identity.

#### Scenario: A strategy platform child change names types or modules

- **WHEN** the child change introduces product strategy entities, DTOs, APIs, or
  UI labels
- **THEN** it MUST avoid implying that collector `DataCollectionStrategy`
  classes or datasource-side TDX/QMT strategy identities are business trading
  strategies

### Requirement: Signal Alerts Shall Follow Strategy Definition

The roadmap SHALL prioritize realtime or near-realtime signal detection and
alert events after the shared strategy definition foundation.

#### Scenario: Alert child change is created

- **WHEN** `add-strategy-signal-alerts` or its successor is created
- **THEN** it MUST define how enabled strategy definitions are scanned
- **AND** it MUST define persisted signal and alert event semantics
- **AND** it MUST define validation for duplicate suppression or alert
  cooldown behavior

### Requirement: Alerts Shall Persist Backend Events Before Delivery

Mist SHALL own strategy signal and alert event persistence before AstrBot or
other delivery surfaces consume the events.

#### Scenario: AstrBot alert integration is planned

- **WHEN** a child change adds AstrBot or `mist-skills` behavior for strategy
  alerts
- **THEN** it MUST consume Mist backend signal or alert events
- **AND** it MUST NOT make AstrBot or `mist-skills` the primary strategy rule
  execution engine

### Requirement: Initial Backtesting Shall Be Signal-Level

The first backtesting phase SHALL replay declarative strategy definitions over
historical market data and produce signal-level results, not portfolio-level
execution simulation.

#### Scenario: Backtest child change is created

- **WHEN** `add-strategy-signal-backtesting` or its successor is created
- **THEN** it MUST define inputs for strategy, target universe, period, and time
  range
- **AND** it MUST define outputs for signal occurrences and aggregate signal
  statistics
- **AND** it MUST exclude cash, positions, orders, fees, slippage, and portfolio
  allocation unless a later portfolio-backtesting child change is created

### Requirement: Backtest Interfaces Shall Be Reserved Early

The strategy definition foundation SHALL reserve backtest-facing DTO and
service boundaries so live strategy semantics can be replayed later without a
second rule model.

#### Scenario: Strategy registry child change defines API and service shape

- **WHEN** the child change defines strategy registry DTOs or services
- **THEN** it MUST reserve a backtest request shape containing strategy version,
  target universe, period, source, start date, and end date
- **AND** it MUST reserve a signal-level response shape containing run status,
  signal count, matched security count, timestamps, and signal result access
- **AND** it MUST keep portfolio-level performance fields out of the reserved
  first-phase interface

### Requirement: Frontend Strategy UX Shall Follow Backend Contracts

The frontend operator experience SHALL be planned after backend strategy
definition, signal, alert, and backtest contracts are specified.

#### Scenario: Strategy frontend work is proposed

- **WHEN** a child change proposes strategy editor, signal list, alert state, or
  backtest result screens
- **THEN** it MUST name the backend contracts it depends on
- **AND** it MUST continue using Mist backend APIs rather than calling
  datasource services directly

### Requirement: Roadmap Disposition Shall Be Tracked

The roadmap SHALL remain open until each child item has an explicit
disposition.

#### Scenario: Strategy roadmap is considered for archive

- **WHEN** this roadmap is ready to be archived
- **THEN** each child item MUST be marked completed, archived, superseded,
  deferred, or dropped
- **AND** deferred or dropped items MUST include a reason

### Requirement: Realtime Strategy Delivery Shall Use Focused Child Changes
The roadmap SHALL deliver current-day candles, analysis kernels, strategy evaluation contracts, realtime
evaluation and notification delivery through separately reviewable child changes.

#### Scenario: Realtime strategy work is scheduled
- **WHEN** implementation ordering is prepared
- **THEN** candle, analysis, contract, evaluation and notification work MUST retain separate ownership and archive criteria
- **AND** a downstream change MUST NOT begin before its declared prerequisite gates pass

#### Scenario: Shared strategy contracts and runtime adapters are scheduled
- **WHEN** Backtest and realtime Signal implementation are planned
- **THEN** `evolve-strategy-evaluation-contract` MUST first establish the common StrategyBar, market-data port,
  evaluator and context contracts
- **AND** `extract-backtest-runtime` MAY then implement its replay adapter independently
- **AND** `run-realtime-strategy-evaluation` MAY then implement its realtime adapters after the candle gate also passes
- **AND** neither runtime change MUST be a prerequisite of the other

### Requirement: Service Boundary Standardization Shall Precede Runtime RPC
The roadmap SHALL complete `standardize-service-boundary-contracts` before connecting Backtest or Signal
runtime RPC handlers.

#### Scenario: A runtime child change reaches RPC implementation
- **WHEN** `extract-backtest-runtime` or `run-realtime-strategy-evaluation` is ready to add product code
- **THEN** the shared HTTP/RPC transport change MUST have passed its acceptance gates
- **AND** the runtime change MUST define only its domain-specific pattern, payload and error codes

### Requirement: Backtest Runtime Extraction Shall Remain Independently Scoped
The roadmap SHALL use `extract-backtest-runtime` for moving historical replay into `apps/backtest`, separate
from realtime evaluation and portfolio simulation.

#### Scenario: Backtest execution is moved out of the public API process
- **WHEN** the runtime extraction is implemented
- **THEN** it MUST depend on the approved shared analysis and evaluation contracts
- **AND** it MUST retain independent validation and archive criteria

### Requirement: Chan Extraction Shall Not Gate Strategy Runtime Delivery
The roadmap SHALL treat ChanCore extraction and Strategy-owned Indicator evaluation as independent workstreams.

#### Scenario: Backtest or Realtime prerequisites are evaluated
- **WHEN** implementation gates are checked
- **THEN** `evolve-strategy-evaluation-contract` MUST own the shared Strategy Indicator calculation contract
- **AND** `extract-chan-core` MUST NOT be a prerequisite unless that runtime explicitly adopts a future approved
  `chan.*` field
