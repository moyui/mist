## MODIFIED Requirements

### Requirement: Realtime protocol and bridge readiness are distinct

The datasource `realtime.ready` frame SHALL report only successful WebSocket
protocol negotiation. Terminal bridge-owner readiness and identity SHALL remain
authoritative only in datasource root/scoped HTTP health, and backend runtime
status SHALL expose the accepted protocol state as `transportReady` without
copying bridge-owner state.

#### Scenario: Datasource emits realtime ready metadata

- **WHEN** a TDX or QMT backend client completes WebSocket negotiation
- **THEN** the datasource MUST emit a `realtime.ready` frame with `mode`,
  `schemaVersion`, `source` and `quality`
- **AND** QMT MAY additionally include its provider-local `leaderClientId` and
  current subscription `active` view
- **AND** the frame MUST NOT include `bridge`, `ownerId`, `ownerGeneration`,
  `bridgeBuildId`, `tdxRealtimeBridgeReady`, `collectorReady`,
  `datasourceBuildId` or a top-level ambiguous `ready`

#### Scenario: Backend accepts a realtime ready frame

- **WHEN** a source client validates the exact provider ready frame
- **THEN** backend diagnostics MUST set `connected=true` and
  `transportReady=true`
- **AND** they MUST NOT retain or infer bridge-owner readiness, subscription
  convergence or market-data freshness from that frame

#### Scenario: Backend receives a retired ready shape

- **WHEN** a ready frame includes retired bridge-owner readiness or identity
  fields instead of the exact provider protocol-ready shape
- **THEN** the backend MUST reject the frame as a contract mismatch
- **AND** it MUST NOT set `transportReady`

#### Scenario: Bridge owner readiness is inspected

- **WHEN** deployment, monitoring or recovery needs current bridge readiness,
  owner generation or build identity
- **THEN** it MUST read datasource root `health.bridge` or the source-scoped
  `/tdx/bridge/health` or `/qmt/bridge/health`
- **AND** it MUST NOT use a backend-cached copy of bridge-owner state

#### Scenario: Bridge owner generation changes

- **WHEN** a terminal bridge owner is registered, replaced or becomes stale
- **THEN** datasource health/control state MUST reflect that lifecycle
- **AND** datasource MUST NOT emit `realtime.stream_started`
- **AND** backend snapshot ordering MUST remain independent of owner generation

### Requirement: Realtime transport uses a stable native envelope

Datasource SHALL send TDX and QMT realtime observations with the same exact
schema-v2 envelope. Both sources SHALL preserve complete provider-native data
without datasource canonical conversion. Schema v1 SHALL NOT remain an active
runtime alternative after the maintenance-window cutover.

#### Scenario: QMT native snapshot is emitted

- **WHEN** datasource accepts a QMT callback snapshot map
- **THEN** it MUST emit:

```json
{
  "type": "realtime.native_snapshot",
  "provider": "qmt",
  "timestamp": "RFC3339",
  "data": {
    "schemaVersion": 2,
    "capturedAt": "RFC3339",
    "native": {
      "300502.SZ": {"lastPrice": 1}
    }
  }
}
```

- **AND** `native` MUST remain structurally and value equivalent to the callback `{code: tickData}` map

#### Scenario: TDX native snapshot is emitted

- **WHEN** datasource accepts a TDX `get_market_snapshot` result for `300502.SZ`
- **THEN** it MUST emit:

```json
{
  "type": "realtime.native_snapshot",
  "provider": "tdx",
  "timestamp": "RFC3339",
  "data": {
    "schemaVersion": 2,
    "capturedAt": "RFC3339",
    "native": {
      "300502.SZ": {"providerField": "providerValue"}
    }
  }
}
```

- **AND** datasource MUST use the bridge request `symbol` only as the native-map key
- **AND** it MUST NOT inject that symbol into or otherwise change the TDX native object
- **AND** this change MUST NOT alter TDX
  `subscribe_hq -> dirty -> get_market_snapshot` acquisition

#### Scenario: Exact schema-v2 data keys are inspected

