## MODIFIED Requirements

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

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Realtime sequence scope is per symbol

**Reason**: The unified TDX/QMT schema-v2 formal frame is an explicitly lossy
latest-state observation and no longer carries datasource-owned sequence,
sequence scope or stream epoch.

**Migration**: Keep provider-local owner fences only at the bridge→datasource
boundary—TDX `leaseToken + streamEpoch`, QMT
`ownerId + leaseToken + generation`—remove datasource formal sequence
assignment and backend epoch/sequence fences, and allow later equivalent native
state to be accepted again without deduplication.
