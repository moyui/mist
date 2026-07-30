## MODIFIED Requirements

### Requirement: Child Changes Shall Remain Independently Scoped
The roadmap SHALL permit one cross-repository realtime signal change to own tightly coupled candle, paired-rule
and evaluation contracts only when it defines internal non-skippable release gates and keeps notification and
portfolio simulation separate.

#### Scenario: Realtime signal pipeline work begins
- **WHEN** the superseding realtime pipeline change is implemented
- **THEN** candle foundation, shared strategy schema and realtime evaluation MUST complete in that order
- **AND** later phases MUST remain off until prior HIL/migration gates pass

#### Scenario: Another child strategy change is created
- **WHEN** a follow-up change covers notifications or portfolio simulation
- **THEN** it MUST state separate owner repositories, runtime/data-model impact, validation and archive criteria

### Requirement: Initial Backtesting Shall Be Signal-Level
The first backtesting phase SHALL continue to replay declarative paired strategies over historical market data and
produce signal-level results, not portfolio-level execution simulation.

#### Scenario: Backtest capability is extended
- **WHEN** a future backtest child change is created
- **THEN** it MUST reuse entry/exit/lookback and exact-decimal evaluation semantics
- **AND** cash, positions, orders, fees, slippage, allocation and NAV MUST remain excluded unless a new reviewed
  portfolio-simulation change is created

## ADDED Requirements

### Requirement: Superseded realtime planning has one disposition
The old B1, portfolio implementation proposal and unstarted connect artifacts SHALL be replaced by
`build-realtime-strategy-signal-pipeline`.

#### Scenario: Active changes are listed
- **WHEN** OpenSpec status is inspected after this proposal
- **THEN** `productize-current-day-realtime-market-data` and `add-strategy-portfolio-backtesting` MUST no longer
  remain active
- **AND** full portfolio simulation MUST be recorded as deferred rather than partially implemented
