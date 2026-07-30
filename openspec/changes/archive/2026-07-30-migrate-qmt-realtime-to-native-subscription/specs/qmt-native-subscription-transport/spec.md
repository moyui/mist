## ADDED Requirements

### Requirement: QMT realtime uses official subscription callbacks

QMT realtime acquisition SHALL use the official `ContextInfo.subscribe_quote` and `ContextInfo.subscribe_whole_quote` callbacks. The maintained realtime path MUST NOT periodically call `get_full_tick`, and it MUST NOT call `get_market_data_ex` after a callback merely to obtain the current value.

#### Scenario: A whole subscription is created

- **WHEN** datasource requests a full synchronization with a non-empty exact desired provider-symbol list
- **THEN** bridge MUST invoke `ContextInfo.subscribe_whole_quote(exactDesiredSymbols, callback=...)`
- **AND** it MUST NOT pass market-wide values such as `SH` or `SZ`
- **AND** it MUST NOT append symbols outside the exact desired list

#### Scenario: Whole subscribe call returns

- **WHEN** the native method returns a value for which `type(result) is int`, including `0`
- **THEN** the whole subscription MUST remain active and continue invoking its callback until explicit unsubscribe or QMT context teardown
- **AND** the subscribe command result MUST not be treated as completion of the realtime stream

#### Scenario: A single subscription is created

- **WHEN** datasource requests one exceptional intraday symbol
- **THEN** bridge MUST invoke `ContextInfo.subscribe_quote(symbol, period='tick', dividend_type='none', result_type='dict', callback=...)`
- **AND** callback data MUST be used directly as the realtime native observation

#### Scenario: Historical data is requested

- **WHEN** the existing QMT history path executes
- **THEN** its `get_market_data_ex(..., subscribe=False)` command/result behavior MUST remain unchanged
- **AND** history MUST NOT depend on realtime subscription state

### Requirement: QMT callback native shape is preserved

The bridge SHALL preserve each callback argument as one native map shaped as `{providerSymbol: tickData}`. Official documentation identifies the callback object as the same logical tick object returned by `get_full_tick`; this equivalence SHALL describe native snapshot fields only and MUST NOT imply tick-complete delivery. Runtime-specific field aliases and concrete value types SHALL remain subject to fixture and Windows HIL verification.

#### Scenario: Single callback contains one code

- **WHEN** `subscribe_quote` calls the callback with one code
- **THEN** bridge MUST preserve the complete one-entry map as `native`
- **AND** it MUST NOT remove the provider-symbol key or flatten `tickData`

#### Scenario: Whole callback contains changed codes

- **WHEN** `subscribe_whole_quote` calls the callback with one or more changed codes
- **THEN** bridge MUST preserve all callback entries in the same `native` map
- **AND** one callback MUST become one queue item and one snapshot submission

#### Scenario: Runtime field spelling differs from an example

- **WHEN** an accepted runtime fixture uses `time`, `stime`, `timetag` or another documented/runtime-observed field spelling
- **THEN** bridge MUST pass that field through without renaming it
- **AND** backend source-specific decoding MUST own any semantic interpretation

#### Scenario: Multiple QMT time candidates are present

- **WHEN** callback `tickData` contains two or more of `time`, `stime` and
  `timetag`
- **THEN** they MUST be treated as candidate representations of the same
  provider business time, not as separate lifecycle timestamps
- **AND** bridge and datasource MUST preserve every present candidate unchanged
- **AND** the accepted production fixture MUST fix ordered fallback, parser,
  unit, timezone, precision and consistency rules

#### Scenario: Production time mapping has not been proven

- **WHEN** no accepted production fixture has fixed the actual candidate order,
  parser, unit, timezone, precision and consistency rule
- **THEN** backend MUST NOT choose an event-time alias or conversion from documentation alone
- **AND** canonical `eventTime` MUST remain `null` until that mapping is fixture-backed
- **AND** no receipt or processing timestamp may substitute for it

### Requirement: Whole and single handles have separate registry buckets

Datasource SHALL be the in-process authority for current QMT subscription
handles. It SHALL store exactly two logical buckets: nullable
`whole{subId,symbols}` and `singles{providerSymbol:subId}`. When `whole` is
present, its exact integer `subId` and exact `symbols` MUST be stored together.
Datasource MUST NOT model these fields as three independent states or infer
subscription kind from a numeric `subId` value or from the number of symbols.

