## MODIFIED Requirements

### Requirement: WebSocket subscription resync

The backend TDX and QMT realtime clients SHALL each expose the same four
Nest-internal in-process methods: `syncSubscriptions`, `subscribe`,
`unsubscribe` and `getSubscriptions`. Each method SHALL execute the matching
datasource WebSocket request and await its typed response. This change SHALL
provide no production caller and SHALL NOT derive or resynchronize desired
subscriptions automatically.

#### Scenario: Datasource sends ready

- **WHEN** the backend receives a WebSocket `ready` message from a TDX or QMT datasource
- **THEN** it MUST update connection and readiness state without sending
  `get_subscriptions`, `sync_subscriptions`, `subscribe` or `unsubscribe`

#### Scenario: Backend reconnects after an ambiguous mutation

- **WHEN** the provider WebSocket reconnects after a disconnect or lost response
- **THEN** the pending method MUST finish with an outcome-unknown failure
- **AND** backend MUST NOT automatically read state or replay the previous
  mutation
- **AND** a future caller MAY explicitly call `getSubscriptions` before deciding
  whether another mutation is safe

#### Scenario: An internal method is called

- **WHEN** a Nest test, HIL harness or future in-process coordinator calls one
  control method on the current provider leader
- **THEN** the client MUST send exactly one matching request on its existing
  datasource WebSocket
- **AND** the returned Promise MUST settle only from the matching response,
  bounded timeout, disconnect or local validation failure

#### Scenario: Internal method is called before control readiness

- **WHEN** an in-process caller invokes a method while the provider WebSocket is
  closed or has not accepted the datasource ready contract
- **THEN** the method MUST fail locally with a stable not-ready result
- **AND** it MUST not send, queue or retry the request

#### Scenario: Datasource rejects the connection as non-leader

- **WHEN** a sent control request receives the datasource's stable non-leader
  failure
- **THEN** the method MUST return that typed failure to its in-process caller
- **AND** it MUST not retry, reconnect solely for the mutation or infer success

#### Scenario: Production runtime graph is inspected

- **WHEN** modules, controllers, routes, commands and startup lifecycle hooks are
  inspected in this change
- **THEN** no scheduler, `Security.status` watcher, HTTP/GraphQL/controller,
  frontend, CLI or diagnostic mutation caller MUST exist
- **AND** `open`, `ready`, reconnect and allowlist initialization MUST NOT invoke
  any control method

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

## ADDED Requirements

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

### Requirement: Internal control validates symbols without adding a business desired coordinator

The TDX and QMT client methods SHALL accept normalized provider symbols and
validate them through the current Mist source business allowlist before sending
control. Mist backend SHALL be the sole owner of business authorization and
`providerSymbol -> securityId` resolution. Datasource current handle membership
SHALL remain a separate provider-allocation check and SHALL NOT be treated as a
second business allowlist. This change SHALL not create a desired-subscription coordinator,
`effectiveSourceBySecurityId` view or `Security.status`-driven lifecycle. This
does not remove the TDX datasource's existing revisioned transport desired
state, which SHALL be updated by explicit TDX control calls to drive its
terminal bridge.

#### Scenario: An allowlisted provider symbol is passed

- **WHEN** a direct in-process caller invokes a control method with a symbol that
  resolves through the current source business allowlist
- **THEN** backend MUST send that normalized provider symbol on the current
  provider WebSocket
- **AND** QMT MUST retain its market suffix while `Security.code` remains
  suffix-free

#### Scenario: A provider symbol is not allowlisted

- **WHEN** one requested provider symbol does not resolve through the current
  source business allowlist
- **THEN** the client method MUST fail locally before sending any control request
- **AND** a partial `syncSubscriptions` request MUST NOT be sent

#### Scenario: Source business allowlists resolve the same security

- **WHEN** TDX and QMT startup allowlists resolve to the same canonical
  `securityId`
- **THEN** initialization MUST fail closed before either realtime client reports
  ready
- **AND** this change MUST NOT choose a source from arrival order or implement
  runtime source switching

#### Scenario: Security status changes after startup

- **WHEN** a security changes between active, suspended or delisted status while
  the backend is running
- **THEN** this change MUST NOT automatically call any subscription-control
  method or remove common latest state
- **AND** a future lifecycle change MUST own desired reconciliation and cleanup

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