- **WHEN** either source emits a formal realtime frame
- **THEN** the outer object MUST contain exactly `type`, `provider`, `timestamp` and `data`
- **AND** `type` MUST equal `realtime.native_snapshot`
- **AND** `provider` MUST equal the current connection source `tdx|qmt`
- **AND** `timestamp` MUST be an RFC3339 datasource send time
- **AND** `data` MUST contain exactly `schemaVersion`, `capturedAt` and `native`
- **AND** `schemaVersion` MUST be the integer `2`
- **AND** `capturedAt` MUST be an RFC3339 acquisition observation time
- **AND** `native` MUST be a non-empty bounded JSON-safe map whose keys are
  valid provider symbols and whose values are objects
- **AND** it MUST NOT contain `payloadType`, `source`, `acquisitionProfile`,
  `streamEpoch`, `sequence`, `sequenceScope` or a standalone `symbol`

#### Scenario: Legacy formal frame arrives

- **WHEN** backend receives a schema-v1 native frame or legacy formal-frame fields
- **THEN** strict contract validation MUST reject it
- **AND** runtime MUST NOT keep a dual v1/v2 compatibility branch

#### Scenario: Equivalent snapshots arrive more than once

- **WHEN** either provider emits equal native state more than once
- **THEN** backend MAY process each accepted observation
- **AND** the contract MUST NOT require a sequence to distinguish them

#### Scenario: An observation is dropped before delivery

- **WHEN** bounded queue overflow, expiry or local unavailability drops an observation
- **THEN** the provider path MUST remain live for later state
- **AND** it MUST NOT perform historical backfill or label later state as tick-complete

### Requirement: Backend owns canonical realtime conversion

Backend SHALL strictly decode the common schema-v2 envelope once and SHALL
perform provider-native projection in two new independent converters before
invoking the common realtime ingress. Canonical output SHALL preserve source,
resolved canonical `securityId`, explicit `providerSymbol`, native data,
nullable provider event time, captured time and quality without `symbol`,
`sequence` or `streamEpoch`.

#### Scenario: Common decoder responsibility is inspected

- **WHEN** the schema-v2 decoder implementation is reviewed
- **THEN** it MUST validate exact outer/data keys, expected connection provider,
  schema version, RFC3339 times and native-map bounds
- **AND** it MUST NOT parse provider price, time, order-book, cumulative or
  alias fields
- **AND** it MUST expose map entries for provider-local validation rather than
  reject all entries because one native value is malformed

#### Scenario: Converter layout is inspected

- **WHEN** the maintained backend source tree is checked
- **THEN** it MUST contain:
  `sources/tdx/realtime/native-snapshot.converter.ts` and
  `sources/qmt/realtime/native-snapshot.converter.ts`
- **AND** each converter MUST accept only resolved `securityId`,
  `providerSymbol`, `capturedAt` and one provider-native object
- **AND** neither converter may read the allowlist itself

#### Scenario: Legacy adapters are inspected

- **WHEN** the schema-v2 cutover is complete
- **THEN** neither new converter nor an active client MUST import, wrap or call
  the former `realtime-native.adapter.ts` implementations
- **AND** active runtime MUST NOT translate a schema-v2 entry back into a
  schema-v1 frame to reuse old conversion code

#### Scenario: Shared code is inspected

- **WHEN** the two converter implementations are compared
- **THEN** they MAY share the canonical output type, common envelope decoder and common ingress
- **AND** they MUST NOT share a generic provider adapter, cross-provider alias table or provider-field guessing logic

#### Scenario: QMT native map is decoded

- **WHEN** a QMT schema-v2 frame contains one or more provider-symbol entries
- **THEN** backend MUST validate, resolve allowlist identity and convert every
  entry independently with the QMT converter
- **AND** it MUST call `RealtimeSnapshotIngressService.handleSnapshot()` once for each accepted entry

#### Scenario: TDX native map is decoded

- **WHEN** a TDX schema-v2 frame contains one provider-symbol entry
- **THEN** backend MUST resolve its allowlist identity and convert that entry
  with the TDX converter
- **AND** it MUST call the same common ingress service

#### Scenario: Valid source frame reaches ingress

- **WHEN** a TDX or QMT frame passes schema-v2 envelope, provider, native-map
  and business-allowlist identity validation
- **THEN** the source converter MUST preserve `native` and derive canonical
  prices, cumulative volume/amount, nullable `eventTime`, `capturedAt` and
  quality before invoking common ingress

#### Scenario: TDX native map has the wrong cardinality

