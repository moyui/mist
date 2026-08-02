## ADDED Requirements

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