#### Scenario: Whole bucket is stored

- **WHEN** `subscribe_whole_quote(exactDesiredSymbols)` returns an exact integer, including `0`
- **THEN** datasource MUST store that integer as `whole.subId`
- **AND** it MUST store the exact normalized desired list as `whole.symbols`
- **AND** neither field may exist without the other

#### Scenario: Single bucket is stored

- **WHEN** `subscribe_quote(symbol)` returns an exact integer, including `0`
- **THEN** datasource MUST store it as `singles[symbol]`
- **AND** the symbol MUST not also appear in `whole.symbols` or another single entry

#### Scenario: Subscribe returns an integer

- **WHEN** a native subscribe call returns a value for which `type(value) is int`
- **THEN** datasource MUST add that value to the registry bucket named by the issued native command
- **AND** `0` and negative integers MUST NOT be rejected by a range or truthiness check
- **AND** it MUST append the result to the durable journal before reporting success

#### Scenario: Subscribe does not return an exact integer

- **WHEN** a native subscribe call raises or returns `bool`, float, string, `None` or another non-`int` value
- **THEN** datasource MUST report failure
- **AND** it MUST NOT add a handle to either registry bucket

#### Scenario: A duplicate symbol is requested

- **WHEN** the symbol is already owned by the whole handle or another single handle
- **THEN** datasource MUST reject the new subscribe before issuing a native call
- **AND** one QMT provider symbol MUST NOT have two known active handles

#### Scenario: A whole-owned symbol is individually removed

- **WHEN** `unsubscribe(symbol)` targets a symbol owned by the current whole handle
- **THEN** datasource MUST reject the request
- **AND** the backend-facing failure MUST be exactly
  `{symbol,reason:"QMT_SYMBOL_OWNED_BY_WHOLE",subscriptionState:"subscribed"}`
- **AND** an explicit in-process caller MUST use a later full synchronization to
  change whole membership

### Requirement: QMT backend-facing success values are exact

QMT control SHALL expose only the minimal success value needed by the
backend-facing operation. Native return details SHALL remain in the journal and
MUST NOT expand the backend-facing wire response.

#### Scenario: Single subscribe succeeds

- **WHEN** `subscribe(symbol)` receives an exact integer native subscription ID, including `0`
- **THEN** `subscribed.data.success` MUST equal that ID

#### Scenario: Non-empty full synchronization succeeds

- **WHEN** `sync_subscriptions(symbols)` creates a replacement whole subscription
- **THEN** `subscriptions_synced.data.success` MUST equal the new exact integer whole subscription ID

#### Scenario: Cancel-all succeeds

- **WHEN** `sync_subscriptions([])` confirms all known handles unsubscribed
- **THEN** `subscriptions_synced.data.success` MUST be null

#### Scenario: Single unsubscribe succeeds

- **WHEN** `unsubscribe(symbol)` receives exact bool `true`, or an explicitly
  configured integer value backed by separate HIL evidence
- **AND** datasource durably records the matching result and registry transition
- **THEN** `unsubscribed.data.success` MUST be null
- **AND** the exact native return type/value MUST be retained in journal evidence
- **AND** datasource MUST remove the corresponding ID from its registry only as part of that durable transition

#### Scenario: Exact false is returned

- **WHEN** `unsubscribe_quote(subId)` returns exact bool `false`
- **THEN** datasource MUST return
  `QMT_UNSUBSCRIBE_UNCONFIRMED/subscriptionState=unknown`
- **AND** it MUST retain the ID in its original registry bucket
- **AND** callback silence, a live witness, a historical K-line query or bridge
  poll heartbeat MUST NOT promote bool `false` to success

#### Scenario: Single unsubscribe is unconfirmed

- **WHEN** `unsubscribe_quote(subId)` raises, times out or returns a value other
  than exact bool `true` or an explicitly HIL-qualified integer success value
- **THEN** `unsubscribed.data.failure` MUST be exactly
  `{symbol,reason:"QMT_UNSUBSCRIBE_UNCONFIRMED",subscriptionState:"unknown"}`
- **AND** datasource MUST retain the original ID in its original registry bucket

#### Scenario: Confirmed single unsubscribe cannot be made durable

