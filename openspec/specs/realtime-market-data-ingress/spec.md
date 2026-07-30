# realtime-market-data-ingress Specification

## Purpose
Define the strict schema-v2 TDX/QMT native-map transport, provider-specific
canonical conversion, lifecycle readiness, bounded parsing, and side-effect
boundary for realtime market-data ingress.
## Requirements
### Requirement: Realtime transport uses a stable native envelope
TDX and QMT datasource services SHALL emit only schema-v2
`realtime.native_snapshot` frames. The outer object SHALL contain exactly
`type`, `provider`, `timestamp`, and `data`; `data` SHALL contain exactly
`schemaVersion`, `capturedAt`, and a provider-symbol-keyed `native` map.
Schema-v1 formal epoch, sequence, acquisition-profile, and standalone-symbol
fields SHALL NOT remain an active compatibility path.

#### Scenario: TDX native snapshot is emitted
- **WHEN** the TDX gateway accepts a converged official `get_market_snapshot` result
- **THEN** it emits `provider=tdx` with exactly one provider-symbol entry in
  `data.native`
- **AND** it preserves the complete TDX native object without datasource
  canonical projection

#### Scenario: QMT native snapshot is emitted
- **WHEN** the QMT collector accepts a native `get_full_tick` result
- **THEN** it emits `provider=qmt` with one or more bounded provider-symbol
  entries in `data.native`
- **AND** it preserves each complete QMT native object

#### Scenario: Legacy formal frame arrives

- **WHEN** a frame declares schema v1 or contains `streamEpoch`, `sequence`,
  `sequenceScope`, `acquisitionProfile`, or standalone `symbol`
- **THEN** strict decoding MUST reject it
- **AND** runtime MUST NOT translate it into schema v2

### Requirement: Backend owns canonical realtime conversion
The Mist backend SHALL validate source-native fields through source-specific adapters and SHALL produce one `CanonicalRealtimeSnapshot` shape before any product consumer is invoked.

#### Scenario: Valid source frame reaches ingress
- **WHEN** a TDX or QMT frame passes schema-v2 envelope, provider, native-map,
  and allowlist identity validation
- **THEN** the source adapter preserves `native` and derives canonical prices, cumulative volume/amount, `eventTime`, `capturedAt` and quality

#### Scenario: Native event time is unavailable
- **WHEN** a provider frame has no trustworthy native event time
- **THEN** canonical `eventTime` is null and quality marks native time unavailable
- **AND** the backend MUST NOT substitute its current clock as provider event time

### Requirement: Transport acceptance is side-effect-free
The formal ingress introduced by this capability MUST remain memory-only until a later productization change explicitly supplies a product sink.

#### Scenario: Canonical snapshot is accepted
- **WHEN** common ingress accepts a canonical TDX or QMT snapshot
- **THEN** bounded state and diagnostics may update
- **AND** Redis, MySQL, K aggregation, scanners, signals, alerts, notifications and trading entry points remain untouched

### Requirement: Formal realtime naming replaces experimental runtime naming
Active runtime code, configuration, routes, payloads, errors, metrics, scripts and current documentation SHALL use formal realtime naming and MUST NOT retain an executable experimental or legacy realtime path.

#### Scenario: Repository naming guard runs
- **WHEN** CI searches active sources and current docs for realtime experimental or legacy identifiers
- **THEN** no forbidden identifier remains outside archive, historical evidence, or an explicit migration note

#### Scenario: Formal routes are requested
- **WHEN** backend and datasource connect after the breaking cutover
- **THEN** they use `/ws/realtime/{source}/{clientId}` and formal internal diagnostics
- **AND** old experimental WebSocket and diagnostic routes do not exist

### Requirement: TDX and QMT production runtimes are builtin by default
Production deployment SHALL configure TDX and QMT realtime as `builtin`, SHALL probe both as normal production sources, and SHALL retain per-source `off` only as an explicit operator rollback state.

#### Scenario: Production desired state is applied
- **WHEN** the verified realtime release is promoted to production
- **THEN** datasource, backend and monitoring all use `TDX_REALTIME_MODE=builtin` and `QMT_REALTIME_MODE=builtin`
- **AND** absence of either setting deterministically resolves that source to the production default `builtin`

#### Scenario: Operator rolls one source back
- **WHEN** an operator applies the recorded TDX or QMT realtime rollback
- **THEN** that source changes to `off`, its realtime routes/client stop, monitoring reports the intentional mode, and the other source remains active

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

### Requirement: Realtime protocol and bridge readiness are distinct
The datasource realtime ready frame SHALL identify successful protocol negotiation separately from terminal bridge-owner readiness, and the backend SHALL expose the accepted protocol state as `transportReady`.

#### Scenario: Datasource emits realtime ready metadata
- **WHEN** a TDX or QMT backend client completes WebSocket negotiation
- **THEN** the datasource emits a `realtime.ready` frame whose data includes `bridge.ready`, `bridge.ownerId`, `bridge.ownerGeneration`, and `bridge.bridgeBuildId`
- **AND** `data.source` is the domain label `TDX` or `QMT` while the outer transport `provider` remains lowercase `tdx` or `qmt`
- **AND** it does not emit `tdxRealtimeBridgeReady`, `collectorReady`, a top-level owner `generation`, or `datasourceBuildId`

#### Scenario: Backend receives a retired ready shape
- **WHEN** a ready frame uses a retired top-level readiness or owner field instead of the normalized nested bridge object
- **THEN** the backend rejects the frame as a contract mismatch
- **AND** it does not set `transportReady`

#### Scenario: Backend accepts a realtime ready frame
- **WHEN** a source client validates the ready frame
- **THEN** backend diagnostics set `transportReady=true`
- **AND** retain bridge-owner state separately
- **AND** do not infer subscription or market-data freshness from either value

### Requirement: Realtime messages are bounded and parsed once
Each backend realtime client SHALL enforce the raw UTF-8 frame byte limit before JSON parsing and SHALL route ready, control, and native snapshot messages from that single parsed object.

#### Scenario: An oversized message arrives
- **WHEN** a WebSocket message exceeds the configured raw byte limit
- **THEN** the backend rejects it before `JSON.parse`
- **AND** no protocol, bridge, or snapshot state is updated

#### Scenario: A native snapshot arrives
- **WHEN** a bounded message parses to a native snapshot envelope
- **THEN** strict native-map validation consumes the parsed envelope
- **AND** the raw text is not parsed a second time

### Requirement: TDX realtime previous close uses one exact native key

The TDX realtime datasource and backend converter SHALL accept only exact provider-native `LastClose` as the previous-close input and SHALL map it to canonical `prices.lastClose`. They MUST NOT treat `PreClose`, camelCase `lastClose`, spacing variants, or case-normalized variants as aliases.

#### Scenario: Exact native LastClose is received

- **WHEN** a TDX realtime native snapshot contains finite `LastClose`
- **THEN** datasource validation accepts the previous-close field
- **AND** backend maps it to canonical `prices.lastClose`

#### Scenario: Retired previous-close alias is received

- **WHEN** a TDX realtime native snapshot supplies `PreClose` or `lastClose` without exact `LastClose`
- **THEN** datasource validation rejects the frame
- **AND** backend conversion does not use the retired alias

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
