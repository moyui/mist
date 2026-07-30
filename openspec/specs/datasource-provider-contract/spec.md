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

The datasource SHALL expose `sync_subscriptions`, `subscribe`, `unsubscribe` and `get_subscriptions` through its authenticated internal realtime WebSocket while implementing provider-native control behind provider-local gateways. Realtime provider callbacks SHALL be forwarded as validated native snapshots rather than converted into history/bar work.

#### Scenario: NestJS syncs subscriptions

- **WHEN** NestJS sends an exact desired provider-symbol set
- **THEN** QMT MUST use its whole/single native methods and TDX MUST use its bridge/HTTP mechanisms
- **AND** both MUST return the simple provider-specific success-or-failure response

#### Scenario: Provider subscription callback arrives

- **WHEN** QMT reports a native callback map
- **THEN** datasource MUST preserve the callback map for the internal native snapshot frame
- **AND** it MUST not schedule a historical or current-K query

#### Scenario: NestJS changes one symbol

- **WHEN** NestJS sends one explicit `subscribe` or `unsubscribe`
- **THEN** datasource MUST apply the provider-specific single-symbol semantics
- **AND** it MUST not infer or advertise a common provider handle model

#### Scenario: External mutation surface is inspected

- **WHEN** application routes and datasource HTTP endpoints are inspected
- **THEN** subscription mutation MUST remain available only on the authenticated
  internal provider WebSocket
- **AND** this change MUST NOT add a product HTTP, frontend, CLI or diagnostic
  mutation endpoint
- **AND** the absence of such an endpoint MUST NOT be treated as an unimplemented
  WebSocket control method

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
authenticated internal realtime WebSocket envelope while normalized public
`/v1` HTTP endpoints remain unchanged. TDX and QMT SHALL use one exact
schema-v2 formal frame with provider-symbol-keyed `data.native`.

#### Scenario: Internal realtime consumer receives a frame

- **WHEN** the authorized backend leader receives a TDX or QMT realtime frame
- **THEN** the frame MUST contain the complete validated provider-native object
  under its provider-symbol key
- **AND** it MUST use schema v2 without acquisition profile, formal epoch or
  sequence fields

#### Scenario: QMT callback enters datasource

- **WHEN** datasource accepts a callback wrapper
- **THEN** the complete `{code: tickData}` map MUST become formal QMT `data.native`
- **AND** datasource MUST not flatten it or calculate canonical fields

#### Scenario: TDX snapshot enters datasource

- **WHEN** datasource accepts the existing TDX terminal snapshot
- **THEN** datasource MUST use the separate bridge request `symbol` as the sole
  key of a one-entry formal `data.native` map
- **AND** the TDX native object value MUST remain unchanged
- **AND** formal output MUST NOT contain acquisition profile, stream epoch,
  sequence, sequence scope or standalone symbol

#### Scenario: Public normalized endpoint is called

- **WHEN** a product caller uses an existing `/v1` history or snapshot query
- **THEN** that endpoint's current response contract MUST remain unchanged

#### Scenario: Removed snapshot endpoint is called

- **WHEN** a caller requests `/v1/snapshots/query`
- **THEN** the datasource MUST return HTTP 404
- **AND** no provider-specific alias or compatibility route may be used

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

### Requirement: Bridge snapshot requests use provider-local owner fences

TDX and QMT bridge→datasource snapshot requests SHALL share only
`leaseToken`, `capturedAt` and `native`. TDX SHALL additionally carry
`streamEpoch` and `symbol`; QMT SHALL additionally carry `ownerId`,
`generation` and `subscriptionId`. Neither request SHALL carry a producer
sequence, event identity or retry metadata.

#### Scenario: TDX submits a native snapshot

- **WHEN** TDX bridge has one `get_market_snapshot` result
- **THEN** the exact provider extension MUST be `symbol`
- **AND** the request MUST NOT contain `producerSequence`
- **AND** bridge MUST attempt the snapshot POST only once
- **AND** success MUST be represented only by HTTP 2xx without item
  `accepted`, formal `sequence` or retry fields

#### Scenario: QMT submits a callback map

- **WHEN** QMT bridge drains one accepted callback item
- **THEN** the exact provider extension MUST be `subscriptionId`
- **AND** provider symbols MUST remain keys in `native`
- **AND** the owner fence MUST be the existing
  `ownerId + leaseToken + generation`
- **AND** the request MUST NOT contain a producer sequence or standalone symbol

#### Scenario: Datasource accepts a TDX snapshot

- **WHEN** the TDX request passes lease, symbol and native validation
- **THEN** datasource MUST wrap it as one schema-v2 native-map entry
- **AND** it MUST NOT assign, require, reconstruct or compare any sequence

#### Scenario: Either snapshot submission fails

- **WHEN** a bridge snapshot POST fails, times out or receives no usable response
- **THEN** neither bridge MUST retry, replay or backfill that observation
- **AND** later equal provider state MAY be submitted as another observation

