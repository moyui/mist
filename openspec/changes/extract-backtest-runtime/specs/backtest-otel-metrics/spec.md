# Specification: backtest-otel-metrics

## ADDED Requirements

### Requirement: Backtest runtime metrics are exported as OTel gauges

The backtest service SHALL export its runtime state as OTel observable gauges
reading process-local state (readiness, admission, command outcomes, run
status, duration, persistence, failure reasons, target issues). Registration
SHALL happen once after telemetry initialization and SHALL be idempotent.

#### Scenario: Readiness and admission load are observable

- **WHEN** the metric reader collects
- **THEN** `mist_backtest_ready` MUST report 1 when the admission window is open
  and 0 otherwise
- **AND** `mist_backtest_active_runs` / `mist_backtest_waiting_runs` MUST report
  the current admission counts
- **AND** `mist_backtest_capacity_total` MUST report the configured queue
  capacity

#### Scenario: Command outcomes are observable

- **WHEN** the metric reader collects
- **THEN** `mist_backtest_command_total{outcome}` MUST report cumulative command
  outcomes with the bounded outcomes `accepted`, `queue_full`, `not_ready`,
  `run_failed`

#### Scenario: Run statuses and duration are observable

- **WHEN** the metric reader collects
- **THEN** `mist_backtest_run_total{status}` MUST report cumulative completed and
  failed runs
- **AND** `mist_backtest_duration_seconds` MUST report the last run duration,
  and MUST NOT emit a data point when no run has completed

#### Scenario: Persistence and failure outcomes are observable

- **WHEN** the metric reader collects
- **THEN** `mist_backtest_persistence_total{outcome}` MUST report cumulative
  successful and failed result batches
- **AND** `mist_backtest_failure_total{reason}` MUST report cumulative run
  failures per bounded reason class

#### Scenario: Target issues are observable

- **WHEN** the metric reader collects
- **THEN** `mist_backtest_target_issue_total` MUST report cumulative target
  issues per bounded code (`SECURITY_NOT_FOUND`, `NO_HISTORICAL_BARS`)

### Requirement: Startup compensation outcome is observable

The mist backend SHALL export the startup strategy-trigger compensation outcome
as `mist_startup_compensation_total{outcome}` with the bounded outcomes
`not_enabled`, `completed`, `failed`, observed as a one-shot outcome marker
(value 1 under the current outcome).

#### Scenario: Compensation outcome is reported

- **WHEN** the metric reader collects
- **THEN** `mist_startup_compensation_total` MUST report value 1 with the
  `outcome` attribute set to the current compensation outcome

### Requirement: Backtest judgment points are logged

Every backtest admission, execution, persistence, startup-reconciliation and
target-issue judgment point SHALL emit a structured log line carrying the
active trace context: info for lifecycle events (command accepted, run
completed, startup reconciled), warn for rejections and data-quality judgment
points (command rejected, target issue), error for failures (run failed,
persistence batch failed, startup failure). The mist startup compensation
SHALL log its outcome (info when completed, error when failed). Log
`reason`/`code`/`kind` fields SHALL be bounded enums; run IDs and security
codes MAY appear as log fields for debugging but MUST NOT appear as metric
labels.

#### Scenario: Command rejection is logged

- **WHEN** a command is rejected (`queue_full`, `not_ready`, `run_failed`)
- **THEN** a warn log MUST be emitted with the bounded reason and the run ID

#### Scenario: Run lifecycle is logged

- **WHEN** a run completes
- **THEN** an info log MUST be emitted with the run ID and duration
- **WHEN** a run fails
- **THEN** a warn log MUST be emitted with the bounded failure class and the
  run ID

#### Scenario: Persistence and startup failures are logged

- **WHEN** a result batch flush fails
- **THEN** a warn log MUST be emitted
- **WHEN** startup reconciliation overflows or the service is unavailable
- **THEN** a warn log MUST be emitted with the bounded kind and count

#### Scenario: Target issues are logged

- **WHEN** a target issue is recorded
- **THEN** a warn log MUST be emitted with the bounded code and the security
  code

#### Scenario: Startup compensation outcome is logged

- **WHEN** the startup compensation completes
- **THEN** an info log MUST be emitted with the submitted count
- **WHEN** the startup compensation fails
- **THEN** an error log MUST be emitted with the submitted count

### Requirement: Metric labels are low cardinality

All metrics SHALL use bounded enumeration labels only. Run IDs, security codes,
and security IDs MUST NOT appear as metric labels.

#### Scenario: Label values are bounded

- **WHEN** a metric is recorded
- **THEN** every label value MUST come from its documented bounded enum
- **AND** no run, security, or identity identifier MAY be used as a label value
