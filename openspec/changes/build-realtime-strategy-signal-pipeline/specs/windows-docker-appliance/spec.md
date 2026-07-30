## ADDED Requirements

### Requirement: Market and queue Redis are physically isolated
The Windows Docker appliance SHALL run `mist-realtime-redis` and `mist-queue-redis` as distinct services with
distinct persistent bind mounts, connections, health and capacity policies and no host public ports.

#### Scenario: Compose configuration is rendered
- **WHEN** the production stack is validated
- **THEN** backend MUST receive different `MIST_REALTIME_REDIS_URL` and `MIST_QUEUE_REDIS_URL` endpoints
- **AND** the two services MUST NOT share a volume, Redis database selection, cleanup or memory policy

#### Scenario: Strategy mode is off
- **WHEN** the default production environment is rendered
- **THEN** `REALTIME_PRODUCTIZATION_MODE` and `REALTIME_STRATEGY_MODE` MUST default to off
- **AND** rollback MUST preserve both volumes and existing Signal/AlertEvent rows

### Requirement: Realtime pipeline deploys in dependency order
Deployment SHALL start/verify market Redis before candle-enabled backend and queue Redis before strategy-enabled
backend, with promotion controlled independently from transport.

#### Scenario: Matching-version deployment runs
- **WHEN** a realtime pipeline image set is deployed
- **THEN** schema preflight/migration, Redis health, backend health and monitoring checks MUST complete in the
  documented order
- **AND** no workflow may silently enable shadow or on
