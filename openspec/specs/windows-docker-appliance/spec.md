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

### Requirement: Notification Worker Shall Be A Dedicated Appliance Service
The Windows appliance SHALL run the notification worker as a dedicated service reusing the shared image and
selecting the notification entrypoint by command, with Redis queue access, per-channel secrets injected via
deploy secret or env boundaries, an independent healthcheck, and rollback that does not affect strategy,
candle, or transport services.

#### Scenario: Notification worker is deployed
- **WHEN** the appliance stack is brought up
- **THEN** a dedicated notification service MUST be present
- **AND** it MUST connect to the shared Redis for the strategy-alert-delivery queue
- **AND** channel credentials MUST be supplied via secrets, not baked into the image

#### Scenario: Notification worker is rolled back
- **WHEN** the notification service is stopped or rolled back
- **THEN** strategy evaluation, candle, and transport services MUST remain unaffected
- **AND** already committed Signal and AlertEvent records MUST remain intact

### Requirement: Market Candle Redis Shall Retain An Owned Namespace
The Windows appliance SHALL provide the persistent runtime Redis service used by market-data state, with
market-owned keys, health checks and capacity observations. In the accepted single-node V1 topology the same
endpoint and volume MAY also host realtime BullMQ keys under a separate prefix and connection owner.

#### Scenario: The candle foundation is deployed
- **WHEN** Compose configuration is resolved
- **THEN** market keys MUST remain separate from BullMQ keys
- **AND** the shared Redis MUST enable AOF and use `maxmemory-policy noeviction`
- **AND** queue write or processing failure MUST NOT roll back a committed candle
- **AND** candle product mode MUST default to `off`

### Requirement: Signal Application Deployment Shall Remain Disabled Until Reviewed
The Windows appliance SHALL add the `signal` service and any trigger infrastructure only after their process,
Redis, volume, health and startup decisions are accepted.

#### Scenario: Candle foundation is deployed without strategy approval
- **WHEN** Compose is rendered
- **THEN** no enabled `signal` service or queue dependency MUST be inferred from candle deployment

#### Scenario: Signal service topology is rendered
- **WHEN** the approved `signal` service is added
- **THEN** one container MUST host the Hybrid Nest internal HTTP, TCP registry-refresh and BullMQ realtime runtime
- **AND** the Compose service MUST be named `signal`, its container MUST be named `mist-signal`, and it MUST run
  `node dist/apps/signal/main.js` from the shared `MIST_IMAGE:MIST_IMAGE_TAG`
- **AND** Compose MUST NOT create separate Signal API and Signal worker containers with duplicated in-memory
  state
- **AND** it MUST NOT create a separate Signal image repository or tag
- **AND** web-gateway configuration MUST NOT publish the internal Signal HTTP listener

#### Scenario: Signal listeners are configured
- **WHEN** the `signal` container starts
- **THEN** internal HTTP MUST use `PORT=8010`
- **AND** registry-refresh TCP MUST use `SIGNAL_RPC_PORT=9010`
- **AND** `mist-backend` MUST resolve the RPC listener through `SIGNAL_RPC_HOST=signal` and
  `SIGNAL_RPC_PORT=9010`
- **AND** neither listener MUST publish a Windows host port or public gateway route
- **AND** BullMQ MUST NOT allocate another listener port

#### Scenario: The shared Mist image is built
- **WHEN** Docker build output is prepared
- **THEN** `nest build signal` MUST produce `dist/apps/signal/main.js`
- **AND** port 8009 MUST remain absent as a retired boundary

#### Scenario: Realtime strategy mode is off
- **WHEN** the signal service reports a healthy root status with `realtimeMode=off`
- **THEN** Compose health MUST NOT treat the intentionally unstarted realtime worker as a service failure

#### Scenario: Signal container health is configured
- **WHEN** the approved `signal` service is rendered
- **THEN** its healthcheck MUST call `http://127.0.0.1:8010/health` inside the container
- **AND** it MUST use a 30-second interval, 5-second timeout, 5 retries and 45-second start period
- **AND** it MUST require HTTP 200 and a valid root `status='ok'`, `instance='signal'` and `realtimeMode`
- **AND** it MUST NOT call `/app/hello`, `/live`, `/ready`, a host-published port or a gateway route

