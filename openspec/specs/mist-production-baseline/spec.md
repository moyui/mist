# mist-production-baseline Specification

## Purpose
TBD - created by archiving change verify-mist-production-baseline. Update Purpose after archive.
## Requirements
### Requirement: Baseline records immutable production inputs
The production baseline SHALL record immutable inputs for every repository,
image, workflow and runtime root used by the deployment.

#### Scenario: Backend and frontend image refs are recorded
- **WHEN** baseline evidence is written
- **THEN** it MUST record the `mist` commit SHA and backend image tag
- **AND** it MUST record the `mist-fe` commit SHA and frontend image tag
- **AND** it MUST state whether any image tag was `latest`

#### Scenario: Datasource and deploy refs are recorded
- **WHEN** baseline evidence is written
- **THEN** it MUST record the `mist-datasource` commit SHA, datasource image tag
  and resolved image digest
- **AND** it MUST record the `mist-deploy` commit SHA used for workflows and scripts
- **AND** it MUST record `docker_root` and `datasource_state_root`
- **AND** it MUST record the TDX and QMT terminal bridge installed paths,
  SHA-256 values and runtime build identities

#### Scenario: Monitoring ref is included when monitored baseline is in scope
- **WHEN** the baseline includes monitoring deployment evidence
- **THEN** it MUST record the `mist-monitoring` commit SHA
- **AND** it MUST record the Windows exporter endpoint and Mac watchdog endpoint

### Requirement: Deployment evidence proves the hybrid stack was deployed
The production baseline SHALL include evidence from the Windows deployment path
that starts the application and datasource Docker services and permanently
removes the legacy WinSW services.

#### Scenario: Deploy workflow evidence is captured
- **WHEN** `Deploy Windows Mist Stack` is used for the baseline
- **THEN** evidence MUST record the workflow run identifier
- **AND** it MUST record backend, frontend and datasource image identities,
  Docker root, datasource state root, migration, backup and health-check inputs

#### Scenario: Deploy output includes backup and diagnostics paths
- **WHEN** deployment completes
- **THEN** evidence MUST record the MySQL backup path printed by deployment
- **AND** it MUST record the diagnostics path printed by deployment

#### Scenario: Legacy datasource services are absent
- **WHEN** container cutover evidence is accepted
- **THEN** it MUST show `mist-tdx-datasource` and `mist-qmt-datasource` Windows
  services do not exist
- **AND** it MUST show both datasource Compose services use the pinned image

#### Scenario: Datasource service is not replaced by app deploy
- **WHEN** a routine application deployment runs after the accepted cutover
- **THEN** it MUST NOT install, remove, or operate a host WinSW datasource service
- **AND** datasource replacement, when requested, MUST use the pinned
  source-scoped Compose service path

### Requirement: Health evidence covers host, containers, gateway, and datasource
The production baseline SHALL include health evidence for all Compose services,
host loopback bridge paths, gateway routing and internal datasource discovery.

#### Scenario: Docker and app health checks pass
- **WHEN** health evidence is captured
- **THEN** it MUST show MySQL, `mist-backend`, `chan-api`, `mist-fe`,
  `web-gateway`, `tdx-datasource`, and `qmt-datasource` healthy under Compose
- **AND** it MUST show backend health on `http://127.0.0.1:8001/app/hello`
- **AND** it MUST show Chan API health on `http://127.0.0.1:8008/app/hello`

#### Scenario: Gateway health checks pass
- **WHEN** gateway health evidence is captured on the Windows API machine
- **THEN** it MUST show the frontend gateway path responding
- **AND** it MUST show `/api/mist/app/hello` and `/api/chan/app/hello` responding

#### Scenario: Datasource health is checked from host and container
- **WHEN** datasource health evidence is captured
- **THEN** it MUST show host loopback health on ports `9001` and `9002`
- **AND** it MUST show application containers resolve and reach
  `tdx-datasource:9001` and `qmt-datasource:9002`
- **AND** it MUST show TDX can reach `host.docker.internal:17709`

#### Scenario: Backend and datasource realtime contracts are compatible
- **WHEN** either realtime source is configured as `builtin`
- **THEN** deployment health MUST read that source's internal backend status
  through the running backend container
- **AND** the status MUST report `connected=true` and `transportReady=true` over the
  current datasource WebSocket route
