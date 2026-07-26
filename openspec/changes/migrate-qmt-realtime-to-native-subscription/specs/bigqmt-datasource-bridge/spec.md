## MODIFIED Requirements

### Requirement: QMT service exposes only the native production surface

The QMT datasource SHALL retain the existing native history and owner/command/result routes and SHALL expose separate subscription control and callback snapshot routes only when `QMT_REALTIME_MODE=builtin`.

#### Scenario: QMT builtin route table is inspected

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

### Requirement: Production bridge uses HTTP polling only

The full-QMT production bridge SHALL remain QMT-initiated and use Python standard-library loopback HTTP for history command polling, subscription control polling/results and callback snapshot submission. Subscription callbacks SHALL be provider output, not a command-intake mechanism.

#### Scenario: Bridge run_time executes

- **WHEN** QMT invokes the strategy `run_time` callback
- **THEN** bridge MUST poll and execute history/subscription native work serially and drain bounded callback snapshots
- **AND** it MUST not open a listener, WebSocket or realtime-duplex connection

#### Scenario: Bridge dependencies are inspected

- **WHEN** static checks inspect the production bridge
- **THEN** it MUST use standard-library HTTP
- **AND** it MUST not require `requests`, subprocess/process APIs, background worker threads or unverified third-party dependencies

## ADDED Requirements

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
- **AND** the operator MUST manually install the exact bridge and record installed path, SHA-256 and runtime build ID

#### Scenario: Bridge-first maintenance window begins

- **WHEN** the operator installs the new bridge before compatible services are switched
- **THEN** temporary subscription-route errors are an accepted maintenance-window condition
- **AND** the bridge MUST not report callback transport ready until compatible datasource routes accept it
