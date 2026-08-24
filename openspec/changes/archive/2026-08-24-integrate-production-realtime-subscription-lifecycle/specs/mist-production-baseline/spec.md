## MODIFIED Requirements

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
