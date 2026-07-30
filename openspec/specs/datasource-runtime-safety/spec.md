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

The QMT datasource SHALL enable subscription control, callback snapshot intake and formal realtime output only when `QMT_REALTIME_MODE=builtin`. Historical QMT command/result behavior SHALL remain available in both `builtin` and `off`.

#### Scenario: QMT mode is builtin

- **WHEN** configuration resolves to `QMT_REALTIME_MODE=builtin`
- **THEN** subscription routes and QMT formal realtime output MUST be active
- **AND** the former periodic `get_full_tick` realtime collector MUST not start
- **AND** route readiness MUST NOT create a subscription without an explicit
  backend control request

#### Scenario: QMT mode is off

- **WHEN** configuration resolves to `QMT_REALTIME_MODE=off`
- **THEN** subscription routes and formal QMT realtime output MUST be absent
- **AND** historical QMT queries MUST remain available
- **AND** mode state alone MUST NOT be presented as proof that every physical QMT subscription was released

#### Scenario: Unknown QMT mode is configured

- **WHEN** the value is neither `builtin` nor `off`
- **THEN** QMT datasource startup MUST fail closed

### Requirement: QMT native collection is bounded

QMT realtime callback handling SHALL use explicit global and per-symbol hard limits, item/byte limits and maximum age. It SHALL never wait for queue capacity or accumulate indefinitely while datasource is unavailable.

#### Scenario: Previous command has not completed

- **WHEN** a subscription control call is already outstanding
- **THEN** datasource MUST NOT expose a second native control command
- **AND** the additional request MUST fail with a bounded busy outcome rather
  than entering an unbounded queue

#### Scenario: Callback queue reaches a hard limit

- **WHEN** a new callback map would exceed a configured hard limit
- **THEN** bridge MUST drop an eligible realtime observation without blocking
- **AND** queue memory MUST remain bounded

#### Scenario: Snapshot drain is unavailable

- **WHEN** loopback snapshot submission fails
- **THEN** the item MUST be dropped after bounded handling
- **AND** bridge MUST not retry, replay or backfill it automatically

#### Scenario: Market is outside the supported session

- **WHEN** known subscriptions have no fresh callback outside Beijing trading hours
- **THEN** health MUST distinguish control availability from data freshness
- **AND** silence MUST not prove successful subscribe or unsubscribe

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

The QMT datasource and bridge SHALL expose at most one subscription native call in flight and SHALL execute history/control provider calls serially through the existing strategy `run_time` boundary. Callback threads MAY only enter the bounded queue critical section.

#### Scenario: Multiple bridge owners register

- **WHEN** a second owner attempts to register while the current lease is active
- **THEN** datasource MUST reject the second owner or mark owner conflict unhealthy

#### Scenario: External requests arrive concurrently

- **WHEN** a native subscription call is already in flight
- **THEN** datasource MUST not expose another call to bridge
- **AND** a second backend request MUST not execute concurrently

#### Scenario: Callback overlaps native work

- **WHEN** QMT invokes a callback during history or subscription control execution
- **THEN** callback MAY synchronize only the bounded safe-copy/enqueue operation
- **AND** it MUST not invoke a provider method or HTTP call

#### Scenario: Native method raises

- **WHEN** a QMT provider invocation raises
- **THEN** bridge MUST convert it to one bounded failure result
- **AND** the main strategy loop MUST continue

### Requirement: QMT production bridge avoids unverified runtime features

The production bridge SHALL use only Python 3.6 standard-library HTTP and synchronization primitives needed for its bounded queue. It SHALL not add an unverified transport, dependency, worker or realtime data query.

#### Scenario: Bridge script is inspected

- **WHEN** static checks inspect the production bridge
- **THEN** it MUST not import realtime-duplex packages, third-party HTTP clients, process/subprocess APIs, listener frameworks, pandas as a callback dependency or background-thread frameworks

#### Scenario: Realtime acquisition is inspected

