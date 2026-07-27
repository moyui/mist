## MODIFIED Requirements

### Requirement: Baseline records immutable production inputs
The production baseline SHALL record immutable inputs for every repository,
image, workflow and runtime root used by the deployment.

#### Scenario: Backend, frontend and datasource image refs are recorded
- **WHEN** baseline evidence is written
- **THEN** it MUST record the `mist` commit SHA and backend image tag
- **AND** it MUST record the `mist-fe` commit SHA and frontend image tag
- **AND** it MUST record the `mist-datasource` commit SHA, datasource image tag
  and resolved image digest
- **AND** it MUST state whether any image tag was `latest`

#### Scenario: Deploy and state refs are recorded
- **WHEN** baseline evidence is written
- **THEN** it MUST record the `mist-deploy` commit SHA used for workflows and scripts
- **AND** it MUST record `docker_root` and `datasource_state_root`
- **AND** it MUST record the TDX and QMT terminal bridge installed paths,
  SHA-256 values and runtime build identities

#### Scenario: Monitoring ref is included when monitored baseline is in scope
- **WHEN** the baseline includes monitoring deployment evidence
- **THEN** it MUST record the `mist-monitoring` commit SHA
- **AND** it MUST record the Windows exporter endpoint and Mac watchdog endpoint

### Requirement: Deployment evidence proves the Docker datasource stack was deployed
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
- **AND** the status MUST report `connected=true` and `ready=true` over the
  current datasource WebSocket route
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

## ADDED Requirements

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
