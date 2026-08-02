# strategy-runtime-architecture Specification

## Purpose
TBD - created by archiving change define-strategy-runtime-architecture. Update Purpose after archive.
## Requirements
### Requirement: Strategy Runtime Responsibilities Shall Have Single Owners
Mist SHALL assign market state, analysis kernels, strategy control APIs, realtime evaluation, signal persistence
and notification delivery to explicit non-overlapping owners.

#### Scenario: A new strategy feature is proposed
- **WHEN** a child change adds behavior to the strategy pipeline
- **THEN** it MUST name the owning module and runtime process
- **AND** it MUST NOT assign the same state transition to two applications

### Requirement: Runtime Dependencies Shall Flow From Market To Delivery
Market and analysis layers MUST NOT depend on strategy or notification layers, and notification adapters MUST
NOT execute strategy rules.

#### Scenario: Internal module dependencies are reviewed
- **WHEN** an analysis, strategy or notification module is introduced
- **THEN** its dependency direction MUST follow market context to analysis to strategy to persisted event to delivery
- **AND** provider-native APIs MUST NOT be called from strategy or notification code

### Requirement: Strategy Market Data Shall Use One Internal Capability Contract
Mist SHALL define one internal `StrategyMarketDataPort` contract and canonical `StrategyBar` for bounded
historical replay, realtime window hydration and realtime observation resolution without exposing a public
unified K API.

#### Scenario: The common market-data contract is owned
- **WHEN** strategy libraries and runtime adapters are reviewed
- **THEN** `evolve-strategy-evaluation-contract` MUST own canonical `StrategyBar`, `StrategyMarketDataPort`
  and their criteria/result domain types
- **AND** `extract-backtest-runtime` MUST implement only the MySQL replay adapter
- **AND** `run-realtime-strategy-evaluation` MUST implement only the MySQL/Redis/memory realtime adapters
- **AND** Backtest and Signal MUST NOT depend on each other or redefine the common contract

#### Scenario: Canonical bars expose completeness through one shape
- **WHEN** a historical, sealed realtime or derived-period K is mapped into `StrategyBar`
- **THEN** it MUST carry required `type='complete'|'incomplete'`
- **AND** incomplete bars MUST use the same canonical fields and consumer contract as complete bars
- **AND** the contract MUST NOT add a second incomplete-result type or redundant `isComplete` flag

#### Scenario: The backtest application reads historical bars
- **WHEN** `apps/backtest` replays one security, source, period and time range
- **THEN** it MUST use the shared replay-page capability
- **AND** it MUST NOT require market Redis or a realtime observation dependency

#### Scenario: The signal application prepares realtime context
- **WHEN** `apps/signal` starts with an empty window or increases compiled `requiredBarCount`
- **THEN** it MUST use the shared realtime-window capability
- **AND** its implementation MAY combine MySQL historical K, pre-anchor Redis sealed 1m K and signal-owned
  memory state
- **AND** higher current-day periods MUST be rebuilt from sealed 1m rather than read as if Redis stored them
- **AND** the current anchor observation MUST be processed exactly once after hydration
- **AND** a missing realtime bar MUST remain missing rather than trigger an automatic repair read

#### Scenario: A realtime market change is resolved
- **WHEN** `apps/signal` consumes an approved market trigger
- **THEN** it MUST use the realtime-observation capability
- **AND** V1 MUST accept only sealed-bar observations
- **AND** it MUST NOT expose a snapshot-update or provisional-observation branch
- **AND** any future snapshot capability MUST require a separate focused change and MUST NOT be presented to
  backtest as a closed historical K

#### Scenario: Internal market-data types are named
- **WHEN** the port declares read inputs and results
- **THEN** HTTP query-string models MUST use `*QueryDto`
- **AND** internal read-selection inputs MUST use `*Criteria`
- **AND** internal results MUST use domain names such as `*Page`, `*Window` or `*Observation` rather than HTTP
  `*Vo`

### Requirement: Module Boundaries Shall Precede Repository Splits
Mist SHALL extract reusable domain and analysis logic into same-repository libraries before considering a
separate strategy, analysis or notification repository.

#### Scenario: A reusable computation is needed by multiple apps
- **WHEN** `apps/mist`, `apps/chan` or `apps/signal` needs the same computation
- **THEN** the computation MUST be provided by a shared pure library
- **AND** one application MUST NOT import another application's internal source module

### Requirement: New Runtime Apps Shall Share The Approved Service Boundary
Mist SHALL standardize public HTTP and internal NestJS request-response primitives before connecting
`apps/backtest` or `apps/signal`.

