# strategy-signal-backtesting Specification

## MODIFIED Requirements

### Requirement: Backtests Shall Replay Strategy Versions

Mist SHALL replay a requested immutable strategy version over historical K-line
data, dispatching evaluation by the kind snapshot stored on the backtest run
(captured from the definition at run creation) — `rule_dsl` through the
compiled-rule evaluator, `chan_bsp` through the shared Chan buy/sell point
detector with exactly-once point emission.

#### Scenario: Backtest run is requested

- **WHEN** a client creates a backtest run with strategy version, target
  universe, period, source, start date, and end date
- **THEN** the backend MUST evaluate the requested strategy version against
  historical K-line records in the requested range
- **AND** it MUST use the same rule evaluator semantics as live scans,
  including kind dispatch

#### Scenario: A chan_bsp run is replayed

- **WHEN** a client requests a run for a `chan_bsp` strategy version
- **THEN** the backend MUST evaluate structural point events through the
  shared `ChanBspDetector` over the imputed window
- **AND** each confirmed point MUST be persisted exactly once as a
  `BacktestSignalResult` with its structural context

#### Scenario: A rule_dsl run is replayed

- **WHEN** a client requests a run for a `rule_dsl` strategy version
- **THEN** the backend MUST keep the existing compiled-rule evaluation path
  unchanged