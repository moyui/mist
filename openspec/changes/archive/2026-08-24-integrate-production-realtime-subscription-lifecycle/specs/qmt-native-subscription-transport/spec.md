## MODIFIED Requirements

### Requirement: Subscription journal is detailed and durable

Datasource SHALL append subscription intents, observed native results, registry transitions and startup recovery attempts to a local JSONL journal. The default Windows path SHALL be `F:\quant\MistAPI\datasource\state\qmt\subscription-journal.jsonl`, overridable by `MIST_QMT_SUBSCRIPTION_JOURNAL_PATH`. On startup datasource MUST verify the bounded journal/checkpoint chain, rebuild every unambiguous open or resolved lifecycle and finish one bounded cleanup phase before emitting transport `realtime.ready`. Cleanup failure MUST remain visible and block replacement without permanently blocking process health or WebSocket startup.

#### Scenario: A native control call is issued

- **WHEN** datasource exposes a control command to bridge
- **THEN** it MUST append, flush and `fsync` an intent record before execution
- **AND** the record MUST include timestamp, action, method, `callSequence`, exact symbol or symbol list, target `subId` when applicable, datasource instance, owner generation and bridge build identity where known

#### Scenario: A native control intent cannot be made durable

- **WHEN** create, append, flush or `fsync` fails before the intent becomes durable
- **THEN** datasource MUST fail the mutation with reason `QMT_JOURNAL_DURABILITY_FAILED`
- **AND** it MUST NOT expose a command, call native, allocate a returned ID or change registry membership
- **AND** an unsubscribe or cancellation-stage failure MUST use `subscriptionState=subscribed` when the unchanged registry proves membership, while a non-cancellation failure MUST retain the generic failure shape
- **AND** subsequent mutation MUST remain blocked while journal health is failed

#### Scenario: A native control result is observed

- **WHEN** datasource accepts a success or failure result
- **THEN** it MUST append the matching `callSequence`, returned type/value, exact integer returned ID when present, stable error reason, derived unsubscribe `subscriptionState` when applicable and post-result registry snapshot
- **AND** it MUST flush and `fsync` before reporting any successful subscription mutation

#### Scenario: A confirmed unsubscribe result cannot be made durable

- **WHEN** native unsubscribe is confirmed but appending, flushing or `fsync`ing its result and registry transition fails
- **THEN** datasource MUST return `QMT_JOURNAL_DURABILITY_FAILED/subscriptionState=unknown`
- **AND** it MUST retain the original ID in the same public bucket with private `retained-recovery` metadata
- **AND** it MUST NOT report the ID as confirmed-live, accept callback membership for it or expose a replacement mutation
- **AND** after restart only the bounded startup recovery owner MAY make one durable best-effort unsubscribe attempt for that exact ID
- **AND** a durable exact true recovery result or a durable explicit `operator_observation` proving QMT context reload/rebuild MAY clear that lifecycle

#### Scenario: Journal startup replay finds a complete open lifecycle

- **WHEN** verified records contain an exact integer subscription ID with durable subscribe result and registry transition but no terminal transition
- **THEN** datasource MUST reconstruct the corresponding whole or single registry bucket
- **AND** it MUST classify the ID for one startup cleanup attempt before normal replacement is allowed

#### Scenario: Journal startup replay finds an exact ID without a registry transition

- **WHEN** a durable native result contains an exact integer subscription ID but the matching registry transition is absent
- **THEN** datasource MUST classify that ID as unresolved rather than active
- **AND** it MAY expose exactly one startup cleanup attempt for that ID
- **AND** it MUST NOT replay the original subscribe call

#### Scenario: Startup recovery exposes a cleanup command

- **WHEN** current QMT owner readiness is established and one recoverable ID has no prior durable startup-attempt record
- **THEN** datasource MUST append, flush and `fsync` a recovery intent before exposing `unsubscribe_quote(subId)`
- **AND** recoverable IDs MUST be processed whole-first and then in deterministic single-symbol/subId order
- **AND** each lifecycle MUST receive at most one automatic startup attempt across restarts

#### Scenario: Startup recovery returns exact true

- **WHEN** bridge returns exact bool true for a startup cleanup and datasource durably records the result and terminal transition
- **THEN** datasource MUST remove that recovered ID from registry/unresolved state
- **AND** it MAY clear reconciliation only after every recoverable and unknown lifecycle is resolved

#### Scenario: Startup recovery is not confirmed