- **AND** deployment MUST independently read current bridge
  `ready/ownerId/ownerGeneration/bridgeBuildId` directly from datasource
  root/scoped HTTP health
- **AND** it MUST NOT require a backend-cached bridge object
- **AND** a missing legacy route, HTTP/WebSocket rejection or incompatible
  backend image MUST fail deployment rather than passing on container and HTTP
  health alone
- **AND** a source explicitly configured as `off` MUST be excluded from this
  compatibility assertion

### Requirement: Datasource runtime smoke proves business datasource paths
The production baseline SHALL include runtime smoke evidence produced against
the pinned datasource containers.

#### Scenario: Default runtime smoke is captured
- **WHEN** the default datasource runtime smoke runs
- **THEN** evidence MUST show health, provider manifest, normalized bars,
  snapshots, sectors, calendar/security paths and WebSocket ping/pong checks
- **AND** it MUST identify the datasource image digest containing or matching
  the smoke implementation

#### Scenario: Optional datasource smoke modes are captured when used
- **WHEN** reference, finance/report, formula, or live quote switches are used
- **THEN** evidence MUST record the exact switches
- **AND** it MUST record whether the smoke was state-changing

#### Scenario: Live quote smoke is explicit
- **WHEN** a live subscription-changing smoke is used
- **THEN** evidence MUST record the operator authorization
- **AND** it MUST record the requested symbols and cleanup outcome

### Requirement: Backup restore rehearsal proves database recoverability
The production baseline SHALL include a MySQL restore rehearsal against a
non-production temporary database container.

#### Scenario: Restore rehearsal uses the deploy backup
- **WHEN** the restore rehearsal runs
- **THEN** it MUST use the MySQL backup path recorded from the deployment
- **AND** it MUST NOT import into the production MySQL container

#### Scenario: Restore rehearsal validates schema state
- **WHEN** the restore rehearsal completes
- **THEN** the evidence MUST show the temporary database imported successfully
- **AND** it MUST show `schema_migrations` validation or an equivalent schema
  validation result

### Requirement: Mac-side probes prove LAN and browser entrypoint reachability
The production baseline SHALL include Mac-side probes for the browser gateway
and proxied API paths.

#### Scenario: Mac probes raw Windows host or configured DNS
- **WHEN** Mac-side smoke is captured
- **THEN** it MUST record the Windows LAN IP or hostname used
- **AND** it MUST record whether `/etc/hosts` or LAN DNS was required

#### Scenario: Mac probes gateway paths
- **WHEN** Mac-side smoke is captured
- **THEN** it MUST show the frontend gateway path responding
- **AND** it MUST show `/api/mist/app/hello` responding
- **AND** it MUST show `/api/chan/app/hello` responding

### Requirement: Baseline evidence is redacted and reviewable
The production baseline SHALL be recorded in a reviewable evidence document
without secrets.

#### Scenario: Evidence document is created
- **WHEN** the baseline verification work is complete
- **THEN** a Markdown evidence document MUST exist under the change evidence
  directory or another explicitly named docs path
- **AND** it MUST summarize refs, commands, workflow runs, backup path,
  diagnostics path, smoke results, Mac probes, blockers, and residual risks

#### Scenario: Secrets are redacted
- **WHEN** evidence is committed or shared
- **THEN** it MUST NOT include passwords, tokens, cookies, private `.env`
  values, or raw logs containing secrets

### Requirement: Baseline completion is blocked by missing critical evidence
The production baseline SHALL remain incomplete when required evidence is
missing or failed.

#### Scenario: Critical check fails
- **WHEN** deployment, health, datasource smoke, restore rehearsal, or Mac-side
  gateway probe fails
- **THEN** the evidence MUST record the failure
- **AND** the baseline MUST NOT be marked known-good

#### Scenario: Check is intentionally deferred
- **WHEN** a required check cannot be performed in the current session
- **THEN** the evidence MUST record the blocker
- **AND** it MUST identify the exact command or workflow needed to finish the
  check later

### Requirement: Production baseline records formal dual-source realtime state

The production baseline SHALL identify QMT native callback acquisition, the
unified TDX/QMT schema-v2 snapshot contract, both new source converters,
current modes and the exact installed application and terminal artifacts.

#### Scenario: Final production baseline is captured

