# windows-docker-appliance Specification

## Purpose
Define the hybrid Windows production deployment where Docker Desktop runs
`apps/mist`, `apps/chan`, and MySQL, while the Windows-only TDX datasource
adapter remains a WinSW-managed host service.
## Requirements
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

### Requirement: MySQL state is persistent and backed up explicitly
The system SHALL persist MySQL data across container restarts and provide an
explicit backup path before upgrades that may change the database schema.

#### Scenario: MySQL data survives container recreation
- **WHEN** the MySQL container is recreated during a normal Mist deployment with
  `MYSQL_DATA_DIR=E:\quant\MistDocker\mysql-data`
- **THEN** existing MySQL data remains available after the new container starts

#### Scenario: Deployment creates pre-upgrade database backup
- **WHEN** a deployment includes database migrations
- **THEN** the deployment creates or requires a MySQL backup before applying the migrations
- **AND** the backup location is recorded in the deployment output

### Requirement: Database migrations follow the Mist release
The system SHALL run Mist database migrations as an explicit deployment step
before updated Mist application containers are considered healthy.

#### Scenario: Deployment applies migrations before health check
- **WHEN** the deployment updates the Mist image tag
- **THEN** the deployment runs the configured migration step against the MySQL container
- **AND** the deployment runs backend health checks only after migrations succeed

#### Scenario: Failed migration blocks application rollout
- **WHEN** the migration step fails
- **THEN** the deployment does not report the Mist Docker stack as healthy
- **AND** the deployment prints the migration log location

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

### Requirement: Windows nginx proxies to frontend service
The Windows Docker deployment SHALL keep nginx on the Windows API machine while
proxying the frontend path to the local `mist-fe` service.

#### Scenario: Operator routes browser traffic through nginx
- **WHEN** the operator starts the Windows Docker stack
- **THEN** nginx SHALL proxy `/` to `mist-fe:3000`
- **AND** nginx SHALL proxy `/api/mist/*` to `mist-backend:8001`
- **AND** nginx SHALL proxy `/api/chan/*` to `chan-api:8008`
- **AND** nginx SHALL NOT proxy browser traffic to the datasource port `9001`

#### Scenario: Operator deploys frontend image tag
- **WHEN** the operator runs `Deploy Windows Mist Stack` with a frontend image
  repository and frontend image tag
- **THEN** the workflow SHALL pass that value to the deployment script
- **AND** the deployment script SHALL write `MIST_FE_IMAGE` and
  `MIST_FE_IMAGE_TAG` into `E:\quant\MistDocker\.env`

#### Scenario: Operator rolls back frontend image tag
- **WHEN** the deployment fails and `previous_frontend_image_tag` is provided
- **THEN** rollback SHALL restore `MIST_FE_IMAGE_TAG` before restarting app
  services
- **AND** rollback SHALL keep the frontend tag unchanged when no previous
  frontend image tag is provided

### Requirement: Production app image tags are explicit

The Windows Docker deployment SHALL require explicit backend and frontend app
image tags for production workflow dispatches and deployment script runs.

#### Scenario: Operator dispatches production deploy workflow

- **WHEN** the operator runs `Deploy Windows Mist Stack`
- **THEN** backend and frontend image tag inputs MUST be supplied explicitly
- **AND** the workflow MUST NOT default either app image tag to `latest`

#### Scenario: Deployment script receives app tags

- **WHEN** `deploy-docker-appliance.ps1` prepares the Docker root
- **THEN** it MUST reject blank backend or frontend app image tags
- **AND** it MUST reject `latest` unless an explicit development override is
  added in a future change

### Requirement: Deployment records successful app image tags

The Windows Docker deployment SHALL persist the last successful backend and
frontend app image tags under the Docker deployment root after a healthy deploy.

#### Scenario: Deployment completes successfully

- **WHEN** migrations, app startup, health checks, and diagnostics complete
- **THEN** the deploy script MUST write the deployed backend image tag and
  frontend image tag to a deploy-history file under `E:\quant\MistDocker`
- **AND** the deploy-history file MUST NOT include database passwords,
  datasource paths, or GitHub tokens

### Requirement: Rollback falls back to recorded successful tags

The Windows Docker deployment SHALL use explicit previous tags first and then
recorded successful tags when rolling back a failed app rollout.

#### Scenario: Failure occurs with explicit previous tags

- **WHEN** deployment fails after the Docker root is prepared
- **AND** `previous_image_tag` or `previous_frontend_image_tag` is supplied
- **THEN** rollback MUST restore the supplied tag values before restarting app
  services

#### Scenario: Failure occurs without explicit previous tags

- **WHEN** deployment fails after the Docker root is prepared
- **AND** deploy-history contains a prior backend or frontend app tag
- **THEN** rollback MUST restore the recorded successful tag before restarting
  app services

#### Scenario: Failure occurs without any rollback tag

- **WHEN** deployment fails and neither explicit nor recorded rollback tags are
  available
- **THEN** rollback MUST NOT restart app services with the failed tag
- **AND** the deploy script MUST keep the original deployment failure visible to
  the caller

### Requirement: Diagnostics failures do not block rollback

The Windows Docker deployment SHALL keep diagnostic collection separate from
rollback control flow.

#### Scenario: Deployment fails and diagnostics also fail

- **WHEN** the deploy script enters the failure handler
- **AND** diagnostic collection throws an error
- **THEN** the script MUST warn about the diagnostics failure
- **AND** it MUST still attempt rollback
- **AND** it MUST rethrow the original deployment failure rather than the
  diagnostics failure

### Requirement: Web gateway image source policy is explicit

The Windows Docker deployment SHALL keep the nginx web gateway image
configurable and document the current mirror default used by the Windows runner.

#### Scenario: Operator uses default gateway image

- **WHEN** no custom `web_gateway_image` input or `WEB_GATEWAY_IMAGE` value is
  supplied
- **THEN** the deployment MAY use the documented
  `docker.m.daocloud.io/library/nginx:1.27-alpine` mirror default
- **AND** docs MUST state that Docker Hub image pull failures can use this
  mirror while GitHub Actions archive download failures are unrelated

#### Scenario: Operator pins a gateway image

- **WHEN** the operator supplies a gateway image with a digest or private mirror
- **THEN** the workflow and deploy script MUST pass that exact value to
  `WEB_GATEWAY_IMAGE`
- **AND** the compose template MUST use the configured value without rewriting
  it

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