#### Scenario: A nested Signal capability is degraded
- **WHEN** raw `/health` remains HTTP 200 but registry, marketData, queue or evaluation reports a scoped degraded
  state or outcome
- **THEN** Compose MUST continue to treat the process as alive
- **AND** monitoring MUST evaluate and alert on the nested capability state separately

#### Scenario: Signal bootstrap fails
- **WHEN** configuration, TypeORM, initial registry, or enabled-mode Redis/BullMQ initialization fails before
  listeners start
- **THEN** the internal `/health` listener MUST remain unavailable
- **AND** deployment MUST NOT infer health from a partially initialized process

### Requirement: Signal Startup Order Shall Preserve Market Independence
The Windows appliance SHALL add Signal to the existing application startup batch without making market ingress
or candle sealing wait for strategy runtime readiness.

#### Scenario: The appliance starts its services
- **WHEN** the deployment script starts the Windows appliance
- **THEN** it MUST start datasource containers before checking MySQL and realtime Redis health
- **AND** it MUST complete backup and the explicit migration command before starting application services
- **AND** it MUST start `signal`, `mist-backend`, `chan-api` and `mist-fe` in the same application batch
- **AND** it MUST recreate `web-gateway` after that batch
- **AND** it MUST start monitoring, Prometheus and Grafana before final health checks and diagnostics

#### Scenario: Signal dependencies are rendered
- **WHEN** Compose renders the `signal` service
- **THEN** Signal MUST depend only on healthy MySQL and healthy realtime Redis
- **AND** it MUST NOT depend on datasource, backend, chan, frontend, gateway or monitoring services
- **AND** migration success MUST remain an explicit PowerShell gate rather than a
  `service_completed_successfully` or long-lived `mist-migrate` dependency
- **AND** Signal MUST use `restart: unless-stopped`

#### Scenario: Backend and Signal start concurrently
- **WHEN** the application batch starts
- **THEN** `mist-backend` MUST NOT depend on Signal health or readiness
- **AND** Signal MUST NOT depend on `mist-backend`
- **AND** a producer that becomes ready first MAY enqueue waiting jobs for the later BullMQ Worker
- **AND** market ingress and candle sealing MUST NOT wait for Signal bootstrap or health

#### Scenario: Signal fails during deployment
- **WHEN** Signal bootstrap or its root health check fails while backend market processing remains healthy
- **THEN** the backend MUST remain running and candle sealing MUST remain independent
- **AND** final deployment health and diagnostics MUST fail the overall Signal acceptance and preserve failure
  evidence

#### Scenario: Downstream infrastructure starts
- **WHEN** gateway and monitoring dependencies are rendered
- **THEN** `web-gateway` MUST NOT depend on Signal or publish a Signal route
- **AND** monitoring MUST NOT depend on `signal` with a healthy condition
- **AND** monitoring MUST be able to start and report Signal unavailable or degraded
- **AND** final deployment diagnostics MUST explicitly verify the Signal `/health` contract

### Requirement: Realtime BullMQ Shall Reuse The Single-Node Runtime Redis
The Windows appliance SHALL reuse the existing runtime Redis service, volume, AOF and
`MIST_REALTIME_REDIS_URL` for realtime BullMQ in the accepted single-node V1 topology.

#### Scenario: Queue infrastructure is rendered
- **WHEN** the approved BullMQ handoff is added to Compose
- **THEN** Compose MUST NOT add `mist-queue-redis`, a second Redis volume or `MIST_QUEUE_REDIS_URL`
- **AND** market state and BullMQ MUST use the same logical Redis database rather than an independently selected
  queue database
- **AND** market state MUST use namespace `mist:realtime:v1`
- **AND** BullMQ MUST use prefix `mist-bullmq` and its own connection owner on the existing Redis endpoint
- **AND** market and queue capacity/retention/health outcomes MUST remain separately observable

### Requirement: V1 Shall Not Add Signal-Specific Rollback Automation
V1 SHALL leave the existing appliance-wide rollback behavior unchanged and SHALL defer any Signal-specific
binary or schema rollback design to a future focused change.

