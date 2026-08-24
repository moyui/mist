## ADDED Requirements

### Requirement: Backtest Runtime Capacity And Failures Shall Be Observable
Monitoring SHALL expose bounded backtest command, execution, resource, persistence and failure observations
using stable low-cardinality dimensions.

#### Scenario: Backtest work is queued or executing
- **WHEN** monitoring collects the `backtest` service
- **THEN** it MUST expose approved waiting depth, configured queue capacity, running, age, duration and failure
  observations
- **AND** it MUST distinguish service health from individual run success or failure

#### Scenario: Result batches are persisted
- **WHEN** the runner flushes a full or remainder `BacktestSignalResult` batch
- **THEN** monitoring MUST expose low-cardinality batch count, row count, duration and failure observations
- **AND** it MUST NOT use runId, batch size or individual result identity as labels

#### Scenario: TCP trigger or startup reconciliation fails
- **WHEN** normal dispatch, bounded queue acceptance or one-time startup reconciliation fails
- **THEN** monitoring MUST expose a stable low-cardinality failure class
- **AND** queue-capacity rejection MUST be observable as the stable `queue_full` class
- **AND** startup overflow MUST be observable as the stable `BACKTEST_STARTUP_QUEUE_FULL` class
- **AND** command timeout MUST be observable without using the configured millisecond value as a metric label
- **AND** HTTP `429`, HTTP `503` and lost-ACK readback success MUST remain distinguishable
- **AND** it MUST NOT report periodic polling as the normal trigger path

#### Scenario: Startup reconciliation is incomplete
- **WHEN** the `backtest` process is alive but startup reconciliation has not completed
- **THEN** monitoring MUST distinguish process liveness from `backtest.ready=false`
- **AND** it MUST NOT report the execution runtime as ready

#### Scenario: API startup compensation observes Backtest unavailable
- **WHEN** the single bounded startup health check cannot confirm `backtest.ready=true`
- **THEN** monitoring MUST distinguish `BACKTEST_STARTUP_UNAVAILABLE` from
  `BACKTEST_STARTUP_QUEUE_FULL` and ordinary TCP command timeout
- **AND** it MUST expose one-check outcome and conditionally failed-run count with low-cardinality labels
- **AND** it MUST NOT report a readiness polling or retry loop

#### Scenario: Backtest health contract is collected
- **WHEN** monitoring probes `http://backtest:8004/health` on the Compose service network
- **THEN** it MUST validate root `status`, scoped `backtest.ready/state` and finite non-negative capacity counts
- **AND** it MUST expose liveness and readiness separately
- **AND** it MUST NOT use runId, securityCode, queue depth or configured numeric values as metric labels
- **AND** queue full or an individual run failure MUST remain an operational observation rather than make the
  process probe fail
