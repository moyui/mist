## ADDED Requirements

### Requirement: Signal Backtesting Shall Build Bounded Ordered Context
Signal-level backtesting SHALL evaluate each candidate time using the compiled bounded `requiredBarCount` and the same
typed analysis context used by live evaluation.

#### Scenario: A historical candidate requires prior values
- **WHEN** the backtest has sufficient ordered K evidence
- **THEN** it MUST build current and prior context deterministically
- **AND** each matching result MUST use the immutable strategy version's required signal kind
- **AND** it MUST NOT derive a second entry or exit result from the same rule
- **AND** it MUST remain signal-level without portfolio execution fields

#### Scenario: Historical replay evaluates a fixed-window indicator
- **WHEN** a backtest reaches an anchor whose execution plan references KDJ or MACD
- **THEN** it MUST supply the same exact rolling 13-bar KDJ or 130-bar MACD input used by realtime evaluation
- **AND** a crossover MUST use the two adjacent windows represented by 14 or 131 ordered bars respectively
- **AND** replay MUST NOT seed the indicator from the full requested date range or persist cross-run indicator state
