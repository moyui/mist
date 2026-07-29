# datasource-provider-contract Specification

## Purpose
Defines provider-neutral datasource response, capability, endpoint, raw-call,
subscription, trading-boundary, and smoke-test expectations for TDX/QMT market
data providers.
## Requirements
### Requirement: Provider-neutral response contract
The datasource SHALL expose normalized responses that are independent of TDX,
QMT, or any provider-native SDK shape.

#### Scenario: Successful provider response
- **WHEN** a normalized datasource endpoint succeeds
- **THEN** the response includes `ok: true`, `requestId`, `provider`, `data`,
  `meta`, and `error: null`

#### Scenario: Provider failure response
- **WHEN** a provider cannot satisfy a normalized datasource request
- **THEN** the response includes `ok: false`, `data: null`, `provider`, and a
  stable error object with `code`, `message`, `retryable`, and `details`

#### Scenario: Provider-native payload is not exposed
- **WHEN** product code calls a normalized datasource endpoint
- **THEN** the endpoint returns provider-neutral fields and MUST NOT require the
  caller to parse TDX `Value` wrappers, pandas DataFrames, or QMT SDK objects

### Requirement: Provider capability manifest
The datasource SHALL expose provider capability metadata that describes which
normalized endpoint families each provider supports.

#### Scenario: TDX capability manifest is requested
- **WHEN** a client requests provider capability metadata for TDX
- **THEN** the datasource reports supported, unsupported, and experimental
  capability families without requiring a live data request

#### Scenario: QMT capability manifest is requested
- **WHEN** a client requests provider capability metadata for QMT
- **THEN** the datasource reports the same capability family names used for TDX
  and marks unavailable families explicitly

#### Scenario: Capability status changes
- **WHEN** an implementation adds or removes support for a normalized endpoint
  family
- **THEN** the provider capability manifest is updated in the same change as the
  endpoint implementation and tests

### Requirement: Normalized endpoint families
The datasource SHALL group public market-data functionality by provider-neutral
endpoint family rather than by provider method name.

#### Scenario: Market bars are queried
- **WHEN** a client queries historical or recent bars
- **THEN** the datasource uses the market-bars family and returns normalized bar
  objects with market-suffixed symbols, ISO 8601 `+08:00` timestamps, and
  numeric OHLCV fields

#### Scenario: Snapshots are queried
- **WHEN** a client queries latest market snapshots
- **THEN** the datasource uses the snapshots family and returns normalized
  snapshot objects with provider-independent price, volume, amount, and time
  fields

#### Scenario: Security metadata is queried
- **WHEN** a client queries tradable instruments or security details
- **THEN** the datasource uses security metadata endpoints instead of exposing
  provider-native stock-list or info method names directly

#### Scenario: Trading calendar is queried
- **WHEN** a client queries trading dates
- **THEN** the datasource uses a calendar endpoint that can be implemented by
  both TDX and QMT providers

#### Scenario: Non-trading reference data is queried
- **WHEN** a client queries reference, instrument, finance, report, or formula
  data
- **THEN** the datasource uses provider-neutral endpoint families and MUST NOT
  require callers to know whether TDX or QMT uses the same native method names

### Requirement: Explicit unsupported capabilities
The datasource SHALL return a stable unsupported-capability error when a
provider cannot implement a normalized endpoint family.

#### Scenario: QMT lacks a TDX-equivalent feature
- **WHEN** a client calls a normalized endpoint that QMT does not support
- **THEN** the datasource returns `PROVIDER_CAPABILITY_UNSUPPORTED` with the
  provider, capability family, requested operation, and recommended fallback in
  `details`

#### Scenario: Provider implementation is incomplete
- **WHEN** an endpoint family is listed as planned but not implemented for a
  provider
- **THEN** the provider capability manifest marks it unsupported or
  experimental and the endpoint MUST NOT silently return partial fake data

### Requirement: Raw provider calls are diagnostic-only
The datasource SHALL keep raw provider calls available only for diagnostics,
smoke verification, and temporary development workflows.

#### Scenario: Operator calls raw TDX method
- **WHEN** an operator calls `/v1/raw/tdx/call`
- **THEN** the datasource proxies the requested TDX method and returns the
  provider-native result without changing the normalized endpoint contract

#### Scenario: Product code needs a raw result
- **WHEN** regular NestJS product code depends on a raw TDX method
- **THEN** the method MUST be promoted to a normalized endpoint or explicitly
  rejected by review before the dependency is accepted

### Requirement: Subscription boundary
The datasource SHALL use provider-specific subscription APIs only behind the
normalized WebSocket subscription and event bridge.

#### Scenario: NestJS syncs subscriptions
- **WHEN** NestJS sends desired subscriptions over the datasource WebSocket
- **THEN** the provider implementation reconciles provider-native subscriptions
  internally and returns normalized accepted and rejected symbol sets

#### Scenario: Provider subscription callback arrives
- **WHEN** a provider callback reports that a symbol changed
- **THEN** the datasource converts it into normalized runtime state and bar
  collection work rather than forwarding provider-native callback payloads as
  product events

