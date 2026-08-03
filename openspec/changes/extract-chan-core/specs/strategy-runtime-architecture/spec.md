## ADDED Requirements

### Requirement: Strategy Indicators And ChanCore Shall Have Separate Owners
Strategy-owned fixed-window Indicator calculations and the pure Chan derived-analysis core SHALL remain
separate capabilities rather than form one generic analysis base.

#### Scenario: Strategy evaluates KDJ or MACD
- **WHEN** Backtest or Realtime evaluates an approved Indicator field
- **THEN** both runtimes MUST reuse the calculation owned by the shared Strategy evaluator contract
- **AND** neither runtime MUST depend on ChanCore, Indicator HTTP controllers or another application's source

#### Scenario: ChanCore is extracted
- **WHEN** the pure calculation library becomes available
- **THEN** it MUST remain outside the current V1 Strategy field catalog and hot path
- **AND** its completion MUST NOT gate Backtest or Realtime Strategy runtime implementation

#### Scenario: A future strategy capability adopts Chan output
- **WHEN** a future Backtest, Realtime or Signal/Alert owning change explicitly adopts a `chan.*` field or context
- **THEN** it MAY call `@app/chancore` directly or through its own thin wrapper
- **AND** that change MUST define its own lookback, error, trigger, persistence and version evidence