- **WHEN** `unsubscribe_quote(subId)` returns exact bool `true` or an explicitly
  HIL-qualified integer success value but the matching result or registry
  transition cannot be appended, flushed and `fsync`ed
- **THEN** `unsubscribed.data.failure` MUST be exactly
  `{symbol,reason:"QMT_JOURNAL_DURABILITY_FAILED",subscriptionState:"unknown"}`
- **AND** datasource MUST retain the original ID in its original public registry bucket with private `retained-recovery` metadata
- **AND** that metadata MUST NOT create a third registry bucket or any backend-facing response field
- **AND** the retained ID MUST be treated as recovery evidence rather than proof that the native handle remains live
- **AND** datasource MUST set private health state `reconciliationRequired=true`, block replacement and later native mutations, and MUST NOT automatically call `unsubscribe_quote` again

### Requirement: Full synchronization is sequential and best effort

`sync_subscriptions` SHALL represent an explicit caller-controlled reset.
Datasource SHALL enqueue one native call at a time: unsubscribe the current
whole handle, then each known single handle, and only after all unsubscribe
calls are confirmed successful and their result/registry transitions are
durable create one replacement whole subscription for the exact desired set.

#### Scenario: All existing handles are confirmed and durably recorded unsubscribed

- **WHEN** every required `unsubscribe_quote(subId)` returns exact bool `true`
  or an explicitly HIL-qualified integer success value and every matching
  result and registry transition becomes durable
- **THEN** datasource MUST remove each corresponding ID from its registry
- **AND** it MUST create the replacement whole subscription when the desired list is non-empty
- **AND** an empty desired list MUST converge without issuing a subscribe call
- **AND** desired symbols formerly held by single overlays MUST be represented only by the replacement whole after successful reset

#### Scenario: One unsubscribe is not confirmed

- **WHEN** an unsubscribe raises, times out or returns a value other than exact
  bool `true` or an explicitly HIL-qualified integer success value
- **THEN** datasource MUST retain the original ID in its original registry bucket
- **AND** it MUST continue attempting the remaining explicitly requested unsubscribe calls
- **AND** it MUST NOT create the replacement whole subscription
- **AND** the final control response and monitoring MUST report failure
- **AND** a selected cancellation failure MUST contain
  `subscriptionState=unknown` and reason `QMT_UNSUBSCRIBE_UNCONFIRMED`
- **AND** when more than one call fails, the backend-facing failure MUST select
  the first failure in deterministic whole-first, provider-symbol-ascending
  order while the journal retains every failure

#### Scenario: Confirmed reset cancellation cannot be made durable

- **WHEN** one reset cancellation returns exact bool `true` or an explicitly
  HIL-qualified integer success value but its result or registry transition
  cannot be made durable
- **THEN** datasource MUST retain that ID as private `retained-recovery` evidence in its original public bucket
- **AND** that step's failure MUST use
  `QMT_JOURNAL_DURABILITY_FAILED/subscriptionState=unknown`
- **AND** the backend-facing reset failure MUST still select the first observed failure in deterministic execution order, using this durability failure when no earlier step failed
- **AND** datasource MUST stop the remaining reset mutations and MUST NOT create the replacement whole subscription
- **AND** it MUST set `reconciliationRequired=true` and fail every later mutation before exposing another native command

#### Scenario: Caller retries a failed reset

- **WHEN** an in-process caller submits `sync_subscriptions` again
- **THEN** datasource MUST act from the IDs still present in its current registry
- **AND** it MUST NOT attempt to reconstruct an atomic transaction or silently assume an earlier failed unsubscribe succeeded
- **AND** a `retained-recovery` ID MUST NOT be automatically retried
- **AND** recovery MUST reload or rebuild the QMT context; the current runtime's
  repeated cancellation result is exact bool `false` and is not accepted as
  recovery success

### Requirement: QMT control transport maps one command to one native call

