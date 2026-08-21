# mock-realtime-mode Specification

## Purpose
Define the backend mysql-free mock mode (MIST_MOCK_MODE): single AppModule conditional expansion loading only the realtime chain, env-allowlist-driven real subscriptions, optional clock offset, opt-in default off and Redis as hard sealing dependency.
## Requirements
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

#### Scenario: Mock mode drives real subscriptions from the env allowlist

- **WHEN** `MIST_MOCK_MODE=true` and `TDX_REALTIME_ALLOWLIST` / `QMT_REALTIME_ALLOWLIST`
  contain formatCodes
- **THEN** the allowlist SHALL resolve those formatCodes from memory with a stable
  placeholder securityId (no database lookup, regardless of
  `REALTIME_SUBSCRIPTION_LIFECYCLE_MODE`)
- **AND** after the realtime WS transport becomes ready, the backend SHALL issue a real
  `sync_subscriptions` for those formatCodes over the transport (the same mechanism the
  lifecycle coordinator uses in production) so the datasource delivers frames for them
- **AND** subscriptions SHALL NOT be simulated in any other way: no fake terminal,
  convergence or desired-management logic runs inside the backend

#### Scenario: Mock mode MAY shift the backend clock forward

- **WHEN** `MIST_MOCK_MODE=true` and `MIST_MOCK_CLOCK_OFFSET_MS` is a positive integer
- **THEN** the injected `Clock` SHALL report `Date.now() + offset` so that wall-clock-driven
  logic (due admission, finalization cutoff, vwap consistency checks, relative TTL) advances
  naturally while the host stays in real time
- **AND** when `MIST_MOCK_CLOCK_OFFSET_MS` is unset or `0`, or mock mode is inactive,
  the `Clock` SHALL report real wall-clock time (zero regression)

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