### Requirement: Trading operations are excluded
The market datasource SHALL NOT expose trading, account, order, or cancel
operations through normalized market-data endpoints.

#### Scenario: Trading method appears in provider documentation
- **WHEN** a provider offers account query, order, or cancel methods
- **THEN** those methods are classified outside the market datasource boundary
  and MUST NOT be exposed as ordinary datasource APIs

#### Scenario: Trading support is requested later
- **WHEN** Mist needs provider trading operations
- **THEN** a separate trading service design is required with authentication,
  audit logging, idempotency, account isolation, and risk controls

### Requirement: Admin and mutation utilities are separate from data endpoints
The datasource SHALL NOT mix provider client-control, file, message, refresh, or
mutation utilities into ordinary read-data endpoint families.

#### Scenario: Client utility is needed for operations
- **WHEN** an operator workflow needs a provider utility such as file sending,
  client messaging, cache refresh, or user-sector mutation
- **THEN** the utility is designed as an admin/operator capability or kept
  raw-only instead of being added to ordinary data endpoints

### Requirement: Contract and smoke tests
The datasource SHALL include tests that validate provider-native inputs,
normalized outputs, unsupported-provider behavior, and live smoke paths.

#### Scenario: TDX live smoke runs
- **WHEN** the Windows live smoke script runs against a logged-in TDX terminal
- **THEN** it validates native TDX HTTP shape first and then validates the
  normalized datasource response for the same operation

#### Scenario: QMT contract test runs
- **WHEN** QMT is unavailable or not configured
- **THEN** the QMT contract test can still validate manifest shape and explicit
  unsupported responses without requiring a live QMT terminal

### Requirement: QMT builtin experimental snapshot transport
The QMT datasource SHALL provide a mode-gated experimental WebSocket transport backed by the existing single-owner full-QMT command gateway and native `get_full_tick`, without changing historical bar responses or exposing the command bridge as a product API.

#### Scenario: Allowlisted subscriptions are active during a trading session
- **WHEN** an experimental WebSocket leader synchronizes valid QMT symbols and a fresh bridge owner is registered
- **THEN** the datasource polls one native snapshot command at a time and emits strictly validated, fenced snapshot frames

#### Scenario: Market is outside the supported session
- **WHEN** subscribed symbols exist outside their Beijing trading session
- **THEN** no native realtime command is enqueued and health reports the outside-session state

#### Scenario: Historical QMT bars are queried
- **WHEN** a client calls the existing QMT historical endpoint while experimental realtime is enabled or disabled
- **THEN** the historical request and native response contract are unchanged

### Requirement: QMT experimental health is loopback-only
The datasource SHALL expose detailed QMT experimental owner, epoch, subscription, freshness, and error state only through a loopback-protected health route.

#### Scenario: Remote caller requests experimental health
- **WHEN** a non-loopback caller requests `/qmt/realtime/health`
- **THEN** the datasource rejects the request without disclosing experimental state

### Requirement: TDX and QMT datasource contracts are separate
The datasource layer SHALL expose TDX and QMT through separate service
contracts rather than a shared `provider` selector in the TDX service.

#### Scenario: TDX v1 request models are inspected
- **WHEN** TDX v1 schemas are generated
- **THEN** request models MUST NOT include a `provider` field
- **AND** requests containing `provider` MUST be rejected as invalid input

#### Scenario: TDX provider metadata is requested
- **WHEN** a caller requests TDX `/providers`
- **THEN** the response MUST describe TDX only
- **AND** it MUST NOT advertise QMT capabilities from the TDX service

### Requirement: QMT bars keep native market-data shape
The QMT service SHALL return QMT historical bars in QMT native column shape.

#### Scenario: QMT historical bars are requested
- **WHEN** a caller requests QMT `:9002/v1/bars/query`
- **THEN** the response MUST return `data.marketData`
- **AND** it MUST NOT convert rows into the TDX `data.bars[]` contract
- **AND** it MUST NOT expose QMT bars through a TDX provider selector

#### Scenario: Cross-provider consumers need a common row shape
- **WHEN** Mist backend, charts, or strategy code needs to compare TDX and QMT
  historical bars
- **THEN** that caller or a backend-level adapter MUST perform the row shaping
- **AND** the QMT datasource MUST keep provider-native details behind its own
  QMT contract

### Requirement: QMT account and trading APIs remain outside market datasource
The QMT market datasource SHALL exclude account, position, order, deal, cancel,
and placement APIs.

#### Scenario: QMT account or trading method is requested
- **WHEN** a QMT market datasource route or bridge command attempts to expose
  account, position, order, deal, cancel, or placement behavior
- **THEN** static guardrails or runtime validation MUST reject it

### Requirement: Legacy QMT adapter surfaces are removed
The datasource SHALL remove legacy QMT adapter and mock surfaces from the
production code path.

#### Scenario: Repository guardrails inspect QMT production code
- **WHEN** guardrails scan production paths
- **THEN** they MUST fail on legacy QMT adapter factories, mock adapter classes,
  legacy QMT route groups, and bridge realtime-duplex endpoints

### Requirement: Internal realtime frames preserve provider native data