The loopback control protocol SHALL use `POST /qmt/bridge/subscriptions/poll`
and `POST /qmt/bridge/subscriptions/result`. The poll request body SHALL contain
exactly `ownerId`, `leaseToken` and integer `generation`; the poll response body
SHALL contain exactly `command`. `command` SHALL be `null` or exactly one native
command containing a positive integer `callSequence`, one supported method and
only that method's defined command fields. Owner lease identity MUST NOT be
repeated inside `command`, and QMT subscription control MUST NOT add
`streamEpoch`.
Datasource SHALL expose at most one in-flight native call. When datasource
first exposes a command, it SHALL assign a `callSequence` that starts at `1`,
increases strictly for the lifetime of that datasource process and is never
reused in that process. Bridge SHALL return the exact same value with the
result.

#### Scenario: Bridge polls with its current owner lease

- **WHEN** bridge polls for subscription work
- **THEN** the request body MUST be exactly
  `{ownerId,leaseToken,generation}`
- **AND** the response body MUST be exactly `{command}`
- **AND** a non-null command MUST NOT contain `ownerId`, `leaseToken`,
  `generation` or `streamEpoch`

#### Scenario: Poll has no work

- **WHEN** datasource has no subscription native call to expose
- **THEN** the response MUST be exactly `{"command":null}`

#### Scenario: Bridge polls one subscribe call

- **WHEN** the next call is `subscribe_quote`
- **THEN** the command MUST contain exactly `callSequence`, `method` and
  `symbol`
- **AND** `method` MUST equal `subscribe_quote`
- **AND** the result MUST be exactly one `success` carrying the returned integer or one `failure` carrying the symbol and reason
- **AND** the result MUST echo the exact integer `callSequence`

#### Scenario: Bridge polls one whole subscribe call

- **WHEN** the next call is `subscribe_whole_quote`
- **THEN** the command MUST contain exactly `callSequence`, `method` and one
  `symbols` list
- **AND** `method` MUST equal `subscribe_whole_quote`
- **AND** the command MUST still represent exactly one native invocation

#### Scenario: Bridge polls one unsubscribe call

- **WHEN** the next call is `unsubscribe_quote`
- **THEN** the command MUST contain exactly `callSequence`, `method`, `subId`
  and `symbol`
- **AND** `method` MUST equal `unsubscribe_quote`
- **AND** `subId` MUST be the exact retained integer, including `0`
- **AND** `symbol` MUST be the corresponding single provider symbol or `null`
  for a whole/reset cancellation
- **AND** the result MUST be one success value or one failure reason
- **AND** bridge result MUST NOT invent `subscriptionState`; datasource MUST add
  the backend-facing state hint from its registry and the accepted native result
  semantics

#### Scenario: Bridge posts one command result

- **WHEN** bridge completes or contains the exposed native call
- **THEN** the result request body MUST contain exactly `ownerId`,
  `leaseToken`, integer `generation`, the command's exact positive integer
  `callSequence`, and one of `success|failure`
- **AND** a failure MUST be exactly `{symbol,reason}`
- **AND** `success` and `failure` MUST be mutually exclusive
- **AND** the result request MUST NOT contain `streamEpoch`, command arguments,
  retry metadata or another command object

#### Scenario: A result is lost or expires

- **WHEN** the native call may have executed but datasource did not accept its result
- **THEN** neither side MUST automatically retry or replay the native call
- **AND** the bridge log and journal intent MUST provide operator evidence for later manual recovery
- **AND** datasource MAY close the expired slot and expose a later call with a
  higher `callSequence`
- **AND** any late result whose `callSequence` does not equal the current slot
  MUST be rejected and logged rather than applied to another call

#### Scenario: A late result arrives while a newer call occupies the slot

- **WHEN** call A expires, call B is exposed with a higher `callSequence`, and
  A's result arrives afterward
- **THEN** datasource MUST reject A before changing the registry or appending an
  accepted result record
- **AND** datasource MUST NOT close, complete or otherwise mutate B's slot
- **AND** B's matching result MUST remain eligible for normal acceptance

#### Scenario: Correlation value has the wrong JSON type

- **WHEN** `callSequence` is absent, zero, negative, `bool`, `float`, string or
  another non-positive exact integer
- **THEN** datasource MUST reject the command result without changing slot or
  registry state

### Requirement: Callback execution is non-blocking and bounded

The callback SHALL only validate the current callback closure, make a bounded safe copy of the callback map, record `capturedAt` and `subscriptionId`, attempt a non-blocking enqueue, and return.

#### Scenario: Callback is invoked