- **WHEN** maintained QMT realtime code is scanned
- **THEN** it MUST call only the accepted subscription callbacks
- **AND** it MUST not schedule periodic `get_full_tick` or callback-triggered `get_market_data_ex`

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

QMT history results and all subscription loopback traffic SHALL bind to the
current owner transport using the existing `ownerId + leaseToken + generation`
contract. Datasource SHALL validate all three fields before reading or changing
state and SHALL use constant-time comparison for the token.

#### Scenario: Same owner remains active

- **WHEN** normal poll activity continues for the same QMT context
- **THEN** registration MUST behave as a heartbeat
- **AND** lease and generation MUST not rotate every poll

#### Scenario: QMT bridge registers

- **WHEN** the builtin bridge becomes the current owner
- **THEN** datasource root/scoped health MUST identify its owner, generation
  and build identity without exposing the lease token
- **AND** file-backed runtime digest or explicit `unavailable` disposition MUST
  remain observable through the bounded introspection path

#### Scenario: Datasource starts a new transport instance

- **WHEN** bridge registers after datasource restart
- **THEN** datasource MUST issue a fresh lease and establish its current
  process-local generation
- **AND** old queued envelopes MUST be rejected

#### Scenario: Retired lease is used

- **WHEN** an old process submits poll, result or snapshot traffic
- **THEN** datasource MUST reject it before control mutation or formal publication
- **AND** token comparison MUST be constant time
- **AND** the token MUST not appear in journal, metrics, health or logs

#### Scenario: History result uses an old owner

- **WHEN** owner replacement occurs before a historical command result returns
- **THEN** the old result MUST remain rejected under the existing history fence

#### Scenario: Owner changes with a command in flight

- **WHEN** owner replacement occurs before an exposed history or subscription
  native call returns
- **THEN** the retired-owner result MUST be rejected before registry mutation or
  formal publication
- **AND** the replacement owner MUST use its new transport generation

### Requirement: Realtime boundary rejects unsafe native objects
Datasource HTTP and WebSocket boundaries SHALL reject native objects that cannot be represented as bounded JSON or violate configured size, depth, field, or sensitive-data guards.

#### Scenario: Native payload exceeds a boundary
- **WHEN** a provider returns an oversized, over-deep, unserializable, or forbidden native object
- **THEN** the datasource records a stable validation error and does not publish a partial frame

### Requirement: QMT builtin bridge remains Python 3.6 compatible

All maintained QMT builtin strategy code SHALL parse and execute under embedded Python 3.6, tolerate missing `__file__`, avoid unverified dependencies and avoid background worker threads.

#### Scenario: Compatibility guard runs

- **WHEN** the bridge artifact is checked
- **THEN** `dict[...]`, `list[...]`, `X | Y`, `match` and newer-runtime-only syntax or APIs MUST fail the check

#### Scenario: Optional runtime facilities are missing

- **WHEN** `__file__`, pandas, native signature metadata or a candidate alias is unavailable
- **THEN** bridge MUST use its documented bounded fallback or report capability unknown
- **AND** it MUST not fabricate support

#### Scenario: Callback throws internally

- **WHEN** copying, validating or enqueueing callback data fails
- **THEN** bridge MUST contain the exception, emit a bounded diagnostic and return
- **AND** other callback entries and later runtime work MUST remain serviceable

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

### Requirement: Dual-source snapshot submission is at-most-attempted

TDX and QMT bridge snapshot submissions SHALL be lossy latest-state transport.
They MUST NOT implement producer-sequence deduplication, automatic HTTP retry,
replay or backfill.

#### Scenario: TDX snapshot is submitted

- **WHEN** TDX bridge completes one `get_market_snapshot` call
- **THEN** it MUST issue at most one `/tdx/bridge/snapshot` POST
- **AND** the request, route and gateway MUST NOT contain
  `producerSequence` or equivalent producer identity
- **AND** its success response MUST NOT expose a datasource formal sequence
  or an item acknowledgement

