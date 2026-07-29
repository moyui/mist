# datasource-runtime-safety Specification

## Purpose
Define async-safety, lifecycle, health, and realtime isolation requirements for
the host-side datasource services.
## Requirements
### Requirement: Blocking provider work is isolated from asyncio handlers

The datasource service SHALL execute blocking native SDK or provider work
through async-safe wrappers instead of running it directly on the event loop.

#### Scenario: Async provider method wraps blocking work

- **WHEN** an async datasource method needs to call a blocking provider or SDK
  function
- **THEN** it MUST execute that work through `asyncio.to_thread`, a dedicated
  executor, or an equivalent async-safe boundary
- **AND** unit tests MUST prove the event loop can continue while the provider
  work is pending

### Requirement: Unsupported provider subscription capabilities fail explicitly

The datasource service SHALL expose unsupported subscription methods as
structured capability failures, not as ambiguous stubs that look callable.

#### Scenario: Provider does not support quote subscription

- **WHEN** a caller invokes `subscribe_quote` on a provider that cannot support
  quote subscriptions
- **THEN** the provider MUST raise a stable capability error with a machine
  readable code
- **AND** tests MUST assert the error code and relevant details

### Requirement: Native response lookup is symbol-strict

The datasource service SHALL fail explicitly when a native provider response
does not contain the requested symbol.

#### Scenario: Native response is missing requested symbol

- **WHEN** native provider data is wrapped in a supported shape but no item
  matches the requested symbol
- **THEN** the lookup helper MUST raise a datasource error
- **AND** it MUST NOT return the entire native values payload as a fallback

### Requirement: Datasource health reports component readiness

The datasource service SHALL expose HTTP provider readiness on application health and SHALL expose builtin bridge owner, subscription, freshness, and error state through source-neutral component paths.

#### Scenario: Health endpoint is called after startup

- **WHEN** `GET /health` is called after datasource startup
- **THEN** the response MUST include provider HTTP reachability and public service connection state
- **AND** TDX and QMT bridge-owner state MUST be nested at `bridge.ready`
- **AND** the bridge object MUST use `ownerId`, `ownerGeneration`, and `bridgeBuildId` for owner metadata
- **AND** it MUST NOT expose `tdxRealtimeBridgeReady`, `collectorReady`, removed process-local adapter, TQ, queue, or legacy collector fields

#### Scenario: Bridge-scoped health is called

- **WHEN** a caller reads `/tdx/bridge/health` or `/qmt/bridge/health`
- **THEN** the bridge health object MUST expose its readiness as top-level `ready`
- **AND** both providers MUST use the same owner metadata names
- **AND** generated OpenAPI MUST describe `ready`, `ownerId`, `ownerGeneration`, and `bridgeBuildId` rather than an unconstrained generic object

#### Scenario: Provider HTTP probe fails

- **WHEN** the provider health probe cannot reach the TDX HTTP endpoint
- **THEN** health output MUST report provider readiness as false with a stable error field
- **AND** the process MUST remain observable to WinSW and deployment health checks

### Requirement: Datasource components are injectable for tests

The datasource application SHALL allow tests to inject fake or prebuilt HTTP
providers, builtin gateways, and WebSocket managers without changing production
startup behavior.

#### Scenario: Test injects prebuilt components

- **WHEN** a test creates an application with injected provider or gateway
  instances
- **THEN** startup MUST use the injected instances
- **AND** shutdown MUST preserve injected instances unless the test explicitly marks them as owned

#### Scenario: Test verifies startup failure path

- **WHEN** gateway initialization or provider construction fails during startup
- **THEN** the runtime MUST surface the startup exception
- **AND** any already-owned component MUST be cleaned up before the exception leaves startup

### Requirement: TDX builtin realtime has one runtime path
The TDX datasource MUST always create its builtin gateway and realtime WebSocket manager, MUST keep non-realtime `/v1` calls on the official HTTP provider, and MUST NOT load a process-local SDK adapter, legacy collector, or TDX realtime mode switch.

#### Scenario: TDX datasource starts
- **WHEN** the TDX WinSW service starts with no `TDX_REALTIME_MODE`
- **THEN** `/v1/*` uses `TdxHttpClient`, `/tdx/bridge/*` is mounted, and no `tqcenter` adapter is initialized in the datasource process