#### Scenario: Realtime strategy mode is disabled
- **WHEN** an operator sets `REALTIME_STRATEGY_MODE=off`
- **THEN** the system MUST treat it as the approved runtime mode rather than a dedicated rollback protocol
- **AND** this change MUST NOT add Signal-specific image selection, down migration, queue deletion or rollback
  orchestration

#### Scenario: Redis connection owners are constructed
- **WHEN** realtime candle and strategy modes initialize their Redis adapters
- **THEN** the backend market writer, backend BullMQ producer, Signal market reader and Signal BullMQ Worker MUST
  have separate connection ownership
- **AND** they MUST NOT share one ioredis client object
- **AND** BullMQ MUST NOT use ioredis `keyPrefix` as its queue prefix
- **AND** the exact number of library-owned Worker connections MUST NOT become a deployment contract

#### Scenario: Realtime strategy mode is off
- **WHEN** `REALTIME_STRATEGY_MODE=off`
- **THEN** the backend MUST NOT construct the BullMQ producer
- **AND** Signal MUST NOT construct the BullMQ Worker or market reader
- **AND** `REALTIME_PRODUCTIZATION_MODE` MUST independently control whether the candle market writer uses Redis

#### Scenario: A Redis owner cleans up its data
- **WHEN** market expiry or maintenance removes realtime candle keys
- **THEN** it MUST target only exact market-owned keys under `mist:realtime:v1`
- **AND** it MUST NOT use `FLUSHDB`, cross-namespace wildcard deletion or remove `mist-bullmq` keys
- **AND** BullMQ keys MUST remain owned by BullMQ lifecycle and retention

#### Scenario: Shared Redis capacity is configured
- **WHEN** the single-node Redis service is rendered
- **THEN** deployment MUST verify `maxmemory-policy=noeviction`
- **AND** V1 MUST NOT claim a numeric Redis `maxmemory` bound, a market/queue memory quota or a BullMQ backlog cap
- **AND** market key and record counts, queue states, used memory, AOF growth and drain throughput MUST remain
  separately observable
- **AND** sustained pressure MUST be handled first by setting realtime strategy mode to `off`, pending a separately
  reviewed capacity, batching or physical-split change

#### Scenario: The shared Redis endpoint is unavailable
- **WHEN** a physical Redis outage occurs
- **THEN** market and queue health MUST both identify the shared failure domain
- **AND** deployment MUST NOT claim physical fault isolation between them

### Requirement: Windows Appliance Shall Run The Approved Backtest Service
The Windows Docker appliance SHALL run the independently configurable `backtest` service after its runtime,
health, resource and rollback design has been approved.

#### Scenario: The approved backtest runtime is deployed
- **WHEN** the operator deploys a release that enables backtest execution
- **THEN** Compose MUST start the `backtest` service with the approved image, environment and dependencies
- **AND** its deployment default for `BACKTEST_QUEUE_CAPACITY` MUST be `8`
- **AND** an operator override MUST remain within the approved integer range from `1` through `64`
- **AND** `mist-backend` MUST receive `BACKTEST_COMMAND_TIMEOUT_MS` with deployment default `3000`
- **AND** its operator override MUST remain within the approved integer range from `500` through `30000`
- **AND** the backtest startup-compensation path MUST check `backtest.ready` exactly once and MUST NOT wait for
  it to change
- **AND** `mist-backend` process startup and its unrelated capabilities MUST NOT depend on backtest readiness
- **AND** failure of a backtest run MUST NOT make market sealing or live signal evaluation unavailable

#### Scenario: Backtest container health is evaluated
- **WHEN** Compose probes the `backtest` container
- **THEN** it MUST use the Docker-internal `GET /health` and validate process liveness
- **AND** deployment completion MUST separately require the same response to contain `backtest.ready=true`
- **AND** the endpoint MUST NOT be published through the host or web gateway
- **AND** `mist-backend` MUST NOT use `depends_on: condition: service_healthy` or an equivalent hard dependency
  that prevents unrelated backend capabilities from starting

#### Scenario: Backtest internal listeners are configured
- **WHEN** Compose renders the `backtest` and `mist-backend` services
- **THEN** `backtest` MUST receive `PORT=8004` and `BACKTEST_RPC_PORT=8005`
- **AND** `mist-backend` MUST receive `BACKTEST_RPC_HOST=backtest`, `BACKTEST_RPC_PORT=8005` and
  `BACKTEST_HEALTH_URL=http://backtest:8004/health`
