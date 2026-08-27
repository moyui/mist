# backend-datasource-integration Specification

## Purpose
Define the configured Python datasource service as the sole TDX/QMT product boundary for the Mist backend: configured HTTP/WS clients, normalized bar-query mapping and no direct native SDK calls.
## Requirements
### Requirement: Configured datasource client boundary

The Mist backend SHALL use the configured Python datasource service as the only
product TDX boundary for backend data collection.

#### Scenario: HTTP client uses configured datasource base URL

- **WHEN** the backend starts with `TDX_BASE_URL=http://127.0.0.1:9001`
- **THEN** the TDX HTTP client sends product datasource requests to that base
  URL

#### Scenario: Backend does not call native TDX directly

- **WHEN** the backend collects TDX bars or snapshots
- **THEN** it MUST NOT call TongDaXin native HTTP JSON-RPC, `tqcenter`, or the
  datasource `/v1/raw/tdx/call` debug endpoint

#### Scenario: WebSocket client uses configured client id

- **WHEN** the backend starts with `TDX_WS_CLIENT_ID=mist-backend-tdx`
- **THEN** the TDX WebSocket client connects with that client id and uses it for
  reconnects

### Requirement: Normalized bar query mapping

The backend TDX source SHALL fetch K-line data through the datasource
`POST /v1/bars/query` endpoint and map normalized bars into the existing Mist
`TdxResponse` shape.

#### Scenario: Datasource preserves backend-required market-data parameters

- **WHEN** the backend migrates from legacy `/api/tdx/market-data` to
  `/v1/bars/query`
- **THEN** the datasource contract preserves backend-required meanings for
  stock list, field list, period, start time, end time, and dividend adjustment
  behavior, or the missing behavior is added before migration

#### Scenario: Backend requests normalized bars

- **WHEN** `TdxSource.fetchK` receives a security format code, period, start
  date, and end date
- **THEN** it posts `symbols`, `period`, `startTime`, and `endTime` to
  `/v1/bars/query`

#### Scenario: Successful bars response is mapped

- **WHEN** the datasource returns an envelope with `ok: true` and
  `data.bars[*]`
- **THEN** the backend returns `TdxResponse[]` with `timestamp`, `open`, `high`,
  `low`, `close`, `volume`, `amount`, and optional `forwardFactor`

#### Scenario: Empty bars response is valid

- **WHEN** the datasource returns `ok: true` with an empty `data.bars` array
- **THEN** `TdxSource.fetchK` returns an empty array without throwing

### Requirement: QMT historical bar query mapping

The backend QMT source SHALL fetch K-line data through the QMT datasource
`POST /v1/bars/query` endpoint and map native QMT columnar `marketData` into
Mist K-line rows.

#### Scenario: Backend requests QMT native bars

- **WHEN** `QmtSource.fetchK` receives a security format code, period, start
  date, and end date
- **THEN** it posts QMT snake_case fields to `${QMT_BASE_URL}/v1/bars/query`
- **AND** it sends `dividend_type='front_ratio'`
- **AND** it sends the QMT-native period token for the requested `Period`

#### Scenario: Successful QMT response is mapped

- **WHEN** the datasource returns `ok: true` and
  `data.marketData[symbol][field][stime]`
- **THEN** the backend returns `QmtResponse[]` with base K fields
- **AND** it maps QMT-specific extension fields into `KExtensionQmt`

#### Scenario: QMT provider-specific extension fields are mapped

- **WHEN** historical market data contains `preClose`, `suspendFlag`,
  `openInterest`, or a verified settlement-price spelling
- **THEN** the backend MAY preserve those nullable values in `KExtensionQmt`
- **AND** it MUST map verified settlement aliases into the single internal
  property `settle`
- **AND** it MUST NOT treat those fields as provider-neutral canonical K
  columns or require TDX to expose equivalent extensions

#### Scenario: Retired QMT provenance values are available locally

- **WHEN** the adapter computes a provider request period or sends an adjustment
  request value
- **THEN** it MUST NOT persist that request-local value as `nativePeriod` or
  `effectiveDividendType`

#### Scenario: QMT realtime remains memory-only

- **WHEN** QMT historical bars are supported by backend collection
- **THEN** the accepted QMT realtime transport remains an independently gated,
  memory-only path
- **AND** it MUST NOT persist realtime snapshots or derived K-line data

### Requirement: TDX bar field preservation

The backend integration SHALL preserve backend-required TDX bar fields that are
available from the normalized datasource contract without storing them in the
provider-neutral `K` base table.

#### Scenario: Backend requests backend-required bar fields

- **WHEN** the datasource `/v1/bars/query` contract supports field-list and
  dividend-adjustment parameters
- **THEN** the backend requests the OHLCV fields plus backend-required extension
  fields such as `ForwardFactor` and `VolInStock` using the normalized contract

#### Scenario: Structured extension fields are returned

- **WHEN** normalized bars include TDX-specific structured extension fields
- **THEN** the backend maps those fields into the TDX extension shape instead of
  dropping them or replacing them with default zero values

#### Scenario: Field has no structured owner

- **WHEN** a datasource response includes a non-normalized provider field that
  has no corresponding extension or domain table
- **THEN** the backend does not persist that field as opaque raw JSON and records
  the need for a structured owner before product use

### Requirement: Datasource error envelope handling

The backend SHALL treat datasource failure envelopes and invalid envelopes as
upstream datasource failures with stable backend errors.

#### Scenario: Datasource returns failure envelope

- **WHEN** the datasource returns `ok: false` with `error.code` and
  `error.message`
- **THEN** the backend raises an upstream datasource error that includes the
  datasource error code and message

#### Scenario: Datasource returns invalid payload

- **WHEN** the datasource response is missing the envelope or the expected
  `data` field
- **THEN** the backend raises an upstream datasource error instead of saving
  partial data

#### Scenario: Datasource request fails

- **WHEN** the HTTP request to the datasource times out or is refused
- **THEN** the backend raises a retryable upstream datasource failure and logs
  the datasource base URL and operation name

### Requirement: WebSocket subscription resync