- **WHEN** native QMT calls a registered callback
- **THEN** callback MUST NOT perform HTTP, wait for datasource, convert a DataFrame, query Redis/MySQL, canonicalize, evaluate a strategy, notify or retry
- **AND** it MUST contain any exception so an invalid callback cannot terminate the strategy runtime

#### Scenario: Queue has capacity

- **WHEN** a callback map passes envelope validation and the bounded queue can accept it
- **THEN** the complete accepted map MUST be enqueued as one item
- **AND** its fields MUST NOT be interpreted or renamed by bridge

#### Scenario: One callback entry cannot be copied safely

- **WHEN** one top-level code entry violates JSON-safety, size, depth or collection bounds
- **THEN** bridge MUST drop only that entry and write a bounded local diagnostic
- **AND** it MUST enqueue other accepted entries from the same callback as one map
- **AND** it MUST not parse price, time or order-book field semantics

#### Scenario: Queue is at a hard limit

- **WHEN** a global or per-symbol hard limit would be exceeded
- **THEN** bridge MUST return from the callback without waiting
- **AND** it MAY drop a realtime observation because this transport is explicitly lossy
- **AND** it MUST write a bounded local diagnostic without including the native payload

### Requirement: QMT snapshot route carries a minimal callback wrapper

`POST /qmt/bridge/subscriptions/snapshot` SHALL accept a loopback-only wrapper
containing exactly the transport fence and callback observation needed by
datasource: `ownerId`, `leaseToken`, integer `generation`, exact integer
`subscriptionId`, `capturedAt` and `native`.

#### Scenario: Current callback snapshot is submitted

- **WHEN** bridge drains a current queue item
- **THEN** `native` MUST be the complete `{providerSymbol: tickData}` callback map
- **AND** the body MUST NOT add symbol, method, callback ID, batch ID, producer sequence or event identity fields
- **AND** datasource MUST validate every code's provider-symbol syntax and current handle membership
- **AND** datasource MUST NOT perform Mist business authorization or resolve `securityId`

#### Scenario: One code in a multi-code map is malformed

- **WHEN** one entry has an invalid provider symbol or invalid tick object
- **THEN** datasource MUST reject and diagnose that entry
- **AND** it MUST continue processing other valid entries from the same map

#### Scenario: Transport fence is stale

- **WHEN** `ownerId`, `leaseToken` or `generation` does not match the current
  owner lease
- **THEN** datasource MUST reject the entire submission
- **AND** constant-time comparison MUST be used for `leaseToken`

### Requirement: Snapshot delivery is latest-state and at-most-attempted

QMT callback transport SHALL be classified as `latest-state native snapshot`. The official whole-quote behavior reports changed symbols from a latest-value full-push cache; matching `get_full_tick` native fields SHALL NOT be treated as evidence that every exchange tick was delivered. The transport SHALL NOT claim tick completeness, exactly-once delivery, ordering, retry, replay or backfill.

#### Scenario: Provider repeats a state

- **WHEN** two callbacks contain equal native values
- **THEN** both observations MAY be forwarded
- **AND** no transport identity or sequence-based deduplication is required

#### Scenario: Datasource is unavailable

- **WHEN** a snapshot POST fails or reaches its bounded age
- **THEN** bridge MUST drop that observation after bounded handling
- **AND** it MUST NOT retry the snapshot automatically

#### Scenario: Whole callbacks contain complete native fields

- **WHEN** whole callback fixtures contain the same logical native snapshot fields as `get_full_tick`
- **THEN** the accepted quality MUST remain `latest-state native snapshot`
- **AND** tests, health, monitoring and evidence MUST NOT label the transport `tick-complete`

### Requirement: Subscription journal is detailed and durable

Datasource SHALL append subscription intents and observed native results to a local JSONL journal. The default Windows path SHALL be `F:\quant\MistAPI\datasource\state\qmt\subscription-journal.jsonl`, overridable by `MIST_QMT_SUBSCRIPTION_JOURNAL_PATH`.

#### Scenario: A native control call is issued

- **WHEN** datasource exposes a control command to bridge
- **THEN** it MUST append, flush and `fsync` an intent record before execution
- **AND** the record MUST include timestamp, action, method, `callSequence`,
  exact symbol or symbol list, target `subId` when applicable, datasource
  instance, owner generation and bridge build identity where known

#### Scenario: A native control intent cannot be made durable