### Requirement: Datasource control names align while provider results remain native

TDX and QMT datasource implementations SHALL use the same four backend-facing operation names and the same minimal `success|failure` envelope. They MUST retain provider-specific execution and success values.

#### Scenario: QMT control succeeds

- **WHEN** a QMT subscribe succeeds
- **THEN** `success` MUST carry its exact integer subscription ID, including `0`
- **AND** `get_subscriptions` MUST return exactly the two logical buckets
  `whole{subId,symbols}|null` and `singles{providerSymbol:subId}`

#### Scenario: TDX control succeeds

- **WHEN** TDX `sync_subscriptions`, `subscribe` or `unsubscribe` succeeds
- **THEN** `success` MUST be null after the current terminal bridge's fresh native subscription list proves the operation postcondition
- **AND** datasource MUST not synthesize QMT-style IDs

#### Scenario: TDX subscriptions are listed

- **WHEN** TDX `get_subscriptions` succeeds
- **THEN** datasource MUST first request a new terminal-native list probe through a private read barrier
- **AND** `success` MUST contain the normalized provider-symbol list reported for that probe by the current owner/epoch/revision
- **AND** datasource MUST not wrap it in a QMT-style registry

#### Scenario: Capability parity is checked

- **WHEN** repository guards inspect the two provider implementations
- **THEN** all four callable capabilities and their tests MUST exist on both sides
- **AND** a stub, unconditional success implementation or filename-only counterpart MUST fail

### Requirement: TDX mutations update one transport desired target

The TDX datasource SHALL serialize `sync_subscriptions`, `subscribe` and
`unsubscribe` through one source-local mutation gate. Before provider mutation
begins, it SHALL atomically update the existing transport desired state and
internal revision to the exact sync set, current union or current difference
respectively. This transport target SHALL not be exposed as a business desired
coordinator or as a backend-facing revision.

#### Scenario: Direct unsubscribe changes the reconcile target

- **WHEN** datasource accepts `unsubscribe` for a TDX symbol
- **THEN** the symbol MUST be removed from transport desired before the bridge
  executes native `unsubscribe_hq` and fresh-list verification
- **AND** provider or verification failure MUST NOT restore the previous target
- **AND** bridge reconcile MUST NOT subscribe the symbol from the superseded
  desired state

#### Scenario: Full sync changes the reconcile target before clear

- **WHEN** datasource accepts `sync_subscriptions`
- **THEN** the exact normalized requested set MUST become transport desired
  before the first bridge-native clear step
- **AND** bridge work exposed during the orchestration MUST be absent or derived
  only from that target

### Requirement: Unsubscribe failures expose one provider-independent state hint

An unsuccessful backend-facing `unsubscribe` response SHALL carry exactly
`failure{symbol,reason,subscriptionState}`. `subscriptionState` SHALL be
`subscribed|unknown`; it SHALL describe only whether current authoritative
evidence proves continued membership, not a provider lifecycle model.
Non-cancellation failures SHALL continue to carry exactly
`failure{symbol,reason}`.

#### Scenario: TDX terminal-native list proves continued subscription

- **WHEN** a fresh current-owner TDX post-unsubscribe native list still contains the symbol
- **THEN** datasource MUST return reason `TDX_UNSUBSCRIBE_NOT_CONVERGED`
- **AND** `subscriptionState` MUST be `subscribed`

#### Scenario: TDX postcondition cannot be read

- **WHEN** the TDX native list probe fails, times out, is fenced or cannot be normalized after the cancellation attempt
- **THEN** datasource MUST return reason `TDX_UNSUBSCRIBE_VERIFY_FAILED`
- **AND** `subscriptionState` MUST be `unknown`

#### Scenario: TDX cancellation is proven complete

- **WHEN** a fresh current-owner native list no longer contains the symbol
- **THEN** datasource MUST return `success:null` regardless of the immediate `unsubscribe_hq` text, `ErrorId`, payload or invocation exception
- **AND** raw provider details MUST remain outside the backend-facing response

#### Scenario: QMT cancellation is unconfirmed

- **WHEN** `unsubscribe_quote` does not produce exact bool `true` or an
  explicitly HIL-qualified integer success value
- **THEN** datasource MUST return reason `QMT_UNSUBSCRIBE_UNCONFIRMED`
- **AND** `subscriptionState` MUST be `unknown`
- **AND** the original ID MUST remain in its registry bucket and journal

#### Scenario: QMT exact false remains unconfirmed

- **WHEN** exact bool `false` is returned
- **THEN** datasource MUST return
  `QMT_UNSUBSCRIBE_UNCONFIRMED/subscriptionState=unknown`
- **AND** callback silence or progress from another subscription MUST NOT
  promote it to success

#### Scenario: QMT cancellation is confirmed but its transition is not durable

- **WHEN** `unsubscribe_quote` produces exact bool `true` or an explicitly
  HIL-qualified integer success value but datasource cannot make the result and
  registry transition durable