#### Scenario: Removed TDX surface is requested
- **WHEN** a caller requests `/api/tdx/*` or `/ws/quote/*`
- **THEN** no matching route exists

### Requirement: Realtime payloads have one in-process representation
The datasource and backend MUST retain JSON encoding and decoding at HTTP and
WebSocket process boundaries, MUST validate native payloads once per boundary,
and MUST NOT rebuild an already validated realtime frame field by field.

#### Scenario: A valid realtime frame reaches the backend
- **WHEN** the TDX or QMT WebSocket decoder accepts a frame
- **THEN** the validated frame object is stored directly, with only missing optional TDX fields canonicalized to `null`

#### Scenario: Retired compatibility code is scanned
- **WHEN** repository guardrails inspect production code
- **THEN** legacy quote helpers, `TdxWsMessage`, unused instance config modules, and fake TDX SDK runtime paths are absent

### Requirement: QMT realtime lifecycle is mode isolated
The QMT datasource MUST create and start its realtime collector only in `builtin_experimental` mode, MUST stop it during application shutdown, and MUST reject unknown mode values at startup.

#### Scenario: QMT mode is off
- **WHEN** the QMT application starts with mode `off`
- **THEN** no collector task, experimental WebSocket manager, or realtime health route is mounted

#### Scenario: Unknown QMT mode is configured
- **WHEN** the QMT application starts with any unsupported mode value
- **THEN** startup fails before runtime components are exposed

### Requirement: QMT native collection is bounded
The QMT realtime collector MUST permit one command in flight, use a bounded subscription set, validate current Beijing-session freshness, and expose stable error and overlap counters.

#### Scenario: Previous command has not completed
- **WHEN** a collection interval arrives while a QMT command remains pending
- **THEN** no second command is enqueued and the overlap counter increases

### Requirement: TDX native HIL evidence is bounded and secret-free
The TDX experimental gateway SHALL retain only the latest accepted native
snapshot evidence for currently desired symbols and SHALL expose it only on a
loopback route without lease credentials.

#### Scenario: Accepted native snapshot is inspected
- **WHEN** a loopback operator reads evidence for a desired TDX symbol
- **THEN** the response contains native data, capture metadata, stream epoch, and the accepted frame but no lease token

#### Scenario: Owner epoch changes
- **WHEN** a new TDX bridge owner epoch replaces the previous owner
- **THEN** all native evidence from the previous epoch is removed

### Requirement: QMT bridge assumes single-owner serial execution
The datasource SHALL treat the full-QMT built-in Python bridge as a
single-owner, serial execution runtime.

#### Scenario: Multiple bridge owners register
- **WHEN** a second QMT bridge owner attempts to register while one owner is
  active
- **THEN** the command gateway MUST reject the second owner or report the owner
  conflict as unhealthy

#### Scenario: External requests arrive concurrently
- **WHEN** multiple external requests enqueue QMT work
- **THEN** the command gateway MUST serialize the work before it reaches the
  QMT built-in Python script
- **AND** it MUST use stable timeout or error envelopes rather than parallel
  native QMT execution

### Requirement: QMT production bridge avoids unverified runtime features
The QMT production bridge script SHALL avoid runtime features that are risky in
the full-QMT built-in Python runtime.

#### Scenario: Bridge script is inspected
- **WHEN** static guardrails inspect the production bridge script
- **THEN** it MUST NOT import or use realtime-duplex transport, thread APIs,
  process APIs, subprocess APIs, or unverified third-party libraries
- **AND** it MUST use standard-library HTTP polling for command intake

### Requirement: QMT command latency is observable
The datasource SHALL report bridge readiness and command failures without
silently stalling the process.

#### Scenario: Command timeout expires
- **WHEN** a QMT bridge command does not complete before its configured timeout
- **THEN** the command gateway MUST mark it failed with a stable timeout error
- **AND** health output MUST expose enough state for operators to diagnose the
  stale owner or queue

#### Scenario: Bridge heartbeat stops
- **WHEN** the QMT bridge stops polling
- **THEN** the datasource MUST report QMT bridge readiness as false while the
  datasource process remains observable