- **WHEN** create, append, flush or `fsync` fails before the intent becomes durable
- **THEN** datasource MUST fail the mutation with reason `QMT_JOURNAL_DURABILITY_FAILED`
- **AND** it MUST NOT expose a command, call native, allocate a returned ID or change registry membership
- **AND** an unsubscribe or cancellation-stage failure MUST use `subscriptionState=subscribed` when the unchanged registry proves membership, while a non-cancellation failure MUST retain the generic failure shape
- **AND** subsequent mutation MUST remain blocked while journal health is failed

#### Scenario: A native control result is observed

- **WHEN** datasource accepts a success or failure result
- **THEN** it MUST append the matching `callSequence`, returned type/value,
  exact integer returned ID when present, stable error reason, derived
  unsubscribe `subscriptionState` when applicable and post-result registry
  snapshot
- **AND** it MUST flush and `fsync` before reporting any successful subscription mutation

#### Scenario: A confirmed unsubscribe result cannot be made durable

- **WHEN** native unsubscribe is confirmed but appending, flushing or `fsync`ing its result and registry transition fails
- **THEN** datasource MUST return
  `QMT_JOURNAL_DURABILITY_FAILED/subscriptionState=unknown`
- **AND** it MUST retain the original ID in the same public bucket with private `retained-recovery` metadata
- **AND** it MUST NOT report the ID as confirmed-live, accept callback membership for it, replay the native call or expose another mutation
- **AND** only a durable explicit `operator_observation` proving QMT context
  reload/rebuild MAY clear `reconciliationRequired`

#### Scenario: Sensitive or large data would enter the journal

- **WHEN** a journal record is built
- **THEN** it MUST exclude `leaseToken` and callback native objects
- **AND** logs and journal entries MUST remain bounded
- **AND** `callSequence` MUST remain evidence only and MUST NOT become a retry,
  replay or deduplication key

#### Scenario: Journal is rotated or compacted

- **WHEN** the next append would exceed `MIST_QMT_SUBSCRIPTION_JOURNAL_ROTATE_BYTES`, whose default MUST be exactly `67108864` bytes
- **THEN** the datasource single writer MUST rotate under its writer lock before accepting another intent
- **AND** it MUST flush and `fsync` the active file, durably rename it to an immutable first/last-`journalSequence` archive, publish an `fsync`ed atomic SHA-256 manifest, and create an `fsync`ed `rotation_anchor` as the first record of the new active file
- **AND** every rename or replace MUST preserve a verified old or new copy across process interruption and durably publish parent-directory metadata using the Windows-supported equivalent
- **AND** startup MUST deterministically finish or roll back interrupted `.tmp` or `.rotating` state without deleting the last valid copy

#### Scenario: Journal archives require compaction

- **WHEN** active, archive, manifest and checkpoint bytes would exceed `MIST_QMT_SUBSCRIPTION_JOURNAL_ARCHIVE_MAX_BYTES`, whose default MUST be exactly `536870912` bytes
- **THEN** the datasource single writer MAY compact only archives whose every
  ID lifecycle has a durable terminal unsubscribe or a durable terminal
  `operator_observation` proving QMT context reload/rebuild
- **AND** an acknowledgement or storage-health observation alone MUST NOT resolve an ID lifecycle
- **AND** it MUST atomically publish and `fsync` an immutable `compaction_checkpoint` preserving each still-retained resolved lifecycle's ID, bucket, first/last journal sequence, terminal record hash and archive SHA-256 before deleting a source archive
- **AND** every unresolved or `retained-recovery` lifecycle MUST retain its complete records rather than only a summary
- **AND** if pinned evidence itself reaches the configured limit, datasource MUST fail closed before the next intent or native call and require operator maintenance
- **AND** no subscription state may be moved to MySQL or Redis

#### Scenario: Resolved lifecycle detail expires

- **WHEN** a fully resolved lifecycle is older than `MIST_QMT_SUBSCRIPTION_JOURNAL_RESOLVED_RETENTION_DAYS`, whose default MUST be exactly `90` days
- **THEN** the single writer MAY replace its per-ID checkpoint detail with one fixed-size rolling sealed-range checkpoint
- **AND** that checkpoint MUST preserve first/last journal sequence, resolved lifecycle count and a SHA-256 root over the prior sealed checkpoint digest plus the retired terminal-record and archive digests
- **AND** it MUST be atomically published and `fsync`ed before superseded resolved-only archives or checkpoints are deleted
- **AND** unresolved and `retained-recovery` lifecycle details MUST NOT expire by age