The backend TDX and QMT realtime clients SHALL each expose the same four Nest-internal in-process methods: `syncSubscriptions`, `subscribe`, `unsubscribe` and `getSubscriptions`. Each method SHALL execute the matching datasource WebSocket request and await its typed response. The provider clients MUST NOT derive business desired state themselves; when lifecycle mode is on, the independent production coordinator SHALL derive desired from ACTIVE immutable assignments. Ready/reconnect and weekday 09:15 SHALL perform `getSubscriptions`, full `syncSubscriptions`, then final `getSubscriptions`; eligible intraday activation MAY use one incremental `subscribe`; public application paths MUST NOT call `unsubscribe`.

#### Scenario: Datasource sends ready

- **WHEN** the backend client accepts a WebSocket `ready` message from a TDX or QMT datasource on a new connection
- **THEN** it MUST update connection/readiness state and publish one bounded provider-neutral ready observation
- **AND** the lifecycle coordinator in on mode MUST use that observation to start one authoritative convergence round
- **AND** the client itself MUST NOT construct or cache a desired set

#### Scenario: Production coordinator synchronizes after connection

- **WHEN** the coordinator receives a ready observation while lifecycle mode is on
- **THEN** it MUST read the complete current ACTIVE-assignment provider-symbol set for that source
- **AND** it MUST call `getSubscriptions` once, `syncSubscriptions` once and `getSubscriptions` once more
- **AND** it MUST NOT call incremental `subscribe` or `unsubscribe` to reproduce the full-set transition

#### Scenario: WebSocket reconnects

- **WHEN** a provider WebSocket reconnects after disconnect and accepts a new ready frame
- **THEN** the old pending method MUST already have settled as disconnected/outcome-unknown
- **AND** the new ready observation MUST trigger a fresh database read and full-set convergence
- **AND** backend MUST NOT replay the old request or reuse its request payload as desired authority

#### Scenario: Backend subscribes after connection

- **WHEN** an authorized in-process caller explicitly calls `subscribe` while
  the provider WebSocket is open and control-ready
- **THEN** the client MUST send exactly one typed `subscribe` request
- **AND** it MUST NOT create a locally inferred desired set or schedule a later
  automatic resync

#### Scenario: Backend reconnects after an ambiguous mutation

- **WHEN** the provider WebSocket reconnects after a disconnect or lost response
- **THEN** the pending method MUST finish with an outcome-unknown failure
- **AND** backend MUST NOT automatically replay the previous mutation
- **AND** the coordinator MUST explicitly call `getSubscriptions` on the new ready connection before one safe full sync
- **AND** provider evidence MUST NOT replace ACTIVE assignments as desired authority

#### Scenario: An internal method is called

- **WHEN** a Nest test, HIL harness or production coordinator calls one control method on the current provider leader
- **THEN** the client MUST send exactly one matching request on its existing datasource WebSocket
- **AND** the returned Promise MUST settle only from the matching response, bounded timeout, disconnect or local validation failure

#### Scenario: Internal method is called before control readiness

- **WHEN** an in-process caller invokes a method while the provider WebSocket is closed or has not accepted the datasource ready contract
- **THEN** the method MUST fail locally with a stable not-ready result
- **AND** it MUST not send, queue or retry the request

#### Scenario: Datasource rejects the connection as non-leader

- **WHEN** a sent control request receives the datasource's stable non-leader failure
- **THEN** the method MUST return that typed failure to its in-process caller
- **AND** it MUST not retry, reconnect solely for the mutation or infer success

#### Scenario: Production runtime graph is inspected

- **WHEN** modules, controllers, routes, commands and startup lifecycle hooks are inspected
- **THEN** exactly one `apps/mist` lifecycle coordinator MAY call production control methods
- **AND** no public raw-control controller, GraphQL mutation, CLI, diagnostic mutation route, `apps/schedule` caller or provider client-local desired owner MUST exist

### Requirement: Deployment health verifies backend-datasource connection

The Windows Docker deployment health check SHALL verify the datasource URL used
by backend containers from both the Windows host and the backend container.

#### Scenario: Health check probes the container datasource URL

- **WHEN** the Windows Docker health check runs
- **THEN** it verifies datasource health from the host
- **AND** it verifies datasource health from the `mist-backend` container
  through `http://host.docker.internal:9001/health`

#### Scenario: Datasource health is checked

- **WHEN** the health check probes the configured datasource
- **THEN** it verifies `GET /health` and reports whether the datasource service
  is reachable

#### Scenario: Backend health remains checked

- **WHEN** the deployment health check runs
- **THEN** it still verifies backend health endpoints after datasource probes

### Requirement: Interface test coverage

The backend datasource integration SHALL include automated tests for supported
request shapes, response mapping, error handling, WebSocket protocol behavior,
deployment script URL resolution, and datasource WebSocket envelope behavior.

#### Scenario: HTTP unit tests cover normalized contracts

- **WHEN** backend unit tests run for `TdxSource`
- **THEN** they verify `/v1/bars/query`, successful envelope mapping, failure
  envelope handling, and invalid payload handling
- **AND** they verify `TdxSource` does not expose an on-demand snapshot method

#### Scenario: WebSocket unit tests cover datasource protocol

- **WHEN** backend unit tests run for TDX and QMT realtime clients
- **THEN** they verify exact bridge-free `realtime.ready`, explicit
  subscription control, schema-v2 native snapshot, reconnect and error behavior
- **AND** they verify `realtime.stream_started` is not part of the maintained
  protocol

#### Scenario: Deployment script tests cover configured URL

- **WHEN** deployment script tests run
- **THEN** they verify the Windows Docker health check covers both host
  datasource health and container-to-datasource health
- **AND** bridge-owner readiness is read directly from datasource HTTP while
  backend compatibility is read as `connected=true,transportReady=true`

#### Scenario: Datasource tests cover canonical WebSocket envelopes

- **WHEN** datasource tests run for WS protocol and quote routes
- **THEN** they verify pong timestamps, canonical error payloads, exact typed
  subscription responses and schema-v2 native-map snapshots
- **AND** they reject schema-v1, retired formal sequence fields and unknown
  envelope fields

#### Scenario: Removed route tests cover the stable boundary

