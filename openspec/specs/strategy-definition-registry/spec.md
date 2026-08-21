## Purpose

Define Mist strategy platform foundations for versioned declarative strategy
definitions, lifecycle APIs, rule validation, persisted signal/alert
boundaries, and reserved signal-level backtest interfaces.
## Requirements
### Requirement: Strategy Definitions Shall Be Versioned

Mist SHALL store business strategy identity separately from its immutable strategy rule version. V1 SHALL create
exactly one version with each new definition and SHALL NOT expose a definition-content update path.

#### Scenario: A strategy is created

- **WHEN** a client creates a strategy definition with valid metadata, one declarative rule and one signal kind
- **THEN** the backend MUST persist one `StrategyDefinition`
- **AND** it MUST persist initial `StrategyVersion` number `1`
- **AND** the definition MUST reference that version as its current version
- **AND** all three writes MUST commit or roll back together

#### Scenario: A strategy is updated

- **WHEN** a client attempts to change an existing definition's metadata, rule or signal kind
- **THEN** the backend MUST NOT expose `PATCH /v1/strategies/:id` or another content-update route
- **AND** the client MUST create a new strategy definition instead
- **AND** the old definition, immutable version and historical references MUST remain unchanged

#### Scenario: A current version is resolved

- **WHEN** the backend resolves a definition current version
- **THEN** the version MUST exist
- **AND** its `strategyDefinitionId` MUST equal the definition ID
- **AND** V1 MUST NOT provide an operation that changes the current-version pointer after creation

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

The strategy registry SHALL expose public APIs from `apps/mist` using `/v1/<resource>` paths and SHALL keep
definition content creation-only.

#### Scenario: Registry route metadata is inspected

- **WHEN** strategy controller route metadata is inspected
- **THEN** it MUST expose `/v1/strategies`
- **AND** it MUST expose detail, enable, disable, and read-only version routes below `/v1/strategies/:id`
- **AND** it MUST NOT expose PATCH or another strategy-content update route
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

### Requirement: Decimal Strategy Thresholds Shall Remain Decimal Strings
Rules over `k.volume` or `k.amount` SHALL accept only non-negative decimal-string thresholds and SHALL reject
numeric JSON thresholds without automatic conversion. Strategy creation MAY normalize the approved unsigned
fixed-point input grammar once, but persisted rules and all later compilation boundaries SHALL require the
unique canonical string.

#### Scenario: A decimal field uses a numeric threshold
- **WHEN** a definition is created, loaded, enabled or registered for realtime
- **THEN** validation MUST reject the rule explicitly

#### Scenario: A decimal field uses a canonical string threshold
- **WHEN** a definition is created, loaded, enabled or registered with `k.volume` or `k.amount`
- **THEN** validation MUST parse the threshold through the shared scale-eight `Decimal8` capability
- **AND** the rule and every serialized snapshot MUST retain the canonical decimal string rather than raw
  bigint
- **AND** the strategy registry MUST NOT implement a second decimal parser or comparator

#### Scenario: Strategy creation receives a normalizable string threshold
- **WHEN** create input supplies `"001.2300"` or `"0.00000000"` for `k.volume` or `k.amount`
- **THEN** the create validator MUST check the raw unsigned fixed-point grammar and scale before trimming zeros
- **AND** it MUST persist only canonical `"1.23"` or `"0"`, respectively

#### Scenario: Strategy creation receives unsupported decimal text
- **WHEN** a threshold contains more than eight raw fractional digits, whitespace, a sign, exponent notation,
  omitted integer or fractional digits, a locale separator, a non-ASCII digit, a negative value or more than
  37 ASCII characters
- **THEN** creation MUST reject it explicitly
- **AND** it MUST NOT trim, round, localize or reinterpret the input

#### Scenario: Strategy creation receives excessive leading zeros
- **WHEN** an otherwise in-range decimal threshold exceeds 37 ASCII characters only because of leading zeros
- **THEN** request-contract validation MUST reject it before decimal parsing or normalization
- **AND** the HTTP body-size limit MUST NOT be treated as the decimal field limit

#### Scenario: A persisted threshold is not canonical
- **WHEN** load, enable, backtest compilation or realtime registration finds an alternate equivalent spelling
  such as `"01.2300"`
- **THEN** it MUST fail closed rather than rewrite stored immutable rule JSON

### Requirement: Strategy Rule Trees Shall Be Structurally Bounded
The shared strategy validator and compiler SHALL treat the root expression as depth `1`, SHALL accept at most
depth `8` and at most `64` condition nodes in the complete rule tree, and SHALL stop validation immediately
before entering depth `9` or accepting condition `65`. These values SHALL be versioned code constants shared by
`apps/mist`, `apps/backtest` and `apps/signal`; they SHALL NOT be environment configuration or be replaced by an
HTTP body-size limit.

#### Scenario: A rule reaches an accepted structural boundary
- **WHEN** a rule contains at most 64 conditions and every root-to-condition path has depth at most 8
- **THEN** structural validation MUST continue to exact-shape, catalog, operator and value validation
- **AND** a single-child group or repeated condition MUST NOT be silently simplified or deduplicated

#### Scenario: A rule is too deep
- **WHEN** validation would enter a node at depth 9
- **THEN** validation MUST reject the rule before recursively visiting that node
- **AND** it MUST NOT rely on recursion failure or the enclosing transport size limit

#### Scenario: A rule has too many conditions
- **WHEN** validation observes a 65th condition anywhere in the tree
- **THEN** it MUST reject the rule immediately
- **AND** it MUST NOT compile or persist a partial execution plan

#### Scenario: A rule node has an inexact shape
- **WHEN** a group contains anything other than exactly one non-empty `all` or `any` array, or a condition
  contains anything other than exactly `field`, `operator` and `value`