- **WHEN** a startup cleanup returns exact false, times out, throws, loses its result or cannot durably record its result
- **THEN** datasource MUST preserve the lifecycle as unresolved and set `reconciliationRequired=true`
- **AND** it MUST continue one attempt for other recoverable IDs without creating replacement subscriptions
- **AND** the bounded cleanup phase MAY finish and transport `realtime.ready` MAY be emitted with source state observable as blocked/degraded
- **AND** only the approved operator context-rebuild observation MAY later resolve the failed lifecycle

#### Scenario: Startup replay lacks an exact ID or verified chain

- **WHEN** an intent has no accepted result/ID, retained evidence is structurally ambiguous, or journal/checkpoint/hash state cannot be verified
- **THEN** datasource MUST expose no guessed native cleanup or subscribe call
- **AND** replacement mutation MUST remain blocked until deterministic storage recovery or operator context rebuild succeeds
- **AND** process health and bounded WebSocket startup MUST remain observable rather than waiting forever

#### Scenario: Sensitive or large data would enter the journal

- **WHEN** a journal record is built
- **THEN** it MUST exclude `leaseToken` and callback native objects
- **AND** logs and journal entries MUST remain bounded
- **AND** `callSequence` MUST remain evidence only and MUST NOT become a retry, replay or deduplication key
- **AND** startup-attempt identity MUST use the durable lifecycle/ID evidence rather than reusing a prior `callSequence`

#### Scenario: Journal is rotated or compacted

- **WHEN** the next append would exceed `MIST_QMT_SUBSCRIPTION_JOURNAL_ROTATE_BYTES`, whose default MUST be exactly `67108864` bytes
- **THEN** the datasource single writer MUST rotate under its writer lock before accepting another intent
- **AND** it MUST flush and `fsync` the active file, durably rename it to an immutable first/last-`journalSequence` archive, publish an `fsync`ed atomic SHA-256 manifest, and create an `fsync`ed `rotation_anchor` as the first record of the new active file
- **AND** every rename or replace MUST preserve a verified old or new copy across process interruption and durably publish parent-directory metadata using the Windows-supported equivalent
- **AND** startup MUST deterministically finish or roll back interrupted `.tmp` or `.rotating` state without deleting the last valid copy

#### Scenario: Journal archives require compaction

- **WHEN** active, archive, manifest and checkpoint bytes would exceed `MIST_QMT_SUBSCRIPTION_JOURNAL_ARCHIVE_MAX_BYTES`, whose default MUST be exactly `536870912` bytes
- **THEN** the datasource single writer MAY compact only archives whose every ID lifecycle has a durable terminal unsubscribe or a durable terminal `operator_observation` proving QMT context reload/rebuild
- **AND** an acknowledgement, startup-attempt record or storage-health observation alone MUST NOT resolve an ID lifecycle
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

The QMT bridge SHALL retain the existing owner contract: `ownerId + leaseToken + generation`. The bridge SHALL generate `ownerId` once at script load as `bigqmt-<process-id>`. Owner registration SHALL continue returning an opaque `leaseToken` and integer `generation`; it SHALL NOT add an additional context identity or `streamEpoch`. Registration SHALL occur on initialization or after explicit lease loss; normal poll activity SHALL act as heartbeat and MUST NOT rotate the lease or generation every second. Normal and startup-recovery control MUST use the same current owner fence and single native slot.

#### Scenario: Strategy context reloads in the same QMT process

- **WHEN** QMT reloads a strategy or context without changing its process ID
- **THEN** the bridge MAY retain the same `ownerId`
- **AND** this release MUST NOT add a separate context identity or force owner replacement solely because `init(ContextInfo)` ran again

#### Scenario: Datasource restarts while QMT context remains alive

- **WHEN** the old loopback lease stops being accepted
- **THEN** the bridge MUST register for a new lease before polling or posting snapshots
- **AND** physical QMT handles and callbacks MAY remain active
- **AND** datasource MUST reconstruct only journal-proven IDs and run bounded startup cleanup before normal replacement
- **AND** any unproven or unconfirmed lifecycle MUST keep operator reconciliation required

#### Scenario: Startup recovery waits boundedly for current owner

- **WHEN** journal replay identifies recoverable IDs before a current owner lease is ready
- **THEN** datasource MUST expose no cleanup command to a stale owner
- **AND** cleanup MUST use its bounded startup deadline and report owner-unavailable without preventing the remaining process/health boundary from starting
- **AND** replacement mutation MUST remain blocked until current owner fencing and recovery are established

#### Scenario: An old process submits a request

- **WHEN** a poll, result or snapshot carries a mismatched `ownerId`, `leaseToken` or `generation`
- **THEN** datasource MUST reject it
- **AND** the token MUST NOT appear in journal, metrics, health or logs
