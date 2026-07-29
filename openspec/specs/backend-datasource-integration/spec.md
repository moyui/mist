# backend-datasource-integration Specification

## Purpose

TBD - created by archiving change connect-backend-to-datasource. Update Purpose after archive.
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

The backend realtime leader SHALL resolve the configured symbol set, maintain it
locally, and resync the complete set after every datasource WebSocket
connection.

#### Scenario: Datasource sends ready

- **WHEN** the backend receives a WebSocket `ready` message from the datasource
- **THEN** it sends `sync_subscriptions` with the full locally desired symbol
  set before relying on new snapshot events

#### Scenario: Backend subscribes after connection

- **WHEN** backend collection subscribes a security while the WebSocket is open
- **THEN** the client records the symbol locally and sends
  `sync_subscriptions` with the full desired symbol set

#### Scenario: WebSocket reconnects

- **WHEN** the WebSocket reconnects after disconnect
- **THEN** the client sends `sync_subscriptions` with all locally desired
  symbols again

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

- **WHEN** backend unit tests run for the TDX realtime client
- **THEN** they verify `ready`, full-set `sync_subscriptions`, native snapshot,
  `stream_started`, reconnect, and error behavior

#### Scenario: Deployment script tests cover configured URL

- **WHEN** deployment script tests run
- **THEN** they verify the Windows Docker health check covers both host
  datasource health and container-to-host datasource health

#### Scenario: Datasource tests cover canonical WebSocket envelopes

- **WHEN** datasource tests run for WS protocol and quote routes
- **THEN** they verify pong timestamps, canonical error payloads, data-based
  subscription acknowledgements, and centrally serialized TDX native snapshots

#### Scenario: Removed route tests cover the stable boundary

- **WHEN** datasource route contract tests run
- **THEN** they verify `/api/tdx/*`, `/ws/quote/*`, and
  `/v1/snapshots/query` are absent
- **AND** they verify `/v1/bars/query` and the builtin realtime route remain

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
The backend TDX leader SHALL send the complete desired subscription set over its datasource realtime WebSocket and SHALL NOT call a loopback-only HTTP desired-state route from Docker.

#### Scenario: TDX ready frame is accepted
- **WHEN** the backend accepts a valid TDX ready frame
- **THEN** it sends one `sync_subscriptions` WebSocket message containing the complete resolved allowlist

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
The backend SHALL keep source-specific WebSocket clients and transport stores while routing every accepted frame through one `RealtimeSnapshotIngressService`.

#### Scenario: Transport frame is rejected
- **WHEN** contract, authorization, epoch or sequence validation rejects a frame
- **THEN** common ingress is not invoked and a stable source-labelled drop reason is recorded

#### Scenario: Transport frame is accepted
- **WHEN** source fencing accepts a frame
- **THEN** exactly one source adapter and the common ingress are invoked with the same validated native object

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