- **WHEN** production evidence is refreshed
- **THEN** it MUST record repository/image identities, `TDX_REALTIME_MODE`, `QMT_REALTIME_MODE`, datasource/backend frame schema, QMT owner/build identity and journal location/health
- **AND** bridge readiness/owner/build evidence MUST come from datasource
  root/scoped HTTP health, while backend compatibility evidence MUST record
  only `connected` and `transportReady`
- **AND** it MUST record that this transport-only change has no production
  subscription caller and MUST distinguish normal dormant state from
  test-harness-created QMT whole/single IDs
- **AND** it MUST not describe periodic `get_full_tick` as maintained realtime acquisition

#### Scenario: A realtime source is temporarily rolled back

- **WHEN** the baseline is captured while an approved rollback has set TDX or
  QMT to `off`
- **THEN** it MUST identify the affected source, both effective source modes,
  operator action, backup identifier, reason and exact recovery command or
  procedure
- **AND** it MUST record that monitoring for the other enabled source remains
  present
- **AND** it MUST not treat `off` as proof of physical unsubscribe or the long-term production target

### Requirement: Protected tables remain unchanged during ingress promotion
The formal ingress deployment and HIL SHALL compare deterministic row counts and digests for protected MySQL tables before and after every source phase.

#### Scenario: Ingress-only verification completes
- **WHEN** TDX or QMT baseline, enabled, restart or rollback evidence is accepted
- **THEN** `k`, provider K extensions, strategy signals and alert-event protected digests remain identical

### Requirement: Baseline proves persistent datasource recovery
The production baseline SHALL prove QMT state survives container recreation and
that each datasource can be recovered independently.

#### Scenario: QMT container is recreated
- **WHEN** the baseline recovery rehearsal recreates `qmt-datasource`
- **THEN** journal and checkpoint checksums remain valid
- **AND** the bridge re-registers ownership before QMT is reported ready

#### Scenario: One datasource is restarted
- **WHEN** either datasource service is restarted
- **THEN** the other datasource and application services are not recreated
- **AND** post-restart health and bridge readiness are captured

### Requirement: Container acceptance shares the native subscription HIL window

The container release SHALL use the same supported trading-session window,
protected pre/post digest and sanitized manifest as
`migrate-qmt-realtime-to-native-subscription`, while preserving a separate
container-deployment verdict.

#### Scenario: Shared HIL manifest is captured

- **WHEN** the joint HIL begins
- **THEN** evidence MUST record datasource container IDs, common pinned image
  tag/digest, QMT bind mount, WinSW absence, Compose DNS and TDX
  container-to-host `17709` reachability before provider mutation
- **AND** the subscription harness MUST separately record native control,
  callback, converter and common-ingress evidence
- **AND** neither evidence class MUST substitute for the other

#### Scenario: Shared recovery and soak completes

- **WHEN** provider mutation cleanup has completed
- **THEN** QMT and TDX datasource containers MUST be restarted one at a time
- **AND** the other datasource and application container identities MUST remain
  unchanged
- **AND** QMT journal/checkpoint continuity, bridge re-registration and a joint
  container/bridge/journal/realtime soak MUST be recorded
- **AND** the joint release gate MUST remain blocked unless both OpenSpec
  change verdicts and the protected post-digest pass

### Requirement: QMT runtime capability evidence is complete

Windows evidence SHALL record actual terminal/runtime versions and sanitized method introspection before the callback release is enabled.

#### Scenario: Runtime probe is captured

- **WHEN** the operator executes the approved read-only probe
- **THEN** evidence MUST record QMT/迅投 version, terminal build, embedded Python version, strategy runtime build ID, actual `subscribe_quote`, `subscribe_whole_quote`, `unsubscribe_quote` and relevant `*all*/*whole*` methods
- **AND** it MUST record return values, callback shapes, permissions, official-document access date and failed signature inspection as unknown

#### Scenario: Alias is discovered

- **WHEN** runtime exposes another `subscribe*all*` or `subscribe*whole*` callable
- **THEN** evidence MUST list it without guessing equivalence
- **AND** release code MUST continue to call only the accepted official/runtime-verified methods

### Requirement: QMT trading-session HIL proves callback behavior

QMT transport acceptance SHALL require a supported Beijing trading session
using `300502.SZ`, and additional exact desired symbols when needed to prove
multi-code whole callback behavior. Passing this HIL SHALL not claim that
production desired-subscription integration is active.