The datasource SHALL expose provider-native realtime objects only through the
authenticated internal realtime WebSocket envelope, while public normalized
`/v1` HTTP endpoints SHALL be limited to actively owned product capabilities.

#### Scenario: Internal realtime consumer receives a frame

- **WHEN** the authorized backend leader receives a TDX or QMT realtime frame
- **THEN** the frame contains the complete validated provider-native object and
  a source acquisition profile

#### Scenario: Public normalized endpoint is called

- **WHEN** a product caller requests historical bars
- **THEN** `/v1/bars/query` returns the existing provider-neutral response
  contract

#### Scenario: Removed snapshot endpoint is called

- **WHEN** a caller requests `/v1/snapshots/query`
- **THEN** the datasource returns HTTP 404
- **AND** no provider-specific alias or compatibility route is used

### Requirement: Realtime sequence scope is per symbol
Each datasource SHALL assign a sequence that is strictly monotonic for the same `(symbol, streamEpoch)` and SHALL declare `sequenceScope=symbol` in schema v1 frames.

#### Scenario: Multiple symbols share one QMT command result
- **WHEN** QMT emits frames for multiple symbols returned by one `get_full_tick` command
- **THEN** each symbol advances only its own sequence and does not depend on another symbol's sequence

### Requirement: Provider packages separate runtime and contract concerns
Each datasource realtime provider SHALL expose owner or command gateway behavior from `realtime/gateway.py` and frame validation or protocol constants from `realtime/contract.py`, while retaining provider-native objects without cross-provider normalization. Provider-specific runtime orchestration SHALL remain in a narrowly scoped runtime module only when that distinct responsibility exists.

#### Scenario: Realtime provider modules are imported
- **WHEN** TDX or QMT application wiring loads its realtime implementation
- **THEN** owner or command gateway logic comes from the provider-local `realtime/gateway.py`
- **AND** frame contract validation comes from the provider-local `realtime/contract.py`
- **AND** QMT subscription collector orchestration remains in `realtime/runtime.py`
- **AND** TDX does not retain a compatibility `realtime/runtime.py`

### Requirement: Runtime probe configuration is tooling-only
QMT runtime probing SHALL use `MIST_QMT_RUNTIME_PROBE_OUTPUT_PATH` only from the tooling probe and SHALL NOT expose spike evidence configuration through production datasource settings.

#### Scenario: Production QMT datasource settings load
- **WHEN** the QMT datasource starts without runtime probe tooling
- **THEN** no spike evidence directory is required or initialized

### Requirement: Normalized TDX bars reject incomplete required prices
The TDX datasource SHALL emit a normalized bar only when `open`, `high`, `low`, and `close` are present and finite for the same provider timestamp. It MUST distinguish an explicit numeric zero from a missing, blank, non-numeric, or non-finite value.

#### Scenario: Required price series are misaligned
- **WHEN** any required OHLC series lacks the timestamp emitted by another bar series
- **THEN** the normalized request fails with a structured error identifying the source, symbol, timestamp, and invalid fields
- **AND** no zero-price substitute or partial normalized result is emitted

#### Scenario: Provider explicitly returns zero
- **WHEN** the provider returns an explicit finite numeric zero for a required price
- **THEN** the normalizer preserves that zero as provider data
- **AND** does not classify it as a missing field

### Requirement: Historical volume and amount preserve exact provider numeric semantics

TDX and QMT normalized historical bars SHALL expose `volume` and `amount` as decimal strings or explicit `null`. A finite provider value, including zero, MUST preserve its numeric value without float coercion, integer rounding, or zero filling.

#### Scenario: Provider returns a finite decimal

- **WHEN** TDX or QMT returns a finite `volume` or `amount`
- **THEN** the normalized historical contract MUST emit a decimal string representing the same numeric value
- **AND** it MUST NOT round volume to an integer or truncate amount to two decimal places before persistence

#### Scenario: Provider explicitly returns zero

- **WHEN** TDX or QMT explicitly returns numeric zero for `volume` or `amount`
- **THEN** the normalized contract MUST emit a decimal string representing zero
- **AND** the value MUST remain distinguishable from `null`

#### Scenario: Provider omits or returns an invalid optional measure

- **WHEN** `volume` or `amount` is missing, blank, non-numeric, `NaN`, positive infinity, or negative infinity
- **THEN** the normalized contract MUST emit that field as explicit `null`
- **AND** it MUST NOT synthesize zero
- **AND** an otherwise valid bar MUST NOT be discarded solely because either measure is `null`

#### Scenario: Provider returns invalid OHLC

- **WHEN** any required OHLC value is missing, blank, non-numeric, `NaN`, or infinite
- **THEN** the existing invalid-nonempty-history rejection behavior MUST remain in force

### Requirement: Historical decimal values are bounded before persistence

The datasource and backend SHALL reject finite `volume` or `amount` values that cannot fit `DECIMAL(36,8)` without rounding.

#### Scenario: Decimal exceeds configured precision or scale

- **WHEN** a finite provider value has more than 28 integer digits or more than eight fractional digits
- **THEN** the historical work item MUST fail validation
- **AND** no matching K row may be partially written or silently rounded