### Requirement: QMT owner results are generation fenced
QMT bridge poll and result operations MUST bind commands to the current owner generation or lease, owner replacement MUST create a new stream epoch, and results from a retired owner or previous epoch MUST be rejected before publication.

#### Scenario: Owner changes with a command in flight
- **WHEN** a QMT owner is replaced before an earlier `get_full_tick` command returns
- **THEN** the old result is rejected and no frame is published in the new epoch

#### Scenario: QMT bridge registers
- **WHEN** the builtin bridge becomes the current owner
- **THEN** loopback health and evidence identify its owner, generation and build identity without exposing a lease secret
- **AND** a file-backed runtime reports its artifact digest while a pathless embedded runtime reports `unavailable`
- **AND** Windows HIL validates the observable `bridgeBuildId` and protocol behavior without requiring the operator-managed installed path or file digest

### Requirement: Realtime boundary rejects unsafe native objects
Datasource HTTP and WebSocket boundaries SHALL reject native objects that cannot be represented as bounded JSON or violate configured size, depth, field, or sensitive-data guards.

#### Scenario: Native payload exceeds a boundary
- **WHEN** a provider returns an oversized, over-deep, unserializable, or forbidden native object
- **THEN** the datasource records a stable validation error and does not publish a partial frame

### Requirement: QMT builtin bridge remains Python 3.6 compatible
All QMT builtin production scripts changed by formal realtime work MUST parse and run under the embedded Python 3.6 runtime without third-party dependencies, threads, subprocesses or local listeners.

#### Scenario: Compatibility guard runs
- **WHEN** QMT bridge validation executes in CI and Windows HIL
- **THEN** forbidden newer syntax and dependencies are rejected before deployment

### Requirement: WebSocket broadcast isolates connections and bounds sends
The datasource WebSocket manager SHALL snapshot its connection mapping under synchronization and SHALL send outside the lock with finite timeout and bounded concurrency.

#### Scenario: A connection changes during broadcast
- **WHEN** a backend connects, disconnects, or replaces the same client ID while a broadcast is in progress
- **THEN** collection mutation does not fail the broadcast
- **AND** cleanup does not remove a replacement WebSocket

#### Scenario: One backend send blocks or fails
- **WHEN** one WebSocket exceeds the send timeout or raises an exception
- **THEN** healthy snapshot connections still receive the message without waiting serially for that client
- **AND** the failed connection is removed safely

### Requirement: QMT historical command state is bounded
The QMT datasource SHALL bound historical command lifecycle state by active
count, retained-result count, retained-result age, and encoded payload bytes.
It MUST reserve terminal-result capacity before accepting a command.

#### Scenario: Gateway has capacity
- **WHEN** a JSON-safe command fits the command-byte limit and both outstanding
  and reserved-result limits have capacity
- **THEN** the gateway accepts it and preserves FIFO polling
- **AND** exactly one terminal result slot is reserved

#### Scenario: Gateway has no capacity
- **WHEN** accepting another command would exceed an outstanding or reserved
  result limit after expired state is pruned
- **THEN** the gateway rejects it with `QMT_COMMAND_CAPACITY_EXCEEDED`
- **AND** it MUST NOT evict unexpired accepted work

#### Scenario: Result cannot be retained safely
- **WHEN** a native result is non-JSON-safe, exceeds the per-result byte limit,
  or would exceed aggregate retained-result bytes
- **THEN** the gateway stores one bounded terminal failure for that command
- **AND** it MUST NOT retain the unsafe native result

### Requirement: QMT command lifecycle maintenance is deterministic
Every QMT command gateway boundary SHALL expire timed-out work and prune
completed results older than the fixed retention period before reporting state
or accepting more work.

#### Scenario: Completed result retention expires
- **WHEN** a completed result is older than its retention period
- **THEN** the gateway removes it and decrements retained bytes
- **AND** a later status lookup reports the command as unknown

#### Scenario: Poll limit is invalid
- **WHEN** a bridge requests a non-positive or above-limit command count
- **THEN** the datasource rejects the request before changing pending or
  in-flight state