#### Scenario: Single subscription is tested

- **WHEN** the operator calls `subscribe_quote(..., period='tick', result_type='dict')`
- **THEN** evidence MUST capture an exact integer ID, including `0` if returned, one-code `{code: data}` callback map, callback freshness/count and complete native fixture

#### Scenario: Whole subscription is tested

- **WHEN** the operator calls `subscribe_whole_quote(exactDesiredSymbols)`
- **THEN** evidence MUST capture an exact integer ID, including `0` if returned, changed-symbol behavior, one-code and available multi-code callback maps, and proof that only exact desired provider symbols were requested

#### Scenario: Unsubscribe is tested

- **WHEN** the operator calls `unsubscribe_quote(subId)`
- **THEN** evidence MUST capture the exact returned type/value or exception
- **AND** the production contract MUST fix the current runtime result as exact
  bool `true` for a successful active-ID cancellation
- **AND** exact bool `false`, callback silence, K-line history reads and bridge
  poll heartbeat MUST not be presented as proof

#### Scenario: Released subscription ID is cancelled again

- **WHEN** the first `unsubscribe_quote(subId)` has returned exact bool `true`
  and no later subscription has been created
- **THEN** HIL MUST call `unsubscribe_quote` once more with the exact same released `subId`
- **AND** evidence MUST capture the second exact return type/value or exception, continued callback cessation, observable active-subscription or quota release when the runtime exposes it, and whether later subscriptions reuse that integer ID
- **AND** release evidence MUST record the current runtime's exact bool `false`
  result and classify it as unconfirmed rather than recovery success
- **AND** callback silence alone MUST NOT qualify repeated cancellation as safe

#### Scenario: Callback shape is compared with tick structure

- **WHEN** raw fixtures are reviewed
- **THEN** evidence MUST preserve the callback outer code map and complete inner tick fields
- **AND** field aliases/types such as `time`, `stime` or `timetag`, including unit, timezone and precision, MUST be recorded exactly
- **AND** evidence MUST treat those fields as candidate representations of one
  provider business time and record their ordered fallback, parser and
  simultaneous-value consistency
- **AND** backend event-time mapping MUST cite the accepted production fixture rather than selecting a documentation example
- **AND** an incompatible fixture MUST stop release rather than trigger silent polling fallback

#### Scenario: Callback fields match get_full_tick

- **WHEN** single or whole callback fixtures contain the same logical native fields as `get_full_tick`
- **THEN** evidence MUST classify the transport as `latest-state native snapshot`
- **AND** callback count or field completeness MUST NOT be presented as proof of tick-complete delivery

### Requirement: Lifecycle HIL covers the simplified control model

QMT HIL SHALL validate whole reset, single overlay, individual single
unsubscribe, failure retention, owner lease and operator recovery through a
test-only in-process Mist client harness, without requiring transaction replay,
automatic crash recovery or a production mutation endpoint.

#### Scenario: Test-only harness owns the control connection

- **WHEN** end-to-end control HIL begins
- **THEN** the normal Mist client for that provider MUST be stopped or isolated
- **AND** the harness MUST construct the normal provider client in a Nest
  application context and become the only backend leader
- **AND** it MUST call the four in-process methods rather than open a separate
  raw WebSocket or HTTP mutation route

#### Scenario: Candidate and recovery images are preflighted

- **WHEN** a production-host HIL plans to stop or isolate the normal backend
- **THEN** it MUST first record the running backend image ID, the Compose-resolved
  backend image reference and the intended candidate full SHA
- **AND** the Compose-resolved image MUST contain the test-only HIL entrypoint;
  checking only the currently running container is insufficient
- **AND** the exact recovery image MUST already exist locally, or registry
  authentication and a pull of that exact image MUST succeed before the backend
  is stopped
- **AND** the recovery command and backend health endpoint MUST be validated
  against the exact Docker root and Compose environment
- **AND** any mismatch, missing entrypoint, unavailable image or invalid recovery
  path MUST stop HIL before backend stop and before provider mutation

#### Scenario: Harness setup fails after backend isolation

- **WHEN** an unexpected failure occurs after the normal backend has been stopped
- **THEN** the workflow MUST attempt recovery with the preflighted exact image
  and Compose environment before reporting HIL completion
