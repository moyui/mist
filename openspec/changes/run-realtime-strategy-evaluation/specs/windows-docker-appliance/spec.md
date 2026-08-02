## ADDED Requirements

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