- **WHEN** datasource route contract tests run
- **THEN** they verify `/api/tdx/*`, `/ws/quote/*`, and
  `/v1/snapshots/query` remain absent
- **AND** they verify `/v1/bars/query` and the provider-specific builtin
  realtime routes remain

### Requirement: Integration documentation

The project SHALL document how the backend client connects to each supported
datasource path and how to verify that connection locally and on Windows.

#### Scenario: Developer reads backend datasource docs

- **WHEN** a developer needs to understand the backend datasource connection
- **THEN** the docs identify `TdxSource`, `QmtSource`, the TDX and QMT realtime
  clients, `TDX_BASE_URL`, `QMT_BASE_URL`, `/v1/bars/query`, the dedicated
  builtin realtime WebSockets, and the relevant test commands
- **AND** the docs MUST NOT advertise an on-demand TDX snapshot product route

#### Scenario: Operator follows Windows verification docs

- **WHEN** an operator deploys backend and datasource on Windows
- **THEN** the docs show startup order, health checks, supported normalized API
  probes, realtime proof, expected success output, and rollback path

### Requirement: Snapshot raw preservation boundary
The backend SHALL preserve the validated provider-native object carried by an accepted formal realtime frame, SHALL convert it through a source-specific adapter into the shared canonical ingress shape, and MUST keep this change memory-only without K-line or business persistence.

#### Scenario: Official snapshot fields are preserved
- **WHEN** a TDX or QMT quote includes provider-specific price, order-book, volume, amount, time, or extension fields
- **THEN** those fields remain present under the canonical snapshot's `native` object
- **AND** datasource code MUST NOT force the two providers into one native shape

#### Scenario: Realtime snapshot reaches common ingress
- **WHEN** an accepted formal TDX or QMT frame reaches the backend
- **THEN** the appropriate source adapter produces the common canonical shape
- **AND** it MUST NOT invoke Redis, candle aggregation, database persistence, scanner, signal, alert, notification, or trading code

#### Scenario: Realtime snapshot remains memory-only
- **WHEN** an accepted TDX or QMT realtime snapshot reaches the backend
- **THEN** it may update bounded diagnostic state and callbacks
- **AND** it MUST NOT invoke candle aggregation or database persistence

### Requirement: Removed datasource routes stay absent

The datasource product contract SHALL use normalized `/v1` routes and dedicated
builtin realtime WebSockets, while removed legacy TDX routes remain absent.

#### Scenario: Product callers use normalized routes

- **WHEN** backend or product-facing callers need bars, snapshots, references,
  finance, formula, or sector data
- **THEN** they MUST use normalized `/v1` routes or the WebSocket contract
  defined in this capability
- **AND** they MUST NOT add new product use of removed bare-dict routes

#### Scenario: Removed routes are requested

- **WHEN** a caller requests `/api/tdx/*` or `/ws/quote/*`
- **THEN** no matching route exists
- **AND** contract tests MUST keep those routes absent

### Requirement: Provider-facing contracts stay narrow and typed

The datasource SHALL use typed models or narrow provider-facing protocols for
the normalized routes it actually exposes, instead of adding a broad adapter
ABC that tries to cover every provider method.

#### Scenario: Normalized route depends on supported provider capability

- **WHEN** a normalized route or WebSocket publisher calls provider code
- **THEN** the callable contract MUST be limited to the route's required
  operation and typed payload shape
- **AND** unsupported provider methods MUST remain explicit capability
  failures

#### Scenario: No broad adapter ABC is introduced

- **WHEN** this change aligns WebSocket and route contracts
- **THEN** it MUST NOT add a large placeholder adapter interface for unused
  provider operations
- **AND** tests MUST cover the concrete normalized contract being consumed

### Requirement: QMT experimental consumer is independent
The backend SHALL implement QMT experimental realtime through a dedicated module, client, allowlist, store, and diagnostic controller that do not inherit from or instantiate the legacy TDX realtime graph.

#### Scenario: QMT experimental is enabled beside TDX
- **WHEN** the Mist app starts with `QMT_REALTIME_MODE=builtin_experimental`
- **THEN** historical collection and the independent TDX and QMT realtime consumers are all available

#### Scenario: Schedule app starts
- **WHEN** the schedule app starts
- **THEN** it imports historical collection only and exposes no realtime client or route

### Requirement: TDX desired subscriptions use the realtime WebSocket

The backend TDX realtime client SHALL route any explicit in-process
subscription-control method invocation over its existing datasource realtime
WebSocket and SHALL NOT call a loopback-only HTTP desired-state route from
Docker. This change SHALL NOT automatically derive or send a desired set.

#### Scenario: TDX internal full synchronization is called

- **WHEN** an explicit in-process test, HIL harness or future coordinator calls
  `syncSubscriptions(symbols)` on the current TDX leader
- **THEN** the client MUST send one `sync_subscriptions` WebSocket message with
  the normalized exact symbol set
- **AND** it MUST NOT call the removed loopback desired-state HTTP route

#### Scenario: TDX ready frame is accepted

- **WHEN** backend accepts a valid TDX ready frame
- **THEN** it MUST send no subscription-control request until one of the
  in-process methods is explicitly called
- **AND** it MUST expose only connection/protocol readiness and MUST NOT cache
  datasource bridge owner/build state

### Requirement: QMT experimental readback is internal and memory-only
The backend SHALL expose QMT latest-snapshot state only through guarded internal experimental diagnostics and SHALL NOT expose a product snapshot endpoint or persist experimental snapshots.

#### Scenario: Authorized diagnostic readback
- **WHEN** an authorized loopback or admin caller reads an allowlisted QMT format code
- **THEN** the backend returns its latest accepted snapshot, epoch, sequence, timestamps, freshness, and counters

#### Scenario: Product snapshot path is requested
- **WHEN** a caller requests a QMT experimental snapshot through a public product route
- **THEN** no such route exists

### Requirement: Backend uses separate TDX and QMT datasource services

The Mist backend SHALL treat TDX and QMT as separate datasource services.

#### Scenario: Backend requests TDX data

- **WHEN** backend collection or analysis code needs TDX data
- **THEN** it MUST call the TDX datasource on `:9001`
- **AND** it MAY use TDX `/v1` routes or the dedicated builtin realtime
  WebSocket according to the existing TDX contract

