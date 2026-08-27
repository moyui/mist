# bigqmt-datasource-bridge Specification

## Purpose
Define the QMT datasource bridge surface: native history and owner/command/result routes plus subscription-control and callback snapshot routes gated by `QMT_REALTIME_MODE`, an independent Windows service and official snake_case market-data parameters.
## Requirements
### Requirement: QMT service exposes only the native production surface

The QMT datasource SHALL retain the existing native history and owner/command/result routes and SHALL expose separate subscription control and callback snapshot routes only when `QMT_REALTIME_MODE=builtin`.

#### Scenario: QMT service route table is inspected

- **WHEN** the QMT datasource starts in `builtin`
- **THEN** `GET /health`, `POST /v1/bars/query`, existing `/qmt/bridge/owner`, `/qmt/bridge/poll`, `/qmt/bridge/result` and history health routes MUST remain available
- **AND** it MUST expose:
  - `POST /qmt/bridge/subscriptions/poll`
  - `POST /qmt/bridge/subscriptions/result`
  - `POST /qmt/bridge/subscriptions/snapshot`
- **AND** the maintained runtime MUST NOT expose legacy or experimental realtime transports

#### Scenario: QMT off route table is inspected

- **WHEN** the QMT datasource starts with `QMT_REALTIME_MODE=off`
- **THEN** subscription control, callback snapshot forwarding and formal realtime WebSocket output MUST be disabled
- **AND** QMT historical bars plus their existing owner/command/result surface MUST remain available

### Requirement: QMT datasource service has independent Windows deployment
The QMT datasource SHALL be deployable as its own Windows WinSW service,
separate from the TDX datasource service and separate from full-QMT strategy
script lifecycle actions.

#### Scenario: QMT datasource service is managed by deployment automation
- **WHEN** the QMT datasource deployment workflow runs
- **THEN** it MUST manage the `mist-qmt-datasource` WinSW service on `:9002`
- **AND** it MUST start `qmt.main:app`
- **AND** it MUST check `/health` and `/qmt/bridge/health`
- **AND** it MUST NOT validate or write TDX SDK settings
- **AND** it MUST NOT create, load, register, or delete full-QMT strategy
  scripts

### Requirement: QMT bars query uses official snake_case market-data parameters
The QMT bars endpoint SHALL accept QMT native request fields shaped after
`ContextInfo.get_market_data_ex`.

#### Scenario: QMT bars request is accepted
- **WHEN** a caller posts to `:9002/v1/bars/query`
- **THEN** the request body MUST accept `fields`, `stock_list`, `period`,
  `start_time`, `end_time`, `count`, `dividend_type`, `fill_data`, and
  `include_raw`
- **AND** the request body MUST NOT accept TDX-style `symbols`, `startTime`,
  `endTime`, `dividendType`, or `fillData`
- **AND** the HTTP API MUST NOT expose `subscribe`
- **AND** the datasource MUST execute historical semantics equivalent to
  `get_market_data_ex(..., subscribe=False)`

#### Scenario: Historical period is requested
- **WHEN** a caller supplies a QMT period
- **THEN** the datasource MUST forward it unchanged to `get_market_data_ex`
- **AND** it MUST preserve any native unsupported-period failure instead of
  guessing another data source

### Requirement: QMT bars response is native marketData
The QMT bars endpoint SHALL return QMT native column-oriented market data
instead of the TDX row contract.

#### Scenario: Native bridge bars are returned
- **WHEN** the full-QMT bridge completes `get_market_data_ex`
- **THEN** the response envelope MUST set `provider` to `qmt`
- **AND** `data.marketData` MUST map stock code to `{field: {stime: value}}`
- **AND** `data.source` MUST identify the source as `native_bridge`
- **AND** the response MUST NOT include `data.bars[]` or the TDX bar row model rows

#### Scenario: Raw evidence is requested
- **WHEN** the request sets `include_raw=true`
- **THEN** the response MUST include bounded bridge evidence with the native
  method and command id
- **AND** it MUST NOT expose the owner lease token

### Requirement: QMT history has no DAT dependency
The QMT datasource SHALL NOT contain a local DAT reader or require a QMT data
directory path.

#### Scenario: Native bridge is unavailable
- **WHEN** the product bars path has no fresh bridge owner or native execution fails
- **THEN** the datasource MUST return a stable bridge error
- **AND** it MUST NOT open or parse a DAT file

#### Scenario: Service configuration is inspected
- **WHEN** operators inspect QMT datasource settings and WinSW configuration
- **THEN** no QMT DAT path or DAT reader setting MUST be present

### Requirement: Production bridge uses HTTP polling only

The full-QMT production bridge SHALL remain QMT-initiated and use Python standard-library loopback HTTP for history command polling, subscription control polling/results and callback snapshot submission. Subscription callbacks SHALL be provider output, not a command-intake mechanism.