- **AND** it MUST wait for backend health, record whether the former production
  client reconnected and record whether provider cleanup ran
- **AND** failure to recover MUST be reported as a production recovery incident,
  not only as a failed HIL assertion
- **AND** the HIL result MUST remain failed even when a later independent
  deployment restores service

#### Scenario: Whole and single converge

- **WHEN** harness calls `syncSubscriptions` successfully and then calls
  `subscribe` for one explicit single
- **THEN** evidence MUST show exactly two logical buckets:
  nullable `whole{subId,symbols}` and `singles{providerSymbol:subId}`
- **AND** `whole.subId` and `whole.symbols` MUST be observed as one inseparable state
- **AND** no symbol may appear in both

#### Scenario: Handle membership and business authorization differ

- **WHEN** one callback code belongs to the current datasource handle but the Mist source business allowlist fixture does not resolve it
- **THEN** datasource evidence MUST show the code passed current handle membership without performing business authorization
- **AND** Mist backend MUST reject that entry before converter and common ingress
- **AND** another member code that resolves through the business allowlist MUST remain acceptable
- **AND** a non-member code MUST instead be rejected by datasource before formal publication

#### Scenario: Full reset runs

- **WHEN** harness explicitly calls `syncSubscriptions` again
- **THEN** evidence MUST show sequential unsubscribe calls, durable
  result/registry-transition records and creation of one replacement whole only
  after all prior IDs return exact bool `true` or an explicitly HIL-qualified
  integer success value and those transitions become durable

#### Scenario: Unsubscribe is unconfirmed

- **WHEN** a native unsubscribe returns an unexpected value or raises
- **THEN** evidence MUST show the original ID retained
- **AND** replacement subscribe MUST be absent
- **AND** the backend-facing failure MUST use
  `QMT_UNSUBSCRIBE_UNCONFIRMED` with `subscriptionState=unknown`
- **AND** the common monitoring result MUST be failure

#### Scenario: Journal durability faults are injected

- **WHEN** the deterministic lifecycle harness injects journal failure before intent durability, after an integer subscribe result, and after a confirmed unsubscribe result
- **THEN** intent failure MUST expose zero native calls and leave registry membership unchanged
- **AND** subscribe-result failure MUST retain the observed ID, return `QMT_JOURNAL_DURABILITY_FAILED` and block overlapping mutation
- **AND** confirmed-unsubscribe-result failure MUST retain the original public bucket entry as private `retained-recovery`, return `QMT_JOURNAL_DURABILITY_FAILED/unknown`, set `reconciliationRequired` and expose no replacement or later mutation
- **AND** evidence MUST show that none of those failure paths automatically repeats a native call

#### Scenario: Journal maintenance is interrupted

- **WHEN** deterministic tests interrupt rotation before archive rename, manifest publication or new-active `rotation_anchor`, or interrupt compaction before or after checkpoint publication
- **THEN** restart MUST deterministically retain or restore the last valid active/archive copy
- **AND** hash-chain and SHA-256 verification MUST retain every unresolved and `retained-recovery` lifecycle
- **AND** a deterministic clock MUST prove resolved per-ID detail is retained through day 90, may then fold into the rolling sealed-range checkpoint, and unresolved detail never expires by age
- **AND** pinned evidence at the configured cap MUST fail control before the next intent or native call

#### Scenario: Reconciliation is attempted after a retained recovery ID

- **WHEN** journal storage becomes healthy after a confirmed-unsubscribe durability failure
- **THEN** storage health alone MUST NOT unlock mutation
- **AND** a same-process unlock MUST require a durable explicit
  `operator_observation` proving context reload/rebuild
- **AND** evidence MUST show QMT context reload or rebuild and datasource
  restart rather than another unsubscribe call; the current runtime's repeated
  cancellation returns bool `false`

#### Scenario: Late control result is sequence fenced

- **WHEN** HIL or the deterministic transport harness expires call A, exposes
  call B and then delivers A's result
- **THEN** evidence MUST show strictly increasing QMT `callSequence` values
- **AND** A MUST be rejected without changing B's slot or the subscription
  registry
- **AND** B's matching result MUST remain acceptable

#### Scenario: Owner lease is replaced

- **WHEN** datasource transport is deliberately restarted during HIL
- **THEN** old lease traffic MUST be rejected
- **AND** evidence MUST show that the client sends no automatic read or mutation
  after reconnect
