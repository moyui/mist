## ADDED Requirements

### Requirement: Chan Extraction Shall Not Gate Strategy Runtime Delivery
The roadmap SHALL treat ChanCore extraction and Strategy-owned Indicator evaluation as independent workstreams.

#### Scenario: Backtest or Realtime prerequisites are evaluated
- **WHEN** implementation gates are checked
- **THEN** `evolve-strategy-evaluation-contract` MUST own the shared Strategy Indicator calculation contract
- **AND** `extract-chan-core` MUST NOT be a prerequisite unless that runtime explicitly adopts a future approved
  `chan.*` field
