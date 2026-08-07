## ADDED Requirements

### Requirement: Backend SHALL support a mysql-free mock mode

When `MIST_MOCK_MODE=true`, the backend SHALL start without MySQL (no TypeORM root connection, no
`mysql_server_*` required) and SHALL load only the realtime chain modules (datasource WS, ingress,
candle aggregation, Redis finalization, health endpoints), omitting chan, schedule, strategy, backtest,
historical collector and indicator modules. The mock mode SHALL be expressed in a single AppModule via
conditional module expansion; it SHALL NOT introduce a second module class that must be kept in sync.

#### Scenario: Mock mode boots without MySQL

- **WHEN** `MIST_MOCK_MODE=true` and no `mysql_server_*` variables are set
- **THEN** the backend SHALL pass config validation and SHALL listen on its port
- **AND** TypeORM SHALL NOT be initialized and no database connection SHALL be attempted

#### Scenario: Realtime chain remains functional in mock mode

- **WHEN** mock mode is active with `MIST_REALTIME_REDIS_URL` set and
  `REALTIME_PRODUCTIZATION_MODE=shadow`
- **THEN** accepted snapshots SHALL aggregate into candles and seal to Redis
- **AND** `/internal/realtime/candles/status` SHALL expose the same payload shape as production

#### Scenario: Business modules are omitted in mock mode

- **WHEN** `MIST_MOCK_MODE=true`
- **THEN** chan, schedule, strategy, backtest, historical collector and indicator routes/endpoints
  SHALL NOT be registered
- **AND** the allowlist SHALL resolve from memory (empty when `TDX_REALTIME_ALLOWLIST` /
  `QMT_REALTIME_ALLOWLIST` are unset) without touching a database

#### Scenario: Mock mode is opt-in and defaults off

- **WHEN** `MIST_MOCK_MODE` is unset or not `"true"`
- **THEN** the backend SHALL behave exactly as today (MySQL required, all modules loaded)

#### Scenario: Mock mode is a single source of truth

- **WHEN** a maintainer adds or removes a module from the backend application
- **THEN** the module SHALL be declared once in the single AppModule's conditional expansion
- **AND** the mock mode SHALL automatically inherit realtime-chain additions and exclude
  business-module additions without a second module class to update

#### Scenario: Redis remains a hard dependency for candle sealing

- **WHEN** mock mode is active but `MIST_REALTIME_REDIS_URL` is empty
- **THEN** candle aggregation SHALL be short-circuited (sealed/discard stay 0)
- **AND** the candle health endpoint SHALL report degraded with `redis_unavailable`
