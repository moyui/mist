## ADDED Requirements

### Requirement: Strategy Indicators And ChanCore Shall Have Separate Owners
Strategy-owned fixed-window Indicator calculations and the public Chan derived-analysis core SHALL remain
separate capabilities rather than form one generic analysis base.

#### Scenario: Strategy evaluates KDJ or MACD
- **WHEN** Backtest or Realtime evaluates an approved Indicator field
- **THEN** both runtimes MUST reuse the calculation owned by the shared Strategy evaluator contract
- **AND** neither runtime MUST depend on ChanCore, Indicator HTTP controllers or another application's source

#### Scenario: ChanCore is extracted
- **WHEN** the Chan application invokes its pure calculation library
- **THEN** that library MUST remain outside the V1 Strategy field catalog and hot path
- **AND** its completion MUST NOT gate Backtest or Realtime Strategy runtime implementation
