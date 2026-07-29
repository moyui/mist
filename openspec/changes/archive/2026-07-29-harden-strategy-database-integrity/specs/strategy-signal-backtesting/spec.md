## MODIFIED Requirements

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

## ADDED Requirements

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