- **WHEN** a TDX schema-v2 native map is empty or contains more than one entry
- **THEN** backend MUST reject the whole frame as a contract violation
- **AND** it MUST not infer one preferred entry

#### Scenario: Formal envelope is invalid

- **WHEN** provider, schema, timestamp, captured time, map type or hard
  cardinality/size limit is invalid
- **THEN** backend MUST reject the whole frame
- **AND** no native entry may reach a source converter

#### Scenario: One map entry is invalid

- **WHEN** one QMT provider symbol, allowlist identity or native object is malformed
- **THEN** that entry MUST be rejected with a bounded diagnostic
- **AND** other valid entries in the same frame MUST continue
- **AND** a converter exception MUST be contained at that entry boundary

#### Scenario: All QMT entries are invalid

- **WHEN** the common envelope is valid but every QMT map entry is rejected
- **THEN** backend MUST make zero common ingress calls
- **AND** monitoring MUST distinguish decoded frame count, accepted-entry count
  and rejected-entry count without a symbol label

#### Scenario: Allowlist resolves canonical identity

- **WHEN** one provider-symbol key is authorized for its connection source
- **THEN** the Mist source business allowlist MUST return its canonical numeric `securityId`
- **AND** that exact `securityId` and original map key MUST enter the source converter
- **AND** an unauthorized entry MUST be rejected before conversion
- **AND** datasource current handle membership MUST NOT substitute for this business authorization

#### Scenario: Provider event time can be parsed

- **WHEN** one source converter recognizes an accepted runtime fixture field and value
- **THEN** it MUST populate canonical `eventTime` from that provider value
- **AND** `eventTime` MUST represent provider business time rather than any
  bridge, datasource or backend observation time

#### Scenario: Provider event time cannot be parsed

- **WHEN** no accepted provider event-time field is available
- **THEN** canonical `eventTime` MUST be `null`
- **AND** `capturedAt` MUST remain separately available as receipt metadata
- **AND** a price-valid observation MUST NOT be rejected for that reason alone
- **AND** `quality.eventTimeAvailable` MUST be false

#### Scenario: Native event time is unavailable

- **WHEN** a provider frame has no trustworthy native event time
- **THEN** canonical `eventTime` MUST be `null` and quality MUST mark native
  time unavailable
- **AND** the backend MUST NOT substitute its current clock as provider event
  time

#### Scenario: Official QMT time-field examples differ

- **WHEN** documentation shows `time/stime` in the data structure and `timetag` in a `get_full_tick` example
- **THEN** the QMT converter MUST use only a mapping proven by an accepted production fixture
- **AND** `time`, `stime` and `timetag` MUST be modeled as candidate
  representations of one provider business time
- **AND** the fixture MUST record candidate order, field spelling, value type,
  parser, unit, timezone, precision and consistency rule

## ADDED Requirements

### Requirement: Provider business time is the only aggregation clock

Every TDX and QMT converter SHALL derive canonical `eventTime` solely from an
accepted provider-native fixture. Any realtime candle bucketing, trading-day
classification or business-time ordering SHALL consume only canonical
`eventTime`. Bridge observation, datasource send, backend receipt and control
timestamps SHALL remain measurement metadata and MUST NOT be used as fallback
aggregation time.

#### Scenario: QMT candidate fields normalize to one business time

- **WHEN** an accepted QMT fixture contains one or more of `time`, `stime` and
  `timetag`
- **THEN** the QMT converter MUST apply the fixture-backed ordered candidate
  and parser rules
- **AND** all retained raw candidate fields MUST remain unchanged in `native`
- **AND** the result MUST be one canonical `eventTime`, not three canonical
  timestamps

#### Scenario: QMT time candidates cannot establish one instant

- **WHEN** no accepted candidate parses or simultaneously present candidates
  cannot be proven consistent under the fixture rule
- **THEN** canonical `eventTime` MUST be `null`
- **AND** the latest-state observation MAY still enter common latest when its
  price fields are valid
- **AND** it MUST be ineligible for realtime aggregation

#### Scenario: TDX business time is converted

- **WHEN** a TDX native snapshot contains the event-time field accepted by the
  TDX production fixture
- **THEN** the TDX converter MUST derive canonical `eventTime` from that native
  value