#### Scenario: Backend requests QMT historical bars

- **WHEN** backend collection or analysis code needs QMT historical bars
- **THEN** it MUST call QMT `:9002/v1/bars/query`
- **AND** it MUST send QMT snake_case request fields
- **AND** it MUST handle QMT native `data.marketData`
- **AND** it MUST use the fixed v1 QMT adjustment口径 `front_ratio`

#### Scenario: Backend preserves QMT realtime as a separate memory-only path

- **WHEN** backend historical QMT bars are implemented
- **THEN** the accepted QMT realtime path MUST remain separate from historical
  bar collection
- **AND** it MUST remain memory-only until a separately gated persistence
  change is implemented and accepted

### Requirement: Backend does not call QMT bridge internals as product API

The QMT HTTP polling bridge SHALL remain an internal runtime channel between
the datasource and the full-QMT built-in Python script.

#### Scenario: Product code needs QMT data

- **WHEN** backend product code needs QMT data
- **THEN** it MUST use QMT product routes such as `:9002/v1/bars/query`
- **AND** it MUST NOT call `/qmt/bridge/owner`, `/qmt/bridge/poll`,
  `/qmt/bridge/result`, or `/qmt/bridge/health` as market-data APIs

### Requirement: Account and trading operations stay outside backend market flow

The backend SHALL NOT route QMT account, position, order, deal, cancel, or
placement operations through the market datasource.

#### Scenario: Backend feature needs QMT trading behavior

- **WHEN** a backend feature needs QMT account or trading behavior
- **THEN** a separate trading/account service design MUST be created before
  implementation

### Requirement: Formal realtime clients share one product ingress

The backend SHALL require the same schema-v2 native-map envelope from TDX and
QMT. It SHALL use one common envelope decoder, two independent source-native
converters and one `RealtimeSnapshotIngressService.handleSnapshot()` ingress.
The common layer SHALL resolve each native-map key to canonical `securityId`;
the converters SHALL preserve that identity together with the explicit
`providerSymbol`.

#### Scenario: Common envelope is decoded

- **WHEN** either provider client receives one formal message
- **THEN** a common decoder MUST validate exact schema-v2 envelope fields and
  the expected connection provider
- **AND** provider prices, times, order-book and aliases MUST remain outside
  that common decoder
- **AND** an invalid envelope MUST produce zero converter and ingress calls

#### Scenario: Transport frame is rejected

- **WHEN** schema-v2 contract or source business authorization rejects a whole
  frame
- **THEN** common ingress MUST NOT be invoked
- **AND** backend MUST record a stable source-labelled rejection without
  applying a retired epoch or sequence fence

#### Scenario: Transport frame is accepted

- **WHEN** a schema-v2 frame and at least one provider-native entry pass common
  envelope, authorization and source conversion
- **THEN** each accepted canonical observation MUST invoke the one common
  ingress exactly once
- **AND** the same readonly native object MUST remain attached to that
  observation

#### Scenario: QMT map contains multiple valid codes

- **WHEN** backend receives a QMT schema-v2 frame with multiple native entries
- **THEN** it MUST resolve allowlist `securityId` independently for each
  provider-symbol key
- **AND** each accepted entry MUST produce one common ingress call
- **AND** each canonical snapshot MUST retain both that `securityId` and the
  original `providerSymbol`

#### Scenario: One QMT entry is malformed

- **WHEN** one map entry cannot pass strict QMT decoding
- **THEN** backend MUST reject that entry
- **AND** other valid entries in the same frame MUST still reach common ingress
- **AND** an exception from one conversion MUST remain contained to that entry

#### Scenario: TDX frame is accepted

- **WHEN** a TDX schema-v2 one-entry map passes common envelope and source-native validation
- **THEN** its provider-symbol key and native object MUST pass through the new TDX converter
- **AND** common ingress MUST be invoked for that accepted observation

#### Scenario: TDX frame has zero or multiple entries

- **WHEN** a TDX schema-v2 frame does not contain exactly one native-map entry
- **THEN** backend MUST reject the entire frame
- **AND** it MUST not select an arbitrary entry

#### Scenario: Converter implementation is inspected

- **WHEN** backend conversion dependencies are checked
- **THEN** TDX and QMT MUST each use its own new `native-snapshot.converter.ts`
- **AND** neither path MUST import, wrap or invoke the former schema-v1 adapter
- **AND** the converters MUST share no provider-native alias or mapping abstraction
- **AND** each converter input MUST contain only resolved `securityId`,
  `providerSymbol`, `capturedAt` and one readonly native object

#### Scenario: Native event time is unavailable

- **WHEN** an accepted fixture has no reliably parseable provider event time
- **THEN** canonical `eventTime` MUST be null
- **AND** backend MUST NOT fabricate provider event time from receipt time
- **AND** a price-valid observation MUST remain eligible for common ingress
- **AND** that observation MUST be ineligible for realtime aggregation

#### Scenario: Provider event time is available

- **WHEN** either source converter can parse its accepted provider-native
  business-time field
- **THEN** canonical `eventTime` MUST be derived from that native value
- **AND** QMT `time/stime/timetag` MUST be handled as fixture-backed candidates
  for one business time
- **AND** TDX MUST follow the same provider-time-only rule through its own
  fixture and converter
- **AND** datasource send time and backend receipt time MUST remain transport
  metadata only

#### Scenario: Canonical snapshot enters common ingress

- **WHEN** either source converter accepts one entry
- **THEN** canonical output MUST contain the same exact fields:
  `source`, `securityId`, `providerSymbol`, `eventTime`, `capturedAt`,
  `prices`, `cumulativeVolume`, `cumulativeAmount`, `quality` and `native`
- **AND** it MUST NOT contain `symbol`, epoch, sequence or event identity
- **AND** common latest MUST be keyed by `securityId`

#### Scenario: Equivalent state arrives twice

- **WHEN** either provider supplies the same native latest state again
- **THEN** backend MAY accept both observations and overwrite common latest
- **AND** it MUST NOT use equality, sequence or epoch to reject the second

#### Scenario: Provider symbol is not authorized for the connection source