- **THEN** validation MUST reject the node, including mixed group/condition fields, `lookbackBars`, metadata or
  any other unknown key
- **AND** it MUST NOT discard or preserve the unknown field as compatibility data

#### Scenario: Persisted rule data violates a structural bound
- **WHEN** load, enable, backtest compilation or realtime registration finds an oversized or inexact stored rule
- **THEN** it MUST treat the rule as an internal data invariant violation and fail closed
- **AND** it MUST NOT trim, rewrite, mark the evaluation unavailable or publish a partial Signal registry

#### Scenario: Evaluation begins
- **WHEN** backtest or realtime evaluates a strategy for one bar
- **THEN** the evaluator MUST consume an already validated immutable execution plan
- **AND** it MUST NOT recursively revalidate raw rule JSON for every bar

### Requirement: Strategy Definitions Shall Not Store Caller-Owned Lookback
Strategy definitions SHALL derive bounded context demand during validation and compilation rather than expose
or persist a caller-owned `lookbackBars` field.

#### Scenario: A strategy version is registered
- **WHEN** its rule is compiled for backtest or realtime eligibility
- **THEN** the immutable execution plan MUST contain the derived `requiredBarCount`
- **AND** the public DTO, rule JSON and database schema MUST NOT contain a caller-owned lookback field

### Requirement: Strategy Versions Shall Declare One Signal Kind
Each immutable strategy version SHALL persist one rule and one required `signalKind='entry'|'exit'`. Public
create contracts SHALL use that same shape, and V1 SHALL NOT expose a content-update contract.

#### Scenario: A strategy version is created
- **WHEN** its contract is validated
- **THEN** it MUST contain exactly one `rule` and one valid `signalKind`
- **AND** it MUST reject missing or unknown signal kind values
- **AND** it MUST NOT accept `entryRule`, `exitRule`, a nullable exit rule or a pairing identifier

#### Scenario: A strategy is registered for a runtime
- **WHEN** its current immutable version is compiled
- **THEN** the resulting execution plan MUST retain the version's signal kind
- **AND** backtest and realtime MUST NOT override that kind

### Requirement: Contract Evolution Shall Follow A Production Schema Audit
Any change to persisted strategy rule shape or identity SHALL use a new forward-only migration based on
verified production schema and stored rule distribution.

#### Scenario: A strategy migration is proposed
- **WHEN** production `schema_migrations` or stored JSON differs from the reviewed baseline
- **THEN** implementation MUST stop
- **AND** a repair-forward plan MUST be reviewed

#### Scenario: The zero-strategy-data assumption is checked
- **WHEN** the signal-kind migration preflight runs against the target MySQL schema
- **THEN** it MUST read and report the relevant definition, version, signal, AlertEvent, backtest run and result
  row counts before any DDL
- **AND** the no-backfill migration MAY proceed only when all relevant counts are zero
- **AND** the final `strategy_versions.signal_kind` column MUST be non-null without a database default

#### Scenario: Any existing strategy data is found
- **WHEN** any relevant preflight count is non-zero
- **THEN** migration MUST stop before DDL and request a new data-disposition decision
- **AND** it MUST NOT infer a signal kind, default existing rows to entry, delete data or add nullable/legacy
  compatibility behavior

### Requirement: Signal Runtime Registry Shall Refresh After Strategy Commits
After an owning strategy enable/disable transaction commits, `apps/mist` SHALL request an explicit versioned
refresh of the Signal runtime's immutable registry without placing RPC inside the database transaction. Strategy
definition content SHALL remain creation-only.

#### Scenario: Signal starts with persisted strategies
- **WHEN** Signal performs its startup registry load
- **THEN** it MUST read all enabled definitions and current versions once
- **AND** every accepted current version MUST compile its single rule with its required signal kind into one
  immutable execution plan
- **AND** it MUST publish the complete valid snapshot as process-local registry generation `1`
- **AND** it MUST NOT periodically poll or reload the full registry for each trigger

#### Scenario: A strategy mutation is committed for live consumption
- **WHEN** enable or disable commits
- **THEN** the persisted definition/version transaction MUST remain authoritative
- **AND** `apps/mist` MUST request `signal.registry.refresh.v1` with only `strategyDefinitionId`
- **AND** Signal MUST read that aggregate from MySQL rather than accepting a duplicated rule snapshot in the
  command
- **AND** the RPC wait MUST NOT execute inside the database transaction

#### Scenario: A strategy remains enabled after refresh
- **WHEN** the refreshed aggregate is enabled and valid
- **THEN** the next immutable registry generation MUST copy-on-write upsert that definition and current version
- **AND** it MUST preserve the version's required signal kind without runtime override
- **AND** a later operation MUST use the new snapshot

#### Scenario: A strategy leaves the enabled lifecycle state
- **WHEN** a committed refresh reads a missing, draft, disabled or archived definition
- **THEN** the next registry generation MUST remove that definition
- **AND** an in-flight operation MAY finish using the immutable snapshot it captured before cutover
- **AND** a later operation MUST NOT use the removed definition

#### Scenario: Runtime refresh is not confirmed
- **WHEN** the database mutation committed but refresh query, validation, connection, handler, timeout or
  cutover fails
- **THEN** Signal MUST preserve the prior immutable runtime registry and generation
- **AND** the public mutation MUST expose committed-but-unknown runtime state using the approved typed technical
  error
- **AND** it MUST NOT claim that the database transaction rolled back
- **AND** no polling, outbox, automatic retry or database generation column MAY be added in V1
- **AND** the next Signal startup full load MUST remain the only automatic convergence mechanism
