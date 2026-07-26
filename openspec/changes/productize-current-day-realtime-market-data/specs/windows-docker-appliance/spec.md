## ADDED Requirements

### Requirement: Production compose provides physically isolated persistent market-data Redis

The Windows Docker appliance SHALL run a persistent `mist-realtime-redis` service for current-day realtime product state without exposing Redis publicly, and SHALL NOT deploy a BullMQ Redis service in this change.

#### Scenario: Redis service starts

- **WHEN** the production Compose stack is deployed with productization flags still off
- **THEN** Redis MUST start with health checking, AOF persistence, and a named or configured persistent volume
- **AND** backend connectivity MUST use `MIST_REALTIME_REDIS_URL` on the internal Compose network
- **AND** no Redis port may be published to the host by default
- **AND** no unused `mist-queue-redis`, `MIST_QUEUE_REDIS_URL`, or queue volume may be created

#### Scenario: A future BullMQ change is introduced

- **WHEN** notification jobs later require BullMQ
- **THEN** that change MUST deploy a physically separate `mist-queue-redis` service and volume using `MIST_QUEUE_REDIS_URL`
- **AND** market-data and queue Redis MUST NOT share only a logical database number, volume, cleanup command, eviction policy, or capacity budget

#### Scenario: Productization is rolled back

- **WHEN** an operator disables `REALTIME_PRODUCTIZATION_MODE` or rolls back the application image
- **THEN** no MySQL rollback or migration may run
- **AND** the Redis volume MUST be retained
- **AND** TDX/QMT transport modes MUST remain independently configured

### Requirement: Realtime productization deploys one backend writer

The Windows Docker appliance SHALL run exactly one `mist-backend` realtime product writer while productization mode is `shadow` or `on`.

#### Scenario: Productization config is validated

- **WHEN** deployment enables `REALTIME_PRODUCTIZATION_MODE=shadow` or `on`
- **THEN** config validation MUST reject a backend replica count greater than one
- **AND** each desired allowlist entry MUST match the initialized effective source and provider symbol for its canonical security
- **AND** a non-effective source allowlist entry MUST NOT create a second desired subscription

#### Scenario: Productization is promoted from shadow to on

- **WHEN** deployment enables `REALTIME_PRODUCTIZATION_MODE=on`
- **THEN** every enabled source MUST provide an explicit candle grace and calibration evidence identifier
- **AND** deployment MUST provide closed-record and closing-snapshot byte limits, maximum subscribed securities, Redis memory/AOF limits, minimum disk free, and an accepted capacity calibration identifier
- **AND** config validation MUST fail closed when any required value is absent or invalid
- **AND** the release record MUST preserve selected grace, lateness/capacity calibration identifiers, capacity ceilings, image SHA, and monitoring artifact

#### Scenario: Shadow begins

- **WHEN** deployment enables `REALTIME_PRODUCTIZATION_MODE=shadow`
- **THEN** the compatible backend and monitoring artifacts MUST already be running
- **AND** lateness, candidate grace miss, discard/recovery, record bytes, subscribed count, Redis memory, AOF growth/rewrite, disk headroom, structured-log, and product health signals MUST be verified before collecting promotion evidence

#### Scenario: Product backend image is upgraded

- **WHEN** an enabled realtime product backend is replaced
- **THEN** deployment MUST stop the old writer before starting the new writer
- **AND** the new writer MUST recover due/closed/watermark state and mark unrecoverable open buckets discarded before exposing current-day product queries