- **AND** any reconciliation call MUST be made explicitly by the harness

### Requirement: Unified frame migration and affected source paths receive proportional validation

The unified schema-v2 envelope and both new converters SHALL receive complete
contract/integration/HIL validation. TDX SHALL also receive validation of the
new datasource control facade and simplified bridge→datasource transport. Its
provider-native acquisition fields SHALL not be redefined, but the new TDX
converter MUST be qualified from accepted raw fixtures.

#### Scenario: QMT end-to-end fixture runs

- **WHEN** accepted single and whole fixtures pass through bridge wrapper, datasource frame and backend decoder
- **THEN** valid native map entries MUST reach common ingress individually
- **AND** one malformed entry MUST not block other entries
- **AND** each canonical readback MUST preserve resolved `securityId`, original
  `providerSymbol`, complete native object and fixture-backed nullable
  `eventTime`
- **AND** a non-null `eventTime` MUST be traceable to the raw provider fixture,
  while null MUST remain aggregation-ineligible
- **AND** common latest MUST be read back by `securityId` without epoch or sequence

#### Scenario: New TDX schema-v2 fixture runs

- **WHEN** an accepted TDX raw fixture passes through datasource and backend
- **THEN** datasource MUST wrap it as a one-entry schema-v2 native map
- **AND** the new TDX converter MUST produce the expected canonical snapshot
  and common ingress call
- **AND** its canonical `eventTime` MUST be traceable to the accepted TDX
  provider-native business-time field without using captured, send or receipt
  time
- **AND** canonical identity MUST use the same
  `securityId + providerSymbol` fields as QMT
- **AND** no active schema-v1 compatibility fixture may be used as release proof

#### Scenario: Backend runtime state is inspected

- **WHEN** post-cutover source health and symbol diagnostics are captured
- **THEN** evidence MUST show one common latest snapshot store keyed by
  `securityId` plus provider-local readiness/freshness state
- **AND** it MUST show no `RealtimeSymbolSequenceFence`, `lastSequence`,
  `currentStreamEpoch`, duplicate or out-of-order snapshot rejection
- **AND** disconnect evidence MUST distinguish retained stale latest from
  provider readiness

#### Scenario: TDX acquisition and changed snapshot delivery are assessed

- **WHEN** release scope is reviewed
- **THEN** `subscribe_hq -> dirty -> get_market_snapshot` MUST remain unchanged
- **AND** Windows HIL MUST call the four new TDX control methods through the
  test-only in-process Mist client harness and cover the changed
  `/tdx/bridge/snapshot` request
- **AND** evidence MUST prove no `producerSequence`, no automatic snapshot POST
  retry, no producer-sequence dedup and no success item ack/sequence
  response
- **AND** evidence MUST prove the unified schema-v2 one-entry map, absence of
  formal sequence/fence and the new TDX converter readback
- **AND** prior TDX native field acquisition qualification MAY be reused only
  as the raw converter fixture input

#### Scenario: TDX unsubscribe postcondition is captured

- **WHEN** Windows TDX control HIL calls the client's internal `unsubscribe`
- **THEN** evidence MUST preserve the bounded native-call outcome and the
  subsequent normalized fresh terminal-native list
- **AND** acceptance MUST follow list membership rather than interpreting the documented `Error` text or `ErrorId` alone

#### Scenario: TDX unsubscribe remains absent across bridge polls

- **WHEN** the deterministic transport test inserts a bridge poll between the
  unsubscribe desired transition and HTTP verification
- **THEN** the poll MUST expose no stale subscribe for the target symbol
- **AND** an older desired-revision result MUST not replace current convergence
  evidence
- **AND** after HIL reports `success:null`, the fresh terminal-native list MUST keep the
  symbol absent for at least three complete bridge poll/result cycles
- **AND** evidence MUST show that no public control response contains
  `desiredRevision`

#### Scenario: TDX cancellation remains subscribed

- **WHEN** a real terminal/runtime incident leaves the target in the fresh
  post-operation terminal-native list
- **THEN** evidence MUST show
  `TDX_UNSUBSCRIBE_NOT_CONVERGED/subscriptionState=subscribed`
