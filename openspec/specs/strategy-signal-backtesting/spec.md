## Purpose

Signal-level strategy backtesting replays immutable strategy versions over
historical K-line data, persists historical signal matches, and exposes
aggregate signal statistics without modeling portfolio execution.
## Requirements
### Requirement: Backtests Shall Replay Strategy Versions

Mist SHALL replay a requested immutable strategy version over historical K-line
data.

#### Scenario: Backtest run is requested

- **WHEN** a client creates a backtest run with strategy version, target
  universe, period, source, start date, and end date
- **THEN** the backend MUST evaluate the requested strategy version against
  historical K-line records in the requested range
- **AND** it MUST use the same rule evaluator semantics as live scans

### Requirement: Backtest Matches Shall Be Persisted As Signal Results

Backtests SHALL persist one signal-level result row for each strategy match,
while the owning `BacktestRun` remains the single source of truth for strategy
definition, strategy version, period, and source.

#### Scenario: Historical K-line matches

- **WHEN** a historical K-line context matches the strategy rule
- **THEN** the backend MUST persist a `BacktestSignalResult`
- **AND** the result MUST include backtest run, security code, signal time,
  context snapshot, and rule snapshot
- **AND** the result MUST NOT duplicate strategy definition, strategy version,
  period, or source columns owned by the run

#### Scenario: Backtest results are displayed

- **WHEN** a client displays a backtest result period or source
- **THEN** it MUST use the owning `BacktestRun` values
- **AND** it MUST NOT expect duplicate result-row fields

### Requirement: Backtest Runs Shall Report Aggregate Signal Statistics

Backtest runs SHALL expose aggregate signal-level statistics after replay.

#### Scenario: Backtest completes

- **WHEN** historical replay completes successfully
- **THEN** the backend MUST mark the run completed
- **AND** it MUST set signal count and matched security count
- **AND** it MUST set started and completed timestamps

### Requirement: Backtests Shall Exclude Portfolio Simulation

Signal-level backtests SHALL NOT include portfolio-level execution semantics.

#### Scenario: Backtest response is inspected

- **WHEN** a backtest run is returned
- **THEN** it MUST NOT require or populate cash, positions, orders, fills, fees,
  slippage, allocation, equity curve, or portfolio return fields

### Requirement: Backtest Failure Shall Be Recorded

Backtest execution errors SHALL be recorded on the run.

#### Scenario: Replay fails

- **WHEN** the backend cannot complete a requested replay
- **THEN** it MUST mark the run failed
- **AND** it MUST store an error message on the run

### Requirement: Backtest Signal Result Identity Is Idempotent

One strategy backtest run SHALL persist at most one result for the same security
and signal time.

#### Scenario: A duplicate result identity is inserted

- **WHEN** two result rows have the same backtest run, security code, and signal
  time
- **THEN** the database MUST reject the duplicate identity

#### Scenario: Multiple strategies match the same market event

- **WHEN** multiple strategy versions match the same security and signal time
- **THEN** each strategy MUST use a distinct `BacktestRun`
- **AND** each run MAY persist its own result

### Requirement: Backtest Signal Results Preserve Complete Evidence

Every persisted backtest signal result SHALL contain non-null context and rule
snapshots.

#### Scenario: A backtest result lacks snapshot evidence

- **WHEN** a writer attempts to persist a result with a null context or rule
  snapshot
- **THEN** persistence MUST fail