#### Scenario: QMT snapshot is submitted

- **WHEN** QMT bridge drains one callback queue item
- **THEN** it MUST issue at most one
  `/qmt/bridge/subscriptions/snapshot` POST
- **AND** it MUST NOT add a producer identity

#### Scenario: Snapshot response is lost

- **WHEN** either bridge cannot prove that datasource accepted a submission
- **THEN** it MUST drop that observation after bounded handling
- **AND** it MUST NOT retry or ask datasource to deduplicate it

#### Scenario: TDX formal frame is produced

- **WHEN** datasource accepts a TDX snapshot request
- **THEN** datasource MUST produce one schema-v2 native-map frame without a
  formal sequence
- **AND** the request `streamEpoch` MUST remain an internal lease fence rather
  than backend ordering metadata

### Requirement: Realtime mode tooling is source scoped

Operator tooling SHALL change and restart only the requested datasource source, plus backend only when its configuration or frame contract requires it.

#### Scenario: Operator changes QMT mode

- **WHEN** the mode tool is invoked with `Source=qmt`
- **THEN** it MUST change only QMT mode configuration and restart/rebuild only QMT datasource
- **AND** it MUST not restart the TDX Windows service

#### Scenario: Operator changes TDX mode

- **WHEN** the mode tool is invoked with `Source=tdx`
- **THEN** it MUST change only TDX mode configuration and restart only TDX datasource
- **AND** it MUST not restart QMT datasource

#### Scenario: QMT builtin is disabled cleanly

- **WHEN** the operator requests a clean transition from QMT `builtin` to `off`
- **THEN** tooling MUST attempt `sync_subscriptions([])` while the old routes and owner lease are still active
- **AND** every native result MUST reach journal and monitoring before QMT datasource stops
- **AND** any failed unsubscribe ID MUST remain recorded rather than being deleted

### Requirement: Unexpected datasource restart requires operator reconciliation

This release SHALL NOT automatically reconstruct live QMT subscription handles from journal or QMT print logs after a datasource process crash. The journal SHALL remain recovery evidence for a future script.

#### Scenario: Datasource restarts while QMT context survives

- **WHEN** physical callbacks may still exist but the in-memory registry was lost
- **THEN** the new datasource instance MUST reject callback membership it cannot prove
- **AND** it MUST report that operator reconciliation is required
- **AND** it MUST not automatically issue a replacement subscribe

#### Scenario: Operator restores service after an unexpected restart

- **WHEN** current physical handles cannot be proven safely
- **THEN** the operator MUST reload/rebuild the QMT strategy context to release old callbacks
- **AND** then explicitly run a new full synchronization

#### Scenario: Planned datasource restart is required

- **WHEN** a maintenance procedure will stop datasource
- **THEN** the runbook MUST first perform and verify an empty full synchronization or explicitly classify the remaining handle risk
- **AND** journal and QMT print logs MUST be preserved

### Requirement: Subscription journal fails closed without inventing state

Datasource SHALL be the single writer of the QMT journal. It SHALL make an
intent durable before exposing a native call, and SHALL not report a lifecycle
mutation successful until its accepted native result and resulting in-memory
registry state are durably recorded. Rotation SHALL preserve immutable
append-only archives and the active hash chain.

#### Scenario: Journal is first used

- **WHEN** no override is configured
- **THEN** datasource MUST create parent directories and append UTF-8 JSONL at `F:\quant\MistAPI\datasource\state\qmt\subscription-journal.jsonl`
- **AND** `MIST_QMT_SUBSCRIPTION_JOURNAL_PATH` MUST override that location

#### Scenario: Native-call intent cannot be journaled

- **WHEN** create, append, flush or `fsync` fails before a control intent is durable
- **THEN** datasource MUST return reason `QMT_JOURNAL_DURABILITY_FAILED`
- **AND** it MUST expose no command, execute no native call and leave registry membership unchanged
- **AND** an unsubscribe or cancellation-stage response MUST use `subscriptionState=subscribed` when the unchanged registry proves current membership
- **AND** monitoring MUST mark journal health failed and all later mutations MUST fail before native execution

