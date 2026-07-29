> **延期状态**：本 delta 只保存未来评审候选，不授权当前实现。只有项目负责人重新明确授权并
> 复核当时基线后，以下 requirement 才能进入实施。

## MODIFIED Requirements

### Requirement: Docker compose runs production Mist services

The system SHALL provide a production Docker Compose deployment for the Windows API machine that runs MySQL, Redis, `apps/mist`, `apps/chan`, `apps/schedule`, `mist-fe`, and the nginx web gateway, with schedule mutation disabled by default.

#### Scenario: Production compose starts required services

- **WHEN** the operator starts the production Docker Compose stack on the Windows API machine
- **THEN** the stack starts MySQL, Redis, `mist-backend`, `chan-api`, `mist-schedule`, `mist-fe`, and `web-gateway`
- **AND** `mist-backend` exposes port `8001`
- **AND** `chan-api` exposes port `8008`
- **AND** `web-gateway` exposes the configured browser entrypoint port
- **AND** `mist-schedule` exposes only an internal health endpoint

#### Scenario: Schedule starts fail-closed

- **WHEN** the default production Compose stack starts without an explicit sync enable
- **THEN** `apps/schedule` MUST run with `HISTORICAL_SYNC_ENABLED=false`
- **AND** no automatic historical write or Redis cleanup may occur

#### Scenario: Schedule image is promoted

- **WHEN** backend and schedule are released
- **THEN** both MUST use the same verified Mist image with separate commands
- **AND** schedule startup and health MUST depend on MySQL, `mist-realtime-redis` through `MIST_REALTIME_REDIS_URL`, and required datasource readiness
- **AND** this change MUST NOT deploy or connect an unused BullMQ/`mist-queue-redis` service

### Requirement: Schedule supports manual verification and flag-only rollback

The Windows appliance SHALL provide an internal, scoped manual verification workflow and a rollback that preserves database and Redis state.

#### Scenario: Operator performs production shadow verification

- **WHEN** the operator invokes the documented manual workflow for a trading day, source, and security
- **THEN** the workflow MUST support dry-run evidence without public schedule ports

#### Scenario: Operator rolls historical sync back

- **WHEN** an operator sets `HISTORICAL_SYNC_ENABLED=false` and rolls back the image
- **THEN** no migration or Redis volume deletion may occur
- **AND** TDX/QMT realtime transport modes MUST remain unchanged