- **WHEN** a native-map key cannot resolve through the current TDX or QMT source
  allowlist
- **THEN** backend MUST reject that entry before converter or common ingress
- **AND** it MUST not infer authorization or perform source transition from
  snapshot arrival

### Requirement: Native snapshot conversion belongs to the backend source boundary
Each backend source SHALL convert its own `RealtimeNativeFrame` into `CanonicalRealtimeSnapshot` before invoking shared realtime ingress, and shared ingress SHALL accept canonical snapshots without branching on provider-native fields.

#### Scenario: TDX frame enters backend
- **WHEN** the TDX realtime client receives a valid native frame
- **THEN** the TDX source adapter preserves its native object and maps its canonical fields before shared ingress

#### Scenario: QMT frame enters backend
- **WHEN** the QMT realtime client receives a valid native frame
- **THEN** the QMT source adapter preserves its native object and maps its canonical fields before shared ingress

#### Scenario: Shared ingress processes a snapshot
- **WHEN** a source adapter submits a `CanonicalRealtimeSnapshot`
- **THEN** shared ingress stores that snapshot without inspecting provider-native fields or choosing a provider adapter

### Requirement: Subscription capability parity is build-time

Each enabled TDX and QMT datasource SHALL implement all four subscription
operations, and both Mist provider clients SHALL implement the common
`RealtimeSubscriptionControl` in-process interface. Capability parity SHALL be
enforced by code interfaces, direct-method tests and health readiness; the
WebSocket protocol MUST NOT advertise a dynamic operation list.

#### Scenario: Builtin datasource becomes ready

- **WHEN** a TDX or QMT datasource establishes its backend WebSocket
- **THEN** all four operations MUST be implemented or the datasource MUST remain control-not-ready
- **AND** backend MUST NOT infer support from a capability array

#### Scenario: Backend client interface is inspected

- **WHEN** TDX and QMT realtime client implementations are loaded in tests
- **THEN** both MUST expose callable `syncSubscriptions`, `subscribe`,
  `unsubscribe` and `getSubscriptions` methods
- **AND** every method MUST be backed by request serialization, response
  matching and bounded completion rather than a stub
- **AND** callers MUST NOT receive a generic raw-message send API for
  subscription control

### Requirement: Subscription control requests have exact minimal shapes

Backend SHALL send one of four exact request messages:

```jsonl
{"type":"sync_subscriptions","symbols":["300502.SZ"]}
{"type":"subscribe","symbol":"300502.SZ"}
{"type":"unsubscribe","symbol":"300502.SZ"}
{"type":"get_subscriptions"}
```

#### Scenario: Full synchronization is requested

- **WHEN** backend sends `sync_subscriptions`
- **THEN** `symbols` MUST be a normalized, duplicate-free provider-symbol array
- **AND** no other request field is permitted

#### Scenario: One symbol is changed

- **WHEN** backend sends `subscribe` or `unsubscribe`
- **THEN** `symbol` MUST be one normalized provider symbol
- **AND** no array wrapper or other request field is permitted

#### Scenario: Current state is requested

- **WHEN** backend sends `get_subscriptions`
- **THEN** the message MUST contain no target field

#### Scenario: Request contains an unknown field

- **WHEN** datasource receives a request that does not match the exact shape
- **THEN** it MUST reject it without calling the provider

### Requirement: Subscription control responses use a simple success-or-failure union

Datasource SHALL map each request to exactly one response type:

```text
sync_subscriptions -> subscriptions_synced
subscribe          -> subscribed
unsubscribe        -> unsubscribed
get_subscriptions  -> subscriptions
```

Every response SHALL contain top-level `type`, `provider`, `timestamp` and `data`. `data` SHALL contain exactly one key: `success` or `failure`.

#### Scenario: Provider operation succeeds

- **WHEN** a provider-specific operation succeeds
- **THEN** `data.success` MUST carry the provider-specific native value or null when that operation has no value
- **AND** QMT `subscribe` MUST expose its exact integer `subId`, including `0`

#### Scenario: QMT full synchronization succeeds

- **WHEN** QMT `sync_subscriptions` replaces a non-empty desired set
- **THEN** `subscriptions_synced.data.success` MUST be the exact integer returned by the replacement `subscribe_whole_quote`
- **AND** an empty-set cancel-all MUST instead return `success:null`

#### Scenario: QMT single unsubscribe succeeds

- **WHEN** QMT `unsubscribe` receives exact bool `true`, or an explicitly
  configured integer value backed by separate HIL evidence
- **AND** datasource durably records its result and registry transition
- **THEN** `unsubscribed.data.success` MUST be null
- **AND** the exact native return type/value MUST remain in the QMT journal
- **AND** the callback counters and verification metadata MUST remain datasource-private

#### Scenario: QMT confirmed unsubscribe cannot be made durable

- **WHEN** QMT receives exact bool `true` or an explicitly HIL-qualified integer
  success value but cannot append, flush and `fsync` the matching result or
  registry transition
- **THEN** `data.failure` MUST contain exactly
  `{symbol,reason:"QMT_JOURNAL_DURABILITY_FAILED",subscriptionState:"unknown"}`
- **AND** the retained ID marker and `reconciliationRequired` health state MUST remain datasource-private
- **AND** the response MUST NOT claim that the handle remains live or add recovery metadata

#### Scenario: QMT intent cannot be made durable before cancellation

- **WHEN** QMT cannot make an unsubscribe or reset-cancellation intent durable and therefore exposes no native call
- **THEN** the failure reason MUST be `QMT_JOURNAL_DURABILITY_FAILED`
- **AND** `subscriptionState` MUST be `subscribed` when the unchanged registry proves membership

#### Scenario: TDX mutation succeeds

- **WHEN** TDX `sync_subscriptions`, `subscribe` or `unsubscribe` reaches its provider-list postcondition
- **THEN** the corresponding backend-facing response MUST contain
  `data.success=null`
- **AND** an immediate HTTP or bridge payload MUST NOT replace that postcondition

#### Scenario: Non-cancellation operation fails for one symbol

- **WHEN** a subscribe, list or post-cancellation convergence failure can be attributed to a provider symbol
- **THEN** `data.failure` MUST contain exactly `symbol` and `reason`
- **AND** `symbol` MUST contain that provider symbol