- **AND** it MUST apply the same provider-time-only aggregation rule without
  sharing QMT aliases or parsers

#### Scenario: A measurement timestamp is available

- **WHEN** `capturedAt`, formal outer `timestamp`, backend `acceptedAt`, current
  system time or journal/control time is available
- **THEN** none of those values may populate canonical `eventTime`
- **AND** none may determine candle bucket, trading day or business-time order

#### Scenario: An aggregation consumer receives null event time

- **WHEN** a future candle or aggregation consumer receives a canonical
  snapshot whose `eventTime` is `null`
- **THEN** it MUST skip that observation for aggregation with a bounded
  low-cardinality reason
- **AND** it MUST NOT fall back to arrival order or a measurement timestamp

### Requirement: Canonical snapshot has one exact dual-source shape

Every accepted TDX or QMT entry SHALL become one exact
`CanonicalRealtimeSnapshot` containing `source`, numeric `securityId`,
`providerSymbol`, nullable `eventTime`, `capturedAt`, prices, cumulative
volume/amount, quality and the complete per-symbol native object. It SHALL NOT
contain transport ordering or ambiguous symbol fields.

#### Scenario: Canonical shape is inspected

- **WHEN** an accepted source converter returns a canonical snapshot
- **THEN** it MUST contain exactly `source`, `securityId`, `providerSymbol`,
  `eventTime`, `capturedAt`, `prices`, `cumulativeVolume`,
  `cumulativeAmount`, `quality` and `native`
- **AND** `providerSymbol` MUST equal the original formal native-map key
- **AND** it MUST NOT contain `symbol`, `streamEpoch`, `sequence`,
  `sequenceScope`, `acquisitionProfile` or event identity

#### Scenario: Native value is preserved

- **WHEN** one provider-native entry is converted
- **THEN** canonical `native` MUST preserve the complete source object,
  including QMT order book and provider extension fields
- **AND** converter MUST treat the object as readonly and MUST NOT rewrite it
- **AND** it MUST NOT perform a second deep copy solely for canonical conversion

#### Scenario: Backend receive time is recorded

- **WHEN** common ingress accepts a canonical snapshot
- **THEN** backend MAY record `acceptedAt` as runtime/freshness metadata
- **AND** `acceptedAt` MUST NOT be inserted into the canonical snapshot or used
  as provider `eventTime`
- **AND** it MUST NOT be used for realtime candle aggregation

### Requirement: Common latest state is keyed by canonical security identity

`RealtimeSnapshotIngressService` SHALL own one bounded latest snapshot map
keyed by canonical `securityId`. Source runtime stores SHALL not retain a
second complete native or canonical snapshot. In this transport-only change,
each entry SHALL be authorized and resolved by its connection source business allowlist,
and startup SHALL reject cross-source `securityId` conflicts. This change SHALL
not create a desired-subscription coordinator or
`effectiveSourceBySecurityId`.

#### Scenario: A later observation is accepted

- **WHEN** an allowlisted source produces another accepted observation for the
  same `securityId`
- **THEN** common ingress MUST overwrite that security's latest snapshot
- **AND** it MUST NOT compare sequence, epoch, event identity or native equality

#### Scenario: The same state arrives repeatedly

- **WHEN** equal provider state reaches common ingress more than once
- **THEN** each accepted observation MAY overwrite latest and refresh
  backend receipt metadata
- **AND** no duplicate rejection is permitted

#### Scenario: Source business allowlists target the same security

- **WHEN** TDX and QMT source business allowlists resolve entries to the same canonical
  `securityId`
- **THEN** backend initialization MUST fail before either client reports ready
- **AND** snapshot arrival order MUST NOT select an effective source

#### Scenario: Source business allowlist identity is missing

- **WHEN** a provider-symbol key does not resolve through the current connection
  source business allowlist
- **THEN** backend MUST reject that entry before converter and common ingress
- **AND** it MUST record a stable low-cardinality allowlist rejection reason

#### Scenario: Security status changes after initialization

- **WHEN** a security's status or source configuration changes while the backend
  process remains running
- **THEN** this change MUST NOT automatically mutate provider subscriptions or
  remove its latest entry
- **AND** latest-state memory MUST remain bounded by the resolved startup
  allowlist union and process lifetime
- **AND** dynamic desired-state cleanup MUST remain a follow-up lifecycle
  responsibility