#### Scenario: A runtime app adds an internal RPC
- **WHEN** `apps/mist`, `apps/backtest` or `apps/signal` sends or handles a request-response command
- **THEN** it MUST use the approved `libs/transport/rpc` envelope
- **AND** it MUST carry the required correlation identity
- **AND** its business payload and error codes MUST remain domain-owned

#### Scenario: An application exposes a public HTTP response
- **WHEN** `apps/mist` or `apps/chan` returns a public response
- **THEN** it MUST use the approved `libs/transport/http` boundary
- **AND** it MUST NOT import another application's HTTP implementation

### Requirement: Signal Evaluation Shall Use The Signal Application Boundary
Mist SHALL use the Nest project `signal` at `apps/signal` for trigger consumption, realtime context,
evaluation and signal-persistence orchestration, while public strategy APIs remain in `apps/mist`.

#### Scenario: The signal application is wired
- **WHEN** `apps/signal` is built or started
- **THEN** its root module MUST be `SignalAppModule`
- **AND** it MUST expose only internal health or diagnostics rather than public strategy business APIs
- **AND** one Hybrid Nest application MUST host its internal HTTP listener, TCP request-response microservice
  and BullMQ worker
- **AND** those ingress paths MUST share one registry, window and analysis-state owner
- **AND** the web gateway MUST NOT expose a public signal application route
- **AND** its MySQL pool MUST use the shared Nest `TypeOrmModule.forRootAsync()` bootstrap pattern
- **AND** its TCP request-response boundary MUST serve approved control-plane commands such as registry refresh,
  not manual strategy execution
- **AND** it MUST NOT add a custom `mysqlReady` lifecycle state

### Requirement: Signal Application Shall Be The Sole Live Signal Writer
`apps/signal` SHALL be the only runtime application that evaluates and persists realtime live
`StrategySignal` and linked PENDING `StrategyAlertEvent` records.

#### Scenario: An operator manually executes a strategy
- **WHEN** the operator requests execution outside the realtime market-trigger path
- **THEN** `apps/mist` MUST create and submit a backtest run through the Backtest boundary
- **AND** neither `apps/mist` nor `apps/backtest` MAY create live Signal or AlertEvent records
- **AND** the legacy `/v1/strategy-scans/run` path MUST NOT be migrated into `apps/signal`

#### Scenario: A realtime market trigger matches
- **WHEN** the approved evaluation creates a live candidate
- **THEN** `apps/signal` MUST own the atomic Signal and PENDING AlertEvent write

### Requirement: Historical Backtesting Shall Use The Backtest Application Boundary
Mist SHALL use the Nest project `backtest` at `apps/backtest` for historical reading, bounded context,
execution, run progression and result persistence, while public backtest APIs remain in `apps/mist`.

#### Scenario: The backtest application is wired
- **WHEN** `apps/backtest` is built or started
- **THEN** its root module MUST be `BacktestAppModule`
- **AND** it MUST expose only internal health or diagnostics rather than public strategy business APIs

#### Scenario: Mist performs Backtest startup compensation
- **WHEN** `apps/mist` starts and performs its one startup compensation pass
- **THEN** it MUST make exactly one health request with the approved three-second timeout
- **AND** it MUST NOT wait, poll or retry when Backtest is unreachable, invalid or not ready
- **AND** only a contract-valid `ready=true` response MAY cause each eligible PENDING run to be resubmitted once
- **AND** all other outcomes MUST use the approved cutoff-scoped conditional failure rule
- **AND** compensation MUST NOT block unrelated public APIs, market ingress or realtime Signal startup

#### Scenario: A public backtest is requested
- **WHEN** `apps/mist` accepts and validates the request
- **THEN** historical execution MUST be delegated through the approved boundary
- **AND** `apps/mist` MUST NOT execute the historical replay in its request process
- **AND** after durable registration and command acceptance it MUST return `202 Accepted` with the run
  identity and query location rather than wait for replay
- **AND** the internal request and result MUST use the shared RPC envelope rather than a Backtest-only envelope

#### Scenario: A public backtest command cannot be handed off
- **WHEN** the bounded queue, readiness, connection or response timeout prevents confirmed acceptance
- **THEN** `apps/mist` MUST apply the approved conditional failure and `429/503` mapping
- **AND** a timeout readback that proves RUNNING or COMPLETED MUST return `202` rather than overwrite the run

### Requirement: Unconfirmed Implementation Details Shall Be Reviewed Before Coding
Each child change SHALL record and obtain project-owner approval for its unresolved provider, schema, queue,
recovery, compatibility, deployment and HIL decisions before implementing those decisions.

#### Scenario: An implementation task reaches an unresolved decision
- **WHEN** the relevant design still lists that decision as open
- **THEN** implementation MUST pause
- **AND** the accepted decision MUST be written back to the change artifacts before code is changed