#### Scenario: Bridge script polls for work

- **WHEN** QMT invokes the strategy `run_time` callback
- **THEN** bridge MUST poll and execute history/subscription native work serially and drain bounded callback snapshots
- **AND** it MUST not open a listener, WebSocket or realtime-duplex connection

#### Scenario: Bridge script is inspected

- **WHEN** static checks inspect the production bridge
- **THEN** it MUST use standard-library HTTP
- **AND** it MUST not require `requests`, subprocess/process APIs, background worker threads or unverified third-party dependencies

### Requirement: QMT historical status reflects bounded lifecycle state
The QMT historical command API SHALL distinguish active, completed, and unknown
commands while preserving the existing single-owner, one-command/one-result
bridge protocol.

#### Scenario: Command is still active
- **WHEN** status is requested for a pending or in-flight command
- **THEN** the API returns HTTP `202` with pending status

#### Scenario: Command result is retained
- **WHEN** status is requested for a completed command within result retention
- **THEN** the API returns HTTP `200` with its terminal success or failure

#### Scenario: Command is unknown or expired
- **WHEN** status is requested for an ID that is neither active nor retained
- **THEN** the API returns HTTP `404`
- **AND** it MUST NOT describe that ID as indefinitely pending

#### Scenario: Command intake is over capacity
- **WHEN** an HTTP caller submits a command that cannot be safely accepted
- **THEN** the API returns a stable structured capacity or payload error
- **AND** no native command is exposed to the terminal bridge

### Requirement: Historical command/result remains one shot

The existing history bridge SHALL continue to poll one command, call the current historical provider function and submit one result. Subscription callbacks MUST NOT be submitted to the history result route.

#### Scenario: Historical bars are requested

- **WHEN** datasource enqueues an existing history command
- **THEN** bridge MUST execute the unchanged `get_market_data_ex(..., subscribe=False)` path
- **AND** exactly one history result MUST complete that command

#### Scenario: Realtime callback is received

- **WHEN** a subscription callback fires after its subscribe command already completed
- **THEN** bridge MUST enqueue it for `/qmt/bridge/subscriptions/snapshot`
- **AND** it MUST NOT overwrite, reopen or append to a history command result

### Requirement: Subscription control is one native call at a time

The subscription poll/result pair SHALL carry at most one native method
invocation at a time. Datasource SHALL assign each exposed invocation a
process-local strictly increasing positive integer `callSequence`. The bridge
SHALL execute the exact method and argument supplied by datasource and return
one simple result carrying the same `callSequence`.

#### Scenario: Poll authenticates the current bridge

- **WHEN** bridge requests subscription work
- **THEN** its poll request body MUST contain exactly
  `ownerId`, `leaseToken` and integer `generation`
- **AND** the poll response body MUST contain exactly `command`
- **AND** owner lease fields and `streamEpoch` MUST NOT appear inside a
  non-null command

#### Scenario: Poll has no work

- **WHEN** datasource has no pending subscription native call
- **THEN** poll MUST return exactly `{"command":null}`
- **AND** bridge MUST continue normal bounded runtime processing

#### Scenario: Poll returns work

- **WHEN** datasource has one pending native call
- **THEN** no second call may be exposed until the first result is accepted or explicitly abandoned
- **AND** every newly exposed call MUST receive a `callSequence` greater than all
  calls previously exposed by that datasource process
- **AND** bridge MUST invoke exactly one of `subscribe_quote`, `subscribe_whole_quote` or `unsubscribe_quote`
- **AND** each command MUST contain only `callSequence`, its exact method and
  the method-specific fields defined by the QMT subscription transport

#### Scenario: Native invocation succeeds

- **WHEN** the method returns without raising
- **THEN** bridge MUST print one bounded structured result log before posting the result
- **AND** it MUST post one `success` with the JSON-safe native value and the
  unchanged `callSequence`

#### Scenario: Native invocation fails

- **WHEN** the method is missing, raises or returns a non-JSON-safe result
- **THEN** bridge MUST contain the exception
- **AND** it MUST print and post one `failure` with a bounded reason and the
  unchanged `callSequence`
- **AND** it MUST NOT derive backend-facing `subscriptionState`; datasource owns
  that enrichment
- **AND** the QMT strategy runtime MUST continue

#### Scenario: Result post fails

- **WHEN** datasource cannot accept a result
- **THEN** bridge MUST retain evidence in its QMT-captured log
- **AND** it MUST NOT automatically re-execute or replay the native call

#### Scenario: A result arrives after the slot was reused

- **WHEN** a late result carries a lower `callSequence` than the current slot
- **THEN** datasource MUST reject and log the late result
- **AND** it MUST leave the current slot and subscription registry unchanged

### Requirement: Bridge keeps no durable subscription registry

