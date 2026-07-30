## ADDED Requirements

### Requirement: Datasources run in the Windows Docker appliance
The system SHALL run TDX and QMT datasource gateways as independent services in
the existing Windows Docker Compose appliance while terminal-native bridge
scripts remain inside their Windows desktop clients.

#### Scenario: Containers use internal datasource URLs
- **WHEN** `mist-backend`, `chan-api` or monitoring starts in Docker
- **THEN** datasource traffic uses the `tdx-datasource` and `qmt-datasource`
  Compose service names
- **AND** application containers do not call terminal SDKs directly

#### Scenario: Docker deployment replaces host datasource services
- **WHEN** the datasource container cutover passes all acceptance gates
- **THEN** the deployment removes both datasource WinSW services
- **AND** future deployments operate only the datasource containers

## MODIFIED Requirements

### Requirement: Docker compose runs production Mist services
The system SHALL provide a production Docker Compose deployment for the Windows
API machine that runs MySQL, `apps/mist`, `apps/chan`, `mist-fe`, nginx web
gateway, TDX datasource and QMT datasource services.

#### Scenario: Production compose starts required services
- **WHEN** the operator starts the production Docker Compose stack on the Windows API machine
- **THEN** the stack starts MySQL, `mist-backend`, `chan-api`, `mist-fe`,
  `web-gateway`, `tdx-datasource`, and `qmt-datasource`
- **AND** `mist-backend` exposes port `8001`
- **AND** `chan-api` exposes port `8008`
- **AND** datasource ports `9001` and `9002` are published only on Windows loopback
- **AND** `web-gateway` exposes the configured browser entrypoint port

#### Scenario: Schedule is excluded from default production compose
- **WHEN** the operator starts the default production Docker Compose stack
- **THEN** `apps/schedule` is not started by default
- **AND** no schedule container performs cron-based data collection

### Requirement: Docker and datasource roots are independently configurable
The system SHALL keep Docker deployment assets under the Docker root while
allowing durable datasource state to use a separately configured Windows path.

#### Scenario: Docker root and datasource root use different drives
- **WHEN** the operator configures Docker root as `E:\quant\MistDocker`
- **AND** datasource state root as `F:\quant\MistAPI\datasource\state`
- **THEN** deployment scripts use the Docker root for Compose files, Docker
  environment, MySQL data, backups, and diagnostics
- **AND** Compose bind-mounts the datasource state root without installing a
  host Python runtime or service definition there

### Requirement: Hybrid health checks cover Docker and WinSW components
The system SHALL verify all Docker-managed services, the nginx web gateway and
the separately installed terminal bridge identities during deployment and
operator health checks.

#### Scenario: Health check validates full hybrid stack
- **WHEN** the operator runs the production health check
- **THEN** it checks Docker Compose service status for MySQL, `mist-backend`,
  `chan-api`, `mist-fe`, `web-gateway`, `tdx-datasource`, and `qmt-datasource`
- **AND** it checks `mist-backend` HTTP health on port `8001`
- **AND** it checks `chan-api` HTTP availability on port `8008`
- **AND** it checks the nginx gateway frontend and proxied API paths
- **AND** it checks both datasource health endpoints from host and application-container networks
- **AND** it records TDX and QMT bridge readiness/build identity separately

### Requirement: Diagnostics collect Docker and datasource logs together
The system SHALL provide one diagnostics command that captures application and
datasource Docker state into a timestamped diagnostics directory.

#### Scenario: Operator collects diagnostics
- **WHEN** the operator runs the diagnostics collection command
- **THEN** the command writes Compose status, recent logs for MySQL,
  application and both datasource containers, datasource health output, image
  identity, state-mount metadata and deployment metadata into one directory

#### Scenario: Deployment saves diagnostic snapshot
- **WHEN** a deployment completes or fails
- **THEN** the deployment saves recent Docker logs and health for both
  datasource services
- **AND** a diagnostics failure does not replace the original deployment error

### Requirement: Local datasource operations are scriptable
The system SHALL provide a Windows-local Docker datasource operations command
that can start, stop, restart and inspect each datasource without a GitHub
Actions dispatch.

#### Scenario: Operator restarts datasource locally
- **WHEN** the operator requests restart for TDX or QMT
- **THEN** the script validates Docker root, rendered Compose configuration,
  image identity, required state mount and source-specific dependencies
- **AND** it restarts only the requested Compose service
- **AND** it waits for that datasource health and bridge readiness

#### Scenario: Datasource workflow reuses local script
- **WHEN** the GitHub Actions datasource management workflow runs
- **THEN** it calls the same Docker operations script used by local operators
- **AND** the workflow does not contain an independent WinSW implementation

### Requirement: Runtime smoke can exercise datasource business paths
The system SHALL expose deployment-side commands that run the existing
`mist-datasource` runtime smoke suites against the deployed containers.

#### Scenario: Operator runs default runtime smoke
- **WHEN** the operator runs the deployment-side datasource smoke wrapper
- **THEN** it executes the pinned smoke tool or script matching the deployed image
- **AND** it verifies datasource health, provider manifest, normalized bars,
  snapshots, sectors, calendar/security paths, and WebSocket ping/pong

#### Scenario: Operator runs deeper runtime smoke modes
- **WHEN** the operator passes finance/report or reference/instrument smoke switches
- **THEN** the wrapper forwards those switches to the pinned smoke implementation
- **AND** formula and live subscription-changing checks remain opt-in

### Requirement: Generated backups and diagnostics have retention cleanup
The system SHALL provide bounded retention for MySQL backups and Docker
diagnostics under the Docker deployment root.

#### Scenario: Deployment prunes old MySQL backups
- **WHEN** the deployment creates a MySQL dump under the Docker backup path
- **THEN** it removes backup files older than the configured retention days
- **AND** it keeps at least the configured minimum count of newest backup files

#### Scenario: Deployment prunes old diagnostics snapshots
- **WHEN** the deployment writes diagnostics under the Docker diagnostics path
- **THEN** it removes diagnostics directories older than the configured retention days
- **AND** it keeps at least the configured minimum count of newest diagnostics directories
- **AND** it does not delete QMT journal state or archived migration evidence

## REMOVED Requirements

### Requirement: Datasource remains a Windows host service
**Reason**: Terminal-native access is now isolated behind builtin bridges, so
the platform-neutral datasource gateways can run in Docker without WinSW.

**Migration**: Use the independent `tdx-datasource` and `qmt-datasource`
Compose services. After their acceptance gates pass, uninstall and delete both
WinSW services and operate failures through container repair-forward.
