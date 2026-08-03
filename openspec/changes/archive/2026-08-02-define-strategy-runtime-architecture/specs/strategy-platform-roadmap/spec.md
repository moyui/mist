## ADDED Requirements

### Requirement: Realtime Strategy Delivery Shall Use Focused Child Changes
The roadmap SHALL deliver current-day candles, analysis kernels, strategy evaluation contracts, realtime
evaluation and notification delivery through separately reviewable child changes.

#### Scenario: Realtime strategy work is scheduled
- **WHEN** implementation ordering is prepared
- **THEN** candle, analysis, contract, evaluation and notification work MUST retain separate ownership and archive criteria
- **AND** a downstream change MUST NOT begin before its declared prerequisite gates pass

#### Scenario: Shared strategy contracts and runtime adapters are scheduled
- **WHEN** Backtest and realtime Signal implementation are planned
- **THEN** `evolve-strategy-evaluation-contract` MUST first establish the common StrategyBar, market-data port,
  evaluator and context contracts
- **AND** `extract-backtest-runtime` MAY then implement its replay adapter independently
- **AND** `run-realtime-strategy-evaluation` MAY then implement its realtime adapters after the candle gate also passes
- **AND** neither runtime change MUST be a prerequisite of the other

### Requirement: Service Boundary Standardization Shall Precede Runtime RPC
The roadmap SHALL complete `standardize-service-boundary-contracts` before connecting Backtest or Signal
runtime RPC handlers.

#### Scenario: A runtime child change reaches RPC implementation
- **WHEN** `extract-backtest-runtime` or `run-realtime-strategy-evaluation` is ready to add product code
- **THEN** the shared HTTP/RPC transport change MUST have passed its acceptance gates
- **AND** the runtime change MUST define only its domain-specific pattern, payload and error codes

### Requirement: Backtest Runtime Extraction Shall Remain Independently Scoped
The roadmap SHALL use `extract-backtest-runtime` for moving historical replay into `apps/backtest`, separate
from realtime evaluation and portfolio simulation.

#### Scenario: Backtest execution is moved out of the public API process
- **WHEN** the runtime extraction is implemented
- **THEN** it MUST depend on the approved shared analysis and evaluation contracts
- **AND** it MUST retain independent validation and archive criteria

## REMOVED Requirements

### Requirement: Schedule App Shall Only Run Strategy Jobs
**Reason**: `apps/schedule` is not deployed in the current appliance and its future responsibility is explicitly
deferred; realtime evaluation requires an event-driven worker rather than the legacy collection cron.

**Migration**: Keep `apps/schedule` disabled and unchanged. A future schedule responsibility requires a new
focused change; realtime evaluation is owned by `run-realtime-strategy-evaluation`.