The bridge SHALL not be the durable owner of whole/single subscription state. Datasource SHALL own the live in-memory registry and local JSONL journal; bridge SHALL retain only callback closures, current transport identity and bounded ephemeral queues required by the active QMT context.

#### Scenario: A subscribe returns an ID

- **WHEN** bridge observes the native return value
- **THEN** it MUST print method, symbols, returned type/value, context/build identity and timestamp in a bounded structured log
- **AND** datasource MUST decide whether and where to store the ID after accepting the result

#### Scenario: Strategy context reloads

- **WHEN** the embedded QMT context is recreated
- **THEN** ephemeral callbacks and queues from the old context MUST be discarded
- **AND** this release MUST require operator reconciliation rather than pretend that bridge memory is crash recovery

### Requirement: Callback queue is bounded and drained outside callback execution

The QMT bridge SHALL use a thread-safe bounded queue. Callback execution SHALL only copy and enqueue the complete `{code: tickData}` map; the regular `run_time` loop SHALL submit snapshots.

#### Scenario: Callback executes concurrently or re-enters

- **WHEN** QMT invokes one or more callbacks concurrently
- **THEN** queue mutation MUST remain thread-safe
- **AND** callback MUST not perform loopback HTTP or provider queries

#### Scenario: One callback code entry violates copy bounds

- **WHEN** one entry cannot pass structural copy, JSON-safety or size/depth limits
- **THEN** bridge MUST drop only that entry without interpreting provider fields
- **AND** other accepted code entries MUST remain in the one queued callback map

#### Scenario: Runtime loop drains the queue

- **WHEN** one queue item is eligible
- **THEN** `run_time` MUST post one wrapper to `/qmt/bridge/subscriptions/snapshot`
- **AND** one whole callback map MUST not be split into multiple HTTP requests

#### Scenario: Snapshot post fails

- **WHEN** a POST cannot complete
- **THEN** bridge MUST use bounded failure handling and drop the observation
- **AND** it MUST not block callbacks or retry indefinitely

### Requirement: Subscription transport uses the existing owner lease standard

Subscription poll, result and snapshot requests SHALL carry the existing QMT
owner fence: `ownerId`, opaque `leaseToken` and integer `generation`.
Datasource SHALL validate all three fields and use constant-time comparison for
the token. This release SHALL NOT add another context identity or `streamEpoch`
to the QMT owner contract.

#### Scenario: Bridge initializes

- **WHEN** no current lease is available
- **THEN** bridge MUST register with the existing owner route
- **AND** bridge MUST use the process-level `ownerId` generated once at script
  load as `bigqmt-<process-id>`
- **AND** normal polling MUST serve as heartbeat rather than registering every second

#### Scenario: Lease is rejected

- **WHEN** any subscription route rejects the current owner, lease or generation
- **THEN** bridge MUST stop submitting under that identity and re-register before continuing
- **AND** the token MUST not be printed or persisted

### Requirement: Builtin bridge remains Python 3.6 compatible

The complete installed QMT bridge artifact SHALL parse and run under embedded Python 3.6, including runtimes where `__file__` is absent.

#### Scenario: Python 3.6 syntax gate runs

- **WHEN** the bridge is compiled with the project Python 3.6 compatibility check
- **THEN** it MUST not use parameterized builtin annotations, `X | Y`, `match`, assignment expressions or another unsupported syntax

#### Scenario: Script path metadata is unavailable

- **WHEN** QMT executes the strategy without `__file__`
- **THEN** bridge build identity and configuration resolution MUST use a safe fallback
- **AND** initialization MUST not fail solely because that global is absent

#### Scenario: Callback payload is not a dict map

- **WHEN** a callback receives a DataFrame, malformed value or unsafe nested object
- **THEN** callback MUST reject it without bulk conversion
- **AND** the exception MUST not escape into QMT

### Requirement: Terminal bridge deployment remains manual

The QMT builtin bridge SHALL continue to be installed only by an operator. Datasource or deploy automation MUST NOT silently replace it.

#### Scenario: Compatible application services are deployed

- **WHEN** datasource and backend images containing the new routes are available
- **THEN** no workflow may copy the bridge into QMT automatically
- **AND** the operator MUST manually import the exact QMT bridge and record the
  import artifact path/SHA-256, QMT project identity and runtime build ID
- **AND** when QMT does not expose a file-backed installed path, evidence MUST
  record `platform_unavailable` rather than inventing a path or SHA
- **AND** the running bridge MUST expose bounded read-only
  `runtime_introspection` containing its runtime fingerprint, Python/runtime
  metadata and availability of the required native methods

#### Scenario: Bridge-first maintenance window begins

- **WHEN** the operator installs the new bridge before compatible services are switched
- **THEN** temporary subscription-route errors are an accepted maintenance-window condition
- **AND** the bridge MUST not report callback transport ready until compatible datasource routes accept it