#### Scenario: Journal size configuration is invalid

- **WHEN** either byte limit or the retention days is not an exact positive integer, the rotate limit cannot contain the maximum bounded record plus anchor, or the archive maximum is less than two rotate limits
- **THEN** QMT control readiness MUST fail before the first subscription mutation
- **AND** datasource MUST NOT silently substitute, clamp or dynamically grow either configured limit

### Requirement: Owner lease fences control and snapshot transport

The QMT bridge SHALL retain the existing owner contract:
`ownerId + leaseToken + generation`. The bridge SHALL generate `ownerId` once
at script load as `bigqmt-<process-id>`. Owner registration SHALL continue
returning an opaque `leaseToken` and integer `generation`; it SHALL NOT add
an additional context identity or `streamEpoch`. Registration SHALL occur on
initialization or after explicit lease loss; normal poll activity SHALL act as
heartbeat and MUST NOT rotate the lease or generation every second.

#### Scenario: Strategy context reloads in the same QMT process

- **WHEN** QMT reloads a strategy or context without changing its process ID
- **THEN** the bridge MAY retain the same `ownerId`
- **AND** this release MUST NOT add a separate context identity or force owner
  replacement solely because `init(ContextInfo)` ran again

#### Scenario: Datasource restarts while QMT context remains alive

- **WHEN** the old loopback lease stops being accepted
- **THEN** the bridge MUST register for a new lease before polling or posting snapshots
- **AND** physical QMT handles and callbacks MAY remain active
- **AND** the in-memory handle registry for this release is treated as non-crash-recoverable
- **AND** process-state loss requires operator context reconciliation before an
  HIL harness or future in-process caller explicitly requests another full sync

#### Scenario: An old process submits a request

- **WHEN** a poll, result or snapshot carries a mismatched `ownerId`,
  `leaseToken` or `generation`
- **THEN** datasource MUST reject it
- **AND** the token MUST NOT appear in journal, metrics, health or logs

### Requirement: Runtime capabilities are verified without guessing aliases

Transport qualification SHALL use read-only Python 3.6 introspection and
Windows HIL to verify the actual QMT methods, return values and callback
fixtures. Qualification SHALL not claim that a production subscription caller
is integrated.

#### Scenario: Runtime introspection runs

- **WHEN** the operator runs the approved probe
- **THEN** evidence MUST record `dir(ContextInfo)` matches for `subscribe*all*` and `subscribe*whole*`, `subscribe_quote`, `subscribe_whole_quote`, `unsubscribe_quote` and `get_market_data_ex`
- **AND** `getattr`, `__doc__` and `help` results MUST be recorded in sanitized form
- **AND** failure of `inspect.signature()` MUST be recorded as unknown rather than method absence

#### Scenario: An undocumented alias is present

- **WHEN** introspection finds a callable alias containing `all` or `whole`
- **THEN** evidence MUST record it
- **AND** production MUST NOT call it until an explicit official/runtime contract and fixture are accepted

#### Scenario: Callback contract is accepted for release

- **WHEN** Windows HIL captures single and whole callbacks
- **THEN** fixtures MUST prove the outer `{code: data}` shape, changed-symbol behavior, native field preservation and exact integer subscription IDs, with `0` accepted if returned
- **AND** HIL MUST prove the exact return type/value semantics of
  `unsubscribe_quote`; the current accepted runtime returns bool `true` for the
  first successful cancellation and bool `false` for the repeated released ID
- **AND** before creating another subscription, HIL MUST call `unsubscribe_quote` again with the same released `subId` and record the exact return or exception, callback cessation, observable active-subscription or quota release when available, and later ID reuse
- **AND** absent compatible evidence, production recovery MUST treat repeated cancellation as unknown and require QMT context reload rather than guessing idempotence or harm
- **AND** evidence MUST record observed or documented whole-list size, active ID limits and VIP/non-VIP permission constraints, using unknown where runtime cannot prove them
- **AND** any incompatible result MUST stop release review instead of silently falling back to periodic `get_full_tick`