#### Scenario: Unsubscribe operation fails

- **WHEN** `unsubscribe` cannot report success
- **THEN** `data.failure` MUST contain exactly `symbol`, `reason` and `subscriptionState`
- **AND** `subscriptionState` MUST be either `subscribed` or `unknown`
- **AND** it MUST be `subscribed` only when authoritative current evidence proves the target remains subscribed
- **AND** it MUST be `unknown` when the physical result cannot be proven

#### Scenario: Cancellation succeeds

- **WHEN** the target is proven absent from the provider subscription set
- **THEN** the response MUST contain `data.success=null`
- **AND** a failure MUST NOT use `subscriptionState=unsubscribed`

#### Scenario: Reset cancellation fails

- **WHEN** the selected backend-facing `sync_subscriptions` failure comes from
  its cancellation stage
- **THEN** `data.failure` MUST contain exactly `symbol`, `reason` and `subscriptionState`
- **AND** a later subscribe or convergence-stage failure MUST instead use the generic `symbol/reason` shape

#### Scenario: Reset-level failure has no single target

- **WHEN** a whole reset fails and no one symbol identifies the failure
- **THEN** `data.failure.symbol` MUST be null
- **AND** `data.failure.reason` MUST be a stable low-cardinality reason
- **AND** `subscriptionState` MUST still be present when that failure is a whole-handle cancellation failure

#### Scenario: Reset contains multiple failures

- **WHEN** a provider reset observes more than one failed native step
- **THEN** its one backend-facing failure MUST select the first failure in the
  provider's documented deterministic execution order
- **AND** complete step failures MUST remain in provider-local journal/log evidence rather than an array in the response

#### Scenario: Response shape is inspected

- **WHEN** contract tests inspect a control response
- **THEN** it MUST NOT contain an acknowledgement message, correlation ID, revision, CAS value, retry directive, raw provider payload, `Error`, `ErrorId`, full subscription list, common subscription state union or result-retention metadata
- **AND** it MUST NOT contain `retained-recovery`, `reconciliationRequired`, journal health or rotation state

### Requirement: Control is serial on each provider connection

Backend and datasource SHALL allow at most one outstanding subscription request for each provider WebSocket. Each provider implementation SHALL apply a fixed, bounded internal timeout that is not negotiated in the wire contract. This release SHALL assume loopback/single-device operation and SHALL not implement concurrent correlation, automatic retry, replay or deduplication.

#### Scenario: A second request arrives while one is outstanding

- **WHEN** a provider control request is still executing
- **THEN** the next in-process method call MUST fail with a stable local busy
  result
- **AND** datasource MUST NOT execute two provider mutations concurrently
- **AND** backend MUST NOT create an unbounded client-side queue

#### Scenario: A mutation response is lost

- **WHEN** the connection closes before backend receives the result
- **THEN** backend MUST treat the outcome as unknown
- **AND** it MUST not read, retry or replay automatically
- **AND** a future caller MUST explicitly invoke `getSubscriptions` before it
  chooses another mutation

#### Scenario: Provider control reaches its internal timeout

- **WHEN** no accepted native result or provider postcondition arrives before the fixed source-local deadline
- **THEN** datasource MUST return the simple failure union with a stable timeout reason
- **AND** it MUST not execute the operation again automatically

### Requirement: Subscription state remains provider-specific

`get_subscriptions` SHALL return the provider-native state needed by the caller without forcing TDX and QMT into a common state schema.

#### Scenario: QMT subscriptions are read

- **WHEN** QMT handles are requested
- **THEN** `data.success` MUST contain nullable `whole{subId,symbols}` plus `singles{providerSymbol:subId}`
- **AND** `whole.subId` and `whole.symbols` MUST either both be present or both be absent
- **AND** kind MUST be determined by the registry bucket, never by the numeric ID
- **AND** no QMT provider call or journal replay is permitted for this read
- **AND** a `retained-recovery` ID MAY remain in its original bucket as a conservative datasource-known upper bound, but its private marker and reconciliation state MUST be exposed only through health and structured diagnostics

#### Scenario: TDX subscriptions are read

- **WHEN** TDX subscriptions are requested
- **THEN** datasource MUST request a fresh terminal-native list observation
  through its private read barrier
- **AND** `data.success` MUST be the normalized provider-symbol list returned by
  the current bridge owner for that observation
- **AND** datasource MUST NOT synthesize QMT-style handles

### Requirement: TDX control uses one revisioned source-local target

TDX SHALL expose the same four backend-facing message types while preserving
its existing terminal bridge: subscribe, unsubscribe and native active-list
observation execute inside the TDX terminal, while datasource owns desired
state and orchestration. Datasource SHALL serialize all three mutations through one
source-local mutation gate and atomically establish the unique transport target
before any provider mutation: subscribe uses current desired union symbol,
unsubscribe uses current desired difference symbol and sync uses the exact
normalized set. It SHALL reuse the existing internal `desiredRevision` fence
without adding revision to the backend-facing wire.

#### Scenario: TDX subscribes one symbol

- **WHEN** backend sends `subscribe`
- **THEN** datasource MUST first publish the union target and advance the
  existing internal desired revision when the target changes
- **AND** datasource MUST use the existing TDX bridge subscription mechanism
- **AND** the TDX subscription poll/result wire MAY add only a
  datasource-private `nativeProbeRevision` read barrier
- **AND** the separately simplified snapshot request MUST not affect control convergence
- **AND** it MUST return `success:null` only after the bridge/native list contains the symbol

#### Scenario: TDX unsubscribes one symbol

- **WHEN** backend sends `unsubscribe`
- **THEN** datasource MUST first remove the symbol from transport desired and
  advance the existing internal desired revision when the target changes
- **AND** the bridge MUST then execute native `unsubscribe_hq`
- **AND** unsubscribe MUST return `success:null` only after a fresh current-owner
  native list no longer contains the symbol
- **AND** a success, provider failure or verification failure MUST NOT restore
  the old desired target

#### Scenario: TDX subscriptions are read through a fresh terminal-native probe