- **AND** monitoring MUST probe `http://backtest:8004/health` on the service network
- **AND** neither internal listener port MUST be published to the host or routed through the web gateway

#### Scenario: Backtest container resources use the approved V1 boundary
- **WHEN** Compose renders the `backtest` service
- **THEN** V1 MUST NOT add a Backtest-specific CPU or memory hard limit or reservation
- **AND** it MUST NOT add an environment variable or config-schema entry for such a container quota
- **AND** runtime protection MUST continue to use the approved concurrency, waiting-capacity, execution-deadline,
  consumed-bar and bounded-batch controls
- **AND** HIL MAY record actual CPU, heap and event-loop observations without turning guessed values into a
  release threshold

#### Scenario: The backtest service is replaced or restarted
- **WHEN** deployment changes the running `backtest` container
- **THEN** the appliance MUST prevent concurrent old and new backtest executors
- **AND** the new single instance MUST apply the approved interrupted-run failure rule before claiming new work
- **AND** it MUST remain unready until its one-time startup reconciliation is complete

### Requirement: Windows appliance deploys lifecycle schema and mode in a gated order

The Windows Docker appliance SHALL deploy realtime subscription lifecycle as a mode-gated matched release. It MUST back up and migrate MySQL before backend health, keep lifecycle mode off by default, validate assignment readiness and legacy allowlist conflict before on, and preserve QMT journal/assignment state during rollback.

#### Scenario: Lifecycle migration is prepared

- **WHEN** deployment includes the assignment schema
- **THEN** preflight MUST record real `schema_migrations`, target table/index/FK inventory and a verified backup
- **AND** the migration runner MUST apply the first confirmed unused forward-only migration before backend health checks

#### Scenario: Lifecycle candidate is deployed off

- **WHEN** compatible backend, datasource and monitoring images are first deployed with the deployment contract
- **THEN** `REALTIME_SUBSCRIPTION_LIFECYCLE_MODE` MUST resolve to off unless explicitly set to on
- **AND** deployment health MUST prove no production coordinator mutation or 09:15 cron is active

#### Scenario: Lifecycle is promoted on

- **WHEN** the operator promotes lifecycle mode to on
- **THEN** deployment preflight MUST require initialized routing assignments, per-source ACTIVE capacity valid, both legacy realtime env allowlists empty, compatible datasource/control health and QMT reconciliation clear
- **AND** backend MUST be recreated with the effective mode before convergence is claimed

#### Scenario: Conflicting allowlist remains

- **WHEN** lifecycle mode is on while either legacy realtime env allowlist is non-empty
- **THEN** deployment or backend startup MUST fail closed before production mutation
- **AND** scripts MUST NOT silently clear, import or prefer one desired authority

### Requirement: Lifecycle rollback and recovery remain source scoped

Deployment and runbooks SHALL separate application rollback from QMT handle recovery. Rolling lifecycle off MUST preserve the forward-only schema, assignments, journal/checkpoints, Redis and business tables; unknown QMT state MUST use the existing source-scoped context-rebuild workflow.

#### Scenario: Lifecycle application rollback runs

- **WHEN** lifecycle acceptance fails after promotion
- **THEN** deployment MUST set lifecycle mode off and restore recorded compatible image tags
- **AND** it MUST not delete the assignment table, journal state, Redis volume or MySQL business rows

#### Scenario: QMT recovery is required

- **WHEN** QMT startup cleanup returns false/unknown or journal replay is blocked
- **THEN** operator tooling MUST recover only QMT datasource/terminal context and publish durable observation evidence
- **AND** it MUST not restart TDX datasource or the whole stack automatically

#### Scenario: Production HIL is recorded

- **WHEN** lifecycle is accepted in a supported Windows trading session
- **THEN** evidence MUST pin all repository/image/terminal artifact identities and cover backend restart, both source reconnects, intraday single activation, deferred removal, 09:15 trigger, QMT journal restart recovery, active/effective listener and protected-table digest
- **AND** mock, route success, non-trading output or root health alone MUST NOT satisfy the gate