#### Scenario: Integer subscribe result cannot be journaled

- **WHEN** bridge returns an exact integer ID, including `0`, but append, flush or `fsync` fails
- **THEN** datasource MUST retain the observed ID in memory
- **AND** it MUST report generic failure reason `QMT_JOURNAL_DURABILITY_FAILED`, set `reconciliationRequired=true` and block another subscription that could overlap it
- **AND** monitoring MUST record journal failure

#### Scenario: Unsubscribe is not confirmed

- **WHEN** `unsubscribe_quote` raises or returns a non-success value
- **THEN** the original ID MUST remain in its registry bucket and journal history
- **AND** the backend-facing failure MUST report
  `QMT_UNSUBSCRIBE_UNCONFIRMED/subscriptionState=unknown`
- **AND** datasource MUST not claim physical unsubscribe

#### Scenario: Confirmed unsubscribe result cannot be journaled

- **WHEN** native unsubscribe returns exact bool `true` or an explicitly
  HIL-qualified integer success value but its result or registry transition
  cannot be appended, flushed and `fsync`ed
- **THEN** datasource MUST return
  `QMT_JOURNAL_DURABILITY_FAILED/subscriptionState=unknown`
- **AND** it MUST retain the original ID in its original public bucket with private `retained-recovery` metadata
- **AND** the retained ID MUST be recovery evidence, not a claim that the physical handle is still live
- **AND** datasource MUST set `reconciliationRequired=true`, stop the current reset, block replacement and all later native mutations, and MUST NOT automatically repeat the unsubscribe

#### Scenario: Result is lost after native execution

- **WHEN** bridge log indicates a native call may have completed but datasource has no accepted result
- **THEN** datasource MUST not automatically retry the call
- **AND** this release MUST leave log-assisted recovery to a future operator script

#### Scenario: Journal storage becomes healthy after reconciliation is required

- **WHEN** append, flush and `fsync` become available again after a result durability failure
- **THEN** storage health alone MUST NOT clear `reconciliationRequired`
- **AND** the same process MAY clear it only after an explicit recovery action
  produces a durable `operator_observation` proving QMT context reload/rebuild
- **AND** repeated unsubscribe of a `retained-recovery` ID MUST NOT unlock
  recovery; the current runtime returns exact bool `false`, so the runbook MUST
  reload or rebuild the QMT context and restart datasource
- **AND** this recovery rule MUST NOT create an HTTP, WebSocket, CLI, frontend or diagnostic subscription-mutation endpoint

#### Scenario: Rotation or compaction is interrupted

- **WHEN** startup finds journal `.tmp`, `.rotating`, manifest or checkpoint state left by an interrupted maintenance step
- **THEN** datasource MUST verify the hash chain and SHA-256 metadata and deterministically finish or roll back the step
- **AND** it MUST preserve the last valid copy and every unresolved or `retained-recovery` lifecycle
- **AND** control readiness MUST remain false until journal state is unambiguous and writable

#### Scenario: Journal content is inspected

- **WHEN** records are serialized
- **THEN** they MUST include detailed native-call intent/result and registry transitions
- **AND** they MUST exclude lease secrets and callback native payloads

### Requirement: Bridge-local telemetry is not added to the wire

This release SHALL not add callback or queue telemetry fields to subscription poll, result or snapshot payloads. Datasource SHALL monitor only states it observes directly; bridge-only loss SHALL use bounded QMT-local logs.

#### Scenario: Protocol schemas are inspected

- **WHEN** subscription route bodies are validated
- **THEN** they MUST not carry telemetry counters, symbol-labelled measurements or a telemetry epoch

#### Scenario: Bridge drops a callback locally

- **WHEN** datasource never observes the callback
- **THEN** bridge MUST write a bounded local diagnostic
- **AND** monitoring MUST not invent a datasource metric for an unobserved event