- **AND** monitoring MUST use the same common counter schema as QMT
- **AND** absence of such an incident MUST remain `not-observed` under
  `capture-realtime-provider-anomalies` rather than being manufactured for HIL

#### Scenario: TDX cancellation state is unknown

- **WHEN** a real terminal/runtime incident naturally produces list failure,
  timeout or invalid list data
- **THEN** evidence MUST show
  `TDX_UNSUBSCRIBE_VERIFY_FAILED/subscriptionState=unknown`
- **AND** no raw provider payload may be required by the backend-facing response
- **AND** absence of such an incident MUST remain `not-observed` under
  `capture-realtime-provider-anomalies` rather than being manufactured for HIL

### Requirement: Release uses a maintenance window and manual bridge installation

The release SHALL be treated as a maintenance-window change. The operator SHALL manually replace affected TDX and QMT bridges; application deployment MUST not install either artifact. Production subscription lifecycle MUST remain off until assignments, compatible services, journal recovery, source-specific control and monitoring pass their gates.

#### Scenario: Bridge is installed

- **WHEN** the operator copies either new bridge
- **THEN** TDX evidence MUST record provider, exact installed path, SHA-256 and runtime build ID
- **AND** QMT evidence MUST record the manually imported artifact path/SHA-256, QMT project identity, runtime build ID and bridge runtime fingerprint
- **AND** when QMT does not expose a file-backed installed path, evidence MUST record `platform_unavailable` and retain the import artifact SHA plus runtime introspection instead of claiming an unverifiable installed-file SHA
- **AND** TDX and QMT bridge identities MUST be recorded independently
- **AND** the deployment system MUST not overwrite either artifact

#### Scenario: Bridge is installed before compatible datasource

- **WHEN** either new bridge calls a route contract that is not yet live
- **THEN** temporary errors are accepted inside the maintenance window
- **AND** no snapshot may be reported ready or accepted until compatible datasource/backend are active

#### Scenario: TDX producer wire is switched

- **WHEN** the operator replaces the TDX bridge or datasource side of the `/tdx/bridge/snapshot` contract
- **THEN** TDX realtime snapshot traffic MUST remain paused until both sides use the no-`producerSequence` contract
- **AND** this transition MUST NOT be described as rolling compatible

#### Scenario: Compatible services are switched

- **WHEN** datasource, backend, monitoring and deployment candidates are deployed
- **THEN** TDX and QMT datasource MUST each be restarted only for its own installed bridge/contract step, and the affected backend runtime MUST be recreated
- **AND** the QMT mode tool MUST not restart TDX datasource
- **AND** the TDX mode tool MUST not restart QMT datasource
- **AND** lifecycle mode MUST remain off until assignment and recovery preflight succeeds

#### Scenario: Normal backend starts with production lifecycle enabled

- **WHEN** the compatible backend starts or accepts TDX/QMT `ready` or reconnect while lifecycle mode is on
- **THEN** the unique lifecycle coordinator MUST read persisted ACTIVE assignments and execute source-local `get -> full sync -> get`
- **AND** release evidence MUST distinguish desired, provider-specific active evidence, effective listener, freshness and convergence
- **AND** no public raw-control route, frontend direct control, CLI mutation or `apps/schedule` caller may be used to activate subscriptions

#### Scenario: Normal backend starts without a subscription caller

- **WHEN** the compatible backend accepts TDX or QMT `ready` or reconnects while lifecycle mode is off
- **THEN** it MUST send no subscription-control request automatically
- **AND** release evidence MUST describe control and snapshot transport as ready but production subscription lifecycle as not integrated
- **AND** no controller, frontend, CLI, diagnostic mutation route or scheduler may be added solely to activate this release

#### Scenario: Weekday 09:15 reset is accepted

- **WHEN** production evidence covers the Shanghai-time weekday 09:15 trigger
- **THEN** it MUST prove a full replacement/readback round, bounded trigger coalescing and unchanged unrelated source/container identity
- **AND** a holiday or out-of-session run MUST NOT be described as fresh market-data proof

#### Scenario: Intraday Security status changes are accepted

- **WHEN** production evidence activates an assigned Security during weekday 09:15–15:00 and later deactivates it
- **THEN** activation MUST use one missing-symbol subscribe plus readback without unrelated cancellation
- **AND** deactivation MUST issue no unsubscribe and remain deferred until a ready/reconnect or 09:15 reset proves removal

