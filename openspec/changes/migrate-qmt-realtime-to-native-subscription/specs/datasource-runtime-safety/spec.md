## MODIFIED Requirements

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

#### Scenario: Unsupported mode is configured

- **WHEN** the value is neither `builtin` nor `off`
- **THEN** QMT datasource startup MUST fail closed

### Requirement: QMT native collection is bounded

QMT realtime callback handling SHALL use explicit global and per-symbol hard limits, item/byte limits and maximum age. It SHALL never wait for queue capacity or accumulate indefinitely while datasource is unavailable.

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

### Requirement: QMT bridge assumes single-owner serial execution

The QMT datasource and bridge SHALL expose at most one subscription native call in flight and SHALL execute history/control provider calls serially through the existing strategy `run_time` boundary. Callback threads MAY only enter the bounded queue critical section.

#### Scenario: Multiple bridge owners register

- **WHEN** a second owner attempts to register while the current lease is active
- **THEN** datasource MUST reject the second owner or mark owner conflict unhealthy

#### Scenario: Multiple control requests arrive

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

#### Scenario: Bridge imports are inspected

- **WHEN** static checks inspect the production bridge
- **THEN** it MUST not import realtime-duplex packages, third-party HTTP clients, process/subprocess APIs, listener frameworks, pandas as a callback dependency or background-thread frameworks

#### Scenario: Realtime acquisition is inspected

- **WHEN** maintained QMT realtime code is scanned
- **THEN** it MUST call only the accepted subscription callbacks
- **AND** it MUST not schedule periodic `get_full_tick` or callback-triggered `get_market_data_ex`

### Requirement: QMT owner results are generation fenced

QMT history results and all subscription loopback traffic SHALL bind to the
current owner transport using the existing `ownerId + leaseToken + generation`
contract. Datasource SHALL validate all three fields before reading or changing
state and SHALL use constant-time comparison for the token.

#### Scenario: Same owner remains active

- **WHEN** normal poll activity continues for the same QMT context
- **THEN** registration MUST behave as a heartbeat
- **AND** lease and generation MUST not rotate every poll

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

### Requirement: QMT builtin bridge remains Python 3.6 compatible

All maintained QMT builtin strategy code SHALL parse and execute under embedded Python 3.6, tolerate missing `__file__`, avoid unverified dependencies and avoid background worker threads.

#### Scenario: Static compatibility checks run

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

## ADDED Requirements

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

- **WHEN** native unsubscribe returns the HIL-confirmed success integer but its result or registry transition cannot be appended, flushed and `fsync`ed
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
- **AND** the same process MAY clear it only after an explicit recovery action produces a durable `operator_observation` proving QMT context reload/rebuild, or after a HIL-qualified repeated unsubscribe obtains a durable accepted result
- **AND** repeated unsubscribe of a `retained-recovery` ID MUST require current-runtime HIL proof; without that proof the runbook MUST reload or rebuild the QMT context and restart datasource
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