### Requirement: Backend source runtime state contains no ordering fence

TDX and QMT SHALL retain aligned provider-local connection and diagnostic
state, but their active clients and stores SHALL NOT maintain formal
epoch/per-symbol sequence fences.

#### Scenario: Runtime stores are inspected

- **WHEN** TDX and QMT source runtime stores are compared
- **THEN** both MAY retain connection, transport readiness, last
  accepted/captured times, last error and bounded rejection counters
- **AND** bridge owner generation and build identity MUST remain datasource
  health/control state rather than a duplicated backend runtime-store field
- **AND** neither may retain `lastSequence`, `currentStreamEpoch`, a
  per-symbol sequence fence or `epochMismatch|duplicate|outOfOrder` rejection
- **AND** neither may keep another full native/canonical snapshot beside common ingress

#### Scenario: A realtime connection disconnects

- **WHEN** one datasource connection becomes unavailable
- **THEN** its source runtime state MUST become disconnected/not ready
- **AND** common latest MAY remain readable but MUST become stale according to
  backend receipt time
- **AND** disconnect MUST NOT clear or rotate latest state by transport epoch

#### Scenario: Internal diagnostic reads one symbol

- **WHEN** a source diagnostic endpoint reads a provider symbol
- **THEN** it MUST resolve `providerSymbol -> securityId`, read common latest
  and combine it with provider runtime health
- **AND** snapshot diagnostic output MUST NOT return formal epoch or sequence

#### Scenario: Legacy sequence fence implementation is inspected

- **WHEN** schema-v2 cutover dependencies are checked
- **THEN** active clients, stores and tests MUST not use
  `RealtimeSymbolSequenceFence`
- **AND** owner generation MAY remain health/control metadata but MUST NOT
  become backend snapshot ordering metadata

## MODIFIED Requirements

### Requirement: Windows HIL gates production activation

The unified schema-v2 contract and both new converters MUST NOT become the
production baseline until Windows HIL verifies both affected source paths,
restart/rollback behavior and protected-table digest invariance.

#### Scenario: Trading-session HIL runs

- **WHEN** TDX `600030.SH` and QMT `300502.SZ` are validated during supported
  sessions
- **THEN** evidence MUST include fresh schema-v2 native-map delivery,
  datasource bridge readiness, backend canonical readback and monitoring
  convergence for both sources

#### Scenario: QMT trading-session HIL runs

- **WHEN** QMT `300502.SZ` is validated during a supported session
- **THEN** evidence MUST include fresh single/whole callback maps, exact integer subscription IDs, unsubscribe return semantics and QMT-converter canonical readback
- **AND** it MUST not require a datasource-to-backend sequence

#### Scenario: TDX trading-session HIL runs

- **WHEN** TDX is validated after the formal-frame cutover
- **THEN** evidence MUST cover
  `get_market_snapshot -> one-entry schema-v2 map -> new TDX converter -> common ingress`
- **AND** it MUST prove absence of `producerSequence`, formal sequence and epoch/sequence fencing

#### Scenario: HIL runs outside a trading session

- **WHEN** validation runs outside a supported exchange session
- **THEN** owner, control, restart and accepted fixture evidence MAY be retained
- **AND** it MUST NOT be presented as fresh-provider-data evidence

## ADDED Requirements

### Requirement: QMT realtime quality is latest-state

The QMT callback native object SHALL be classified as a `latest-state native
snapshot`. Equality between callback fields and `get_full_tick` fields SHALL
describe the snapshot schema only and MUST NOT prove tick-complete delivery.

#### Scenario: Whole callback reports changed symbols

- **WHEN** a whole callback contains only symbols whose cached latest values changed
- **THEN** every accepted native entry MAY be forwarded
- **AND** callback cardinality or field completeness MUST NOT be used as proof that every exchange tick was delivered

### Requirement: Current-K records are not native tick snapshots

Any future `get_market_data_ex(period='1m', count=1)` record SHALL be modeled
separately from `realtime.native_snapshot`.

#### Scenario: A current-minute record is evaluated

- **WHEN** a provider current-K record lacks the callback tick native shape
- **THEN** it MUST NOT be emitted in the unified schema-v2 native snapshot
- **AND** this focused change MUST NOT add that current-K event