#### Scenario: QMT datasource restarts with subscription journal state

- **WHEN** QMT datasource restarts while journal contains resolved, recoverable or unknown lifecycle evidence
- **THEN** evidence MUST show verified journal replay, deterministic exact-ID cleanup attempts and current owner fencing
- **AND** exact false or unknown MUST keep replacement blocked until approved context-rebuild recovery
- **AND** successful recovery MUST preserve journal/checkpoint continuity and unrelated protected state

### Requirement: Rollback is source scoped and preserves evidence

Rollback SHALL set `QMT_REALTIME_MODE=off`, let the HIL harness attempt
cancel-all while it still owns the connection,
manually restore both former bridges when they were installed, and restore
compatible application images without modifying TDX mode, databases or Redis
volumes.

#### Scenario: QMT rollback runs

- **WHEN** callback release fails acceptance
- **THEN** the operator MUST preserve journal and QMT print logs, let the
  still-connected HIL harness attempt `syncSubscriptions([])`, set QMT off and
  reload/restore the QMT strategy artifact
- **AND** if the harness is no longer available, evidence MUST record that
  cancel-all was not callable rather than assume another operator mutation path
- **AND** any unconfirmed ID MUST remain recorded
- **AND** no database rollback or Redis deletion is permitted

#### Scenario: Source-scoped tooling is verified

- **WHEN** rollback uses `Source=qmt`
- **THEN** the TDX datasource service MUST remain running
- **AND** evidence MUST record the before/after service identities

#### Scenario: TDX bridge transport is rolled back

- **WHEN** the simplified TDX snapshot contract must be rolled back
- **THEN** the operator MUST manually restore the matching former TDX bridge
  before restarting the TDX datasource
- **AND** evidence MUST record old/new installed SHA-256 and prove the restored
  bridge and datasource agree on `producerSequence`
- **AND** QMT mode and datasource MUST remain unchanged by that TDX-specific step

### Requirement: Protected production state remains unchanged

HIL and rollback SHALL not change protected business tables or unrelated realtime/candle state.

#### Scenario: Production proof completes

- **WHEN** the HIL window ends
- **THEN** the protected-table digest MUST equal its pre-test value
- **AND** no migration, production business-table mutation or Redis-volume deletion may be attributed to this change

#### Scenario: Non-trading-session verification runs

- **WHEN** HIL occurs outside a supported market session
- **THEN** it MAY prove routes, owner, IDs, journal, unsubscribe attempts and restart behavior
- **AND** it MUST not claim callback freshness or changed-symbol proof

### Requirement: Trading-session evidence is shared with datasource container acceptance

The production baseline MAY use one maintenance window and one sanitized
manifest to accept this change together with
`containerize-tdx-qmt-datasources`, but SHALL retain separate conclusions for
the Docker datasource deployment and native subscription transport.

#### Scenario: Joint HIL preflight begins

- **WHEN** the operator prepares the shared trading-session HIL
- **THEN** evidence MUST record both datasource Compose container IDs, the
  common pinned datasource image tag/digest, Docker root, datasource state
  root, QMT state bind and legacy WinSW absence
- **AND** it MUST prove backend-to-datasource Compose DNS, host loopback bridge
  access and TDX container-to-host `17709` reachability
- **AND** routine deployment MUST NOT require `datasource_root` or
  `remove_legacy_winsw`

#### Scenario: Joint HIL exercises source-scoped recovery

- **WHEN** QMT and TDX datasource containers are restarted one at a time after
  mutation cleanup
- **THEN** the non-target datasource and application container identities MUST
  remain unchanged
- **AND** QMT journal/checkpoint continuity and both bridge owner re-registration
  MUST be recorded
- **AND** reconnect MUST NOT automatically issue a subscription read or mutation

#### Scenario: Joint manifest is reviewed

- **WHEN** the shared HIL evidence is finalized
- **THEN** it MUST contain separate
  `containerizeTdxQmtDatasources` and
  `migrateQmtRealtimeToNativeSubscription` results
- **AND** container health MUST NOT satisfy callback/control requirements
- **AND** callback/control success MUST NOT satisfy image, mount, WinSW-absence
  or independent-recovery requirements
- **AND** the joint release gate MUST pass only when both results pass and the
  shared protected pre/post digest is unchanged

