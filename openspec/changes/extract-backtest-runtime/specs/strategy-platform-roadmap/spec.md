## ADDED Requirements

### Requirement: Backtest Runtime Extraction Shall Be A Focused Child Change
The roadmap SHALL treat extraction of signal-level backtest execution as an independently reviewable change
that shares evaluation contracts but remains separate from realtime evaluation and portfolio simulation.

#### Scenario: Backtest runtime work begins
- **WHEN** implementation is proposed for `apps/backtest`
- **THEN** it MUST be governed by `extract-backtest-runtime` or a superseding focused change
- **AND** it MUST NOT be bundled into realtime signal delivery or portfolio simulation work