- **WHEN** backend sends `get_subscriptions`
- **THEN** datasource MUST increment a private `nativeProbeRevision`
- **AND** the terminal bridge MUST execute native
  `get_subscribe_hq_stock_list` and echo that revision in its result
- **AND** datasource MUST return the normalized list as `data.success` only
  after the current owner/epoch result satisfies the barrier

#### Scenario: Bridge poll races with unsubscribe desired transition

- **WHEN** a bridge poll occurs after unsubscribe has acquired the source-local
  mutation gate but before its native cancellation and verification complete
- **THEN** datasource MUST expose either no reconcile mutation or one derived
  from the new desired revision that excludes the symbol
- **AND** it MUST NOT expose a subscribe instruction for that symbol from the
  old desired target
- **AND** a result already in flight for an older desired revision MUST remain
  subject to the existing stale-revision rejection
- **AND** later poll/result cycles MUST converge to and retain the symbol-absent
  target

#### Scenario: TDX immediate unsubscribe result contradicts the native list

- **WHEN** `unsubscribe_hq` returns text, `ErrorId`, another payload or raises but
  a subsequent fresh terminal-native list no longer contains the symbol
- **THEN** datasource MUST return `unsubscribed.data.success=null`
- **AND** the immediate payload or exception MUST remain only in bounded local log/evidence

#### Scenario: TDX unsubscribe does not converge

- **WHEN** the valid fresh post-operation native list still contains the symbol
- **THEN** datasource MUST return exactly `failure{symbol,reason:"TDX_UNSUBSCRIBE_NOT_CONVERGED",subscriptionState:"subscribed"}`

#### Scenario: TDX unsubscribe cannot be verified

- **WHEN** the post-operation native list probe fails, times out, is fenced or cannot be normalized
- **THEN** datasource MUST return exactly `failure{symbol,reason:"TDX_UNSUBSCRIBE_VERIFY_FAILED",subscriptionState:"unknown"}`

#### Scenario: TDX symbol is already absent

- **WHEN** a fresh authoritative native list excludes the symbol
- **THEN** datasource MUST still remove the symbol from transport desired before
  treating the request as idempotently converged
- **AND** it MUST return `success:null` without requiring a provider error interpretation

#### Scenario: TDX performs a full sync

- **WHEN** backend sends `sync_subscriptions`
- **THEN** datasource MUST first publish the exact normalized set as transport
  desired under the source-local mutation gate
- **AND** the existing bridge MUST sequentially unsubscribe extras, subscribe
  missing symbols and observe the complete terminal-native list
- **AND** no poll interleaving with clear or verification may derive reconcile
  work from the superseded desired target
- **AND** temporary duplicate or opposing provider calls MAY converge through the next native list
- **AND** it MUST return `success:null` only after the current-owner native list equals the normalized exact desired set
- **AND** a selected cancellation-stage failure MUST use
  `failure{symbol,reason,subscriptionState}` while a subscribe/convergence-stage
  failure MUST use `failure{symbol,reason}`

### Requirement: Backend and datasource use one formal frame version

Backend and datasource SHALL use only schema v2 defined by
`realtime-market-data-ingress` for both TDX and QMT. Equal formal envelopes
SHALL NOT require equal provider-native object fields.

#### Scenario: QMT frame arrives

- **WHEN** `provider=qmt`
- **THEN** backend MUST require `data.schemaVersion=2`, `data.capturedAt` and `data.native` as a provider-symbol map
- **AND** it MUST NOT require an outer symbol

#### Scenario: TDX frame arrives

- **WHEN** `provider=tdx`
- **THEN** backend MUST require the same
  `data{schemaVersion:2,capturedAt,native}` contract
- **AND** `native` MUST be a provider-symbol map even when it contains one entry
- **AND** the TDX native object MUST pass through its new TDX-specific converter

#### Scenario: Legacy version arrives

- **WHEN** either provider sends schema v1 or any removed formal metadata
- **THEN** backend MUST reject the frame as a stable contract mismatch
- **AND** it MUST NOT fall back to the former adapter or epoch/sequence fence

### Requirement: Providers Shall Normalize Realtime Quantities At Their Own Boundaries
TDX and QMT adapters SHALL validate their native volume and amount fields according to provider-specific
contracts before producing canonical decimal strings. For supported A-share stocks, the resulting canonical
unit SHALL be shares for volume and CNY yuan for amount.

#### Scenario: A native quantity is absent
- **WHEN** a provider omits an approved optional quantity or explicitly supplies null
- **THEN** the canonical field MUST remain null
- **AND** it MUST remain distinguishable from explicit zero

#### Scenario: A present native quantity is malformed
- **WHEN** a provider supplies a quantity with an empty value, type, sign, syntax, scale, finiteness, field
  length or range that violates its approved adapter contract
- **THEN** that symbol MUST fail closed rather than be converted to null
- **AND** another valid symbol in a multi-symbol QMT frame MAY continue independently

#### Scenario: TDX supplies a quantity as a number
- **WHEN** the accepted TDX contract requires a native decimal string
- **THEN** the frame MUST fail closed
- **AND** the backend MUST NOT infer a string by calling `String(number)`

#### Scenario: TDX supplies an oversized decimal string
- **WHEN** a present TDX `Volume` or `Amount` string exceeds 37 ASCII characters
- **THEN** the single-symbol snapshot MUST fail closed before decimal parsing or normalization
- **AND** the datasource native-object and backend frame byte limits MUST NOT substitute for the field limit

#### Scenario: The accepted TDX production runtime supplies quantity strings
- **WHEN** the pinned TDX bridge/runtime supplies native hands and ten-thousand-yuan decimal strings
- **THEN** the adapter MUST scale volume by `100` and amount by `10000`
- **AND** it MUST emit canonical shares/yuan strings through exact Decimal8 integer scaling
- **AND** it MUST NOT select or change the profile from payload values at runtime

#### Scenario: TDX bridge or runtime identity changes
- **WHEN** deployment changes the accepted terminal, bridge or runtime identity
- **THEN** candle productization MUST remain off or shadow until the fixed quantity profile is revalidated
- **AND** an observed profile contradiction MUST be handled by a reviewed OpenSpec delta rather than runtime
  inference or automatic profile switching