- **THEN** datasource MUST return reason `QMT_JOURNAL_DURABILITY_FAILED`
- **AND** `subscriptionState` MUST be `unknown`
- **AND** the original ID MUST remain in its public registry bucket as a private `retained-recovery` candidate
- **AND** that retention MUST NOT claim provider membership, trigger automatic repeated cancellation or permit replacement subscription

#### Scenario: QMT symbol belongs to the whole handle

- **WHEN** individual unsubscribe targets a symbol in `whole.symbols`
- **THEN** datasource MUST return reason `QMT_SYMBOL_OWNED_BY_WHOLE`
- **AND** `subscriptionState` MUST be `subscribed`
- **AND** it MUST NOT call `unsubscribe_quote`

#### Scenario: Full synchronization fails during cancellation

- **WHEN** the deterministic first backend-facing reset failure comes from a
  provider cancellation step
- **THEN** it MUST use the same
  `failure{symbol,reason,subscriptionState}` variant
- **AND** a whole-handle failure MAY use `symbol=null`

#### Scenario: Monitoring consumes an unsubscribe failure

- **WHEN** datasource records either provider's unsubscribe failure
- **THEN** the shared metric MUST continue using only
  `{source,operation,result,reason}`
- **AND** `subscriptionState`, provider symbol, raw response and QMT subId MUST NOT become metric labels

### Requirement: QMT realtime and QMT history remain separate contracts

QMT historical queries SHALL continue to use the existing command/result mechanism and `get_market_data_ex(..., subscribe=False)`. Realtime SHALL use callback snapshots and SHALL not mutate historical request/response contracts.

#### Scenario: Realtime mode is off

- **WHEN** `QMT_REALTIME_MODE=off`
- **THEN** QMT realtime control and snapshot output MUST be disabled
- **AND** historical queries MUST remain operational

#### Scenario: Callback is received during a history request

- **WHEN** realtime and historical activity overlap
- **THEN** each MUST use its own route and result lifecycle
- **AND** a callback MUST not complete or overwrite the one-shot history command

### Requirement: QMT callback contract preserves the documented tick object

The accepted QMT native map SHALL use the official callback outer shape and preserve each inner data object as the logical `get_full_tick` snapshot structure. Field equivalence SHALL NOT imply that every exchange tick was transported.

#### Scenario: Official whole callback contains multiple codes

- **WHEN** `subscribe_whole_quote` reports several changed symbols
- **THEN** every code/data pair MUST remain present in one native map
- **AND** datasource MUST validate provider-symbol syntax and current handle membership per code
- **AND** this datasource membership check MUST NOT be named or implemented as the Mist source business allowlist

#### Scenario: Runtime uses an accepted field alias

- **WHEN** an HIL-approved fixture contains provider-specific time or order-book field names
- **THEN** datasource MUST preserve the exact keys and values
- **AND** it MUST not choose a preferred alias

#### Scenario: Provider business time crosses datasource

- **WHEN** QMT native contains `time/stime/timetag` candidates or TDX native
  contains its fixture-backed business-time field
- **THEN** datasource MUST forward those provider-native values unchanged
- **AND** it MUST NOT parse, select, normalize or replace them
- **AND** `capturedAt` and datasource send `timestamp` MUST remain measurement
  metadata rather than provider business-time fallbacks

#### Scenario: Whole callback reports changed symbols

- **WHEN** official/runtime whole callback behavior reports only symbols whose latest full-push value changed
- **THEN** datasource MUST preserve those native snapshots as `latest-state`
- **AND** it MUST not infer tick completeness from full native field presence

### Requirement: Current-K refresh has a distinct data meaning

QMT `get_market_data_ex(period='1m', count=1)` output, if introduced by a future change, SHALL be modeled as a provider current-K record rather than a native realtime tick.

#### Scenario: Callback data is sufficient

- **WHEN** single and whole callback fixtures satisfy the native tick decoder
- **THEN** realtime MUST transmit callback native data directly
- **AND** it MUST not perform a second current-K query

#### Scenario: Callback data is incompatible

- **WHEN** Windows HIL proves the callback cannot satisfy the intended native contract
- **THEN** this release MUST stop
- **AND** it MUST not silently substitute current-K output or periodic `get_full_tick`

### Requirement: Dual-source formal transport makes no ordering contract

Datasource SHALL treat TDX and QMT schema-v2 native maps as latest-state
observations. The common formal frame MUST NOT promise a stream epoch,
per-symbol sequence, event identity or exactly-once processing.

#### Scenario: Same provider state arrives twice

- **WHEN** two accepted native observations have equivalent content
- **THEN** datasource MAY forward both
- **AND** neither backend path MUST require a sequence to distinguish them

#### Scenario: An observation is lost

- **WHEN** bounded realtime delivery drops one observation
- **THEN** the provider path MUST remain live for later state
- **AND** neither datasource nor backend may claim tick-complete delivery