#### Scenario: QMT supplies native volume and amount
- **WHEN** safe integer volume and finite observable float amount pass the approved bounds
- **THEN** the adapter MUST scale stock volume from hands to shares by exact multiplication by `100`
- **AND** it MUST normalize amount as the provider's observable CNY-yuan value without rounding
- **AND** both outputs MUST be canonical decimal strings
- **AND** amount MUST retain approved provider-float precision provenance through source plus fixed adapter
  contract rather than a per-record precision field
- **AND** the adapter MUST range-check its canonical output without inventing a raw-text limit for native
  numeric input

#### Scenario: A non-stock security reaches quantity normalization
- **WHEN** the security is outside the approved A-share `SecurityType.STOCK` unit profile
- **THEN** the adapter MUST NOT apply the stock `×100` or `×10000` factors
- **AND** that security MUST remain ineligible for candle productization until its own unit contract is approved

#### Scenario: A quantity anomaly has not naturally occurred
- **WHEN** no real missing-field, malformed-value or profile-drift incident exists in current evidence
- **THEN** deterministic negative tests MUST prove fail-closed adapter behavior
- **AND** the absent incident MUST remain `not-observed` under `capture-realtime-provider-anomalies`
- **AND** lack of a manufactured anomaly MUST NOT block implementation or normal-path release

### Requirement: Candle HIL Shall Reuse Existing Datasource and Backend Read Boundaries
Realtime candle acceptance SHALL reuse existing datasource/backend outputs rather than add a parallel snapshot
collector. A closing comparison MAY call the existing datasource historical read boundary directly for evidence;
that read SHALL NOT become a production history dependency or write MySQL.

#### Scenario: Normal trading-time evidence is collected
- **WHEN** shadow HIL validates accepted TDX or QMT realtime quantities and candle output
- **THEN** it MUST read existing typed datasource/backend frames, health, bounded diagnostics or product output
- **AND** it MUST NOT add another provider callback, subscription or snapshot collection path

#### Scenario: A closing historical comparison is required
- **WHEN** HIL compares realtime price and quantity results with a same-source closing bar
- **THEN** the harness MAY call the existing datasource historical endpoint read-only
- **AND** the result MUST remain validation evidence without a MySQL write
- **AND** production next-day consumers MUST continue to use the owning MySQL provider-history boundary

### Requirement: TDX Realtime Candle Time Shall Use Datasource Capture Time
The accepted TDX `get_market_snapshot` runtime does not expose provider business time. The TDX source converter
SHALL use the schema-v2 envelope's validated `capturedAt` as canonical `eventTime` and SHALL NOT inspect a native
time alias. This source-specific rule SHALL NOT change QMT event-time resolution.

#### Scenario: A current TDX native snapshot is accepted
- **WHEN** the common schema-v2 decoder accepts RFC3339 `capturedAt` and the TDX native object
- **THEN** the TDX converter MUST set canonical `eventTime` to that exact `capturedAt`
- **AND** canonical quality MUST mark event time available and aggregation eligible
- **AND** the original `capturedAt` MUST remain present for provenance

#### Scenario: A TDX payload contains a time-looking native field
- **WHEN** native contains `AsOf`, `DateTime`, a case variant or another time-like key
- **THEN** the TDX converter MUST ignore it for canonical event-time selection
- **AND** it MUST continue to use validated datasource `capturedAt`

#### Scenario: QMT has no consistent native business time
- **WHEN** QMT native time candidates are absent, invalid or conflicting
- **THEN** QMT MUST remain `eventTime=null` and aggregation-ineligible
- **AND** it MUST NOT reuse the TDX capture-time rule

### Requirement: Internal control validates symbols through ACTIVE immutable assignments and effective state

The TDX and QMT client methods SHALL accept normalized provider symbols and SHALL validate coordinator requests through current immutable realtime assignment inventory before sending control. Mist backend SHALL be sole owner of business authorization and `providerSymbol -> securityId` resolution; `Security.status=ACTIVE` SHALL determine desired membership. Datasource current handle membership SHALL remain a separate provider-allocation check and SHALL NOT be treated as a second business allowlist. TDX datasource's revisioned transport desired state SHALL continue to be updated only by accepted TDX control calls and SHALL not become Mist business desired store.

#### Scenario: An assigned provider symbol is passed

- **WHEN** the coordinator invokes a control method with a symbol that resolves through the current source assignment inventory
- **THEN** backend MUST send that exact normalized provider symbol on the current provider WebSocket
- **AND** QMT MUST retain its market suffix while `Security.code` remains suffix-free

#### Scenario: A provider symbol is not assigned to the source

- **WHEN** one requested provider symbol does not resolve through an immutable assignment for that source
- **THEN** the client method MUST fail locally before sending any control request
- **AND** a partial `syncSubscriptions` request MUST NOT be sent

#### Scenario: Assignments attempt to resolve the same security to both sources

- **WHEN** persisted TDX and QMT assignment inventory would resolve the same canonical `securityId`
- **THEN** initialization or startup validation MUST fail closed before either source is admitted to production lifecycle
- **AND** backend MUST NOT choose a source from arrival order or snapshot freshness

#### Scenario: An assigned Security becomes ACTIVE during the add-only window

- **WHEN** an assigned Security becomes ACTIVE during weekday 09:15–15:00 `Asia/Shanghai`
- **THEN** lifecycle coordinator MAY call only incremental `subscribe` for its immutable provider symbol followed by readback
- **AND** source/providerSymbol MUST remain unchanged
- **AND** the action MUST NOT cancel or rebuild unrelated subscriptions

#### Scenario: An assigned Security becomes inactive

- **WHEN** an assigned Security becomes SUSPENDED or DELISTED
- **THEN** no public application path or status observer MUST call incremental `unsubscribe`
- **AND** removal MUST wait for ready/reconnect or weekday 09:15 full reset

#### Scenario: Effective membership changes

- **WHEN** fresh provider-specific readback proves a symbol was added or removed
- **THEN** backend MUST atomically replace that source's effective inventory
- **AND** snapshot authorization/latest cleanup/candle listener changes MUST follow effective evidence rather than desired intent alone

