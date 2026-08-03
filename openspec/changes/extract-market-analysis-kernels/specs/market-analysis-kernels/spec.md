## ADDED Requirements

### Requirement: Indicator And Chan Kernels Shall Be Pure
Market analysis kernels SHALL consume validated in-memory inputs and return deterministic outputs without
accessing TypeORM, MySQL, Redis, HTTP, environment variables or Nest controllers.

#### Scenario: A kernel is invoked by an adapter
- **WHEN** the same ordered input and algorithm version are supplied
- **THEN** the kernel MUST return the same output
- **AND** it MUST perform no external I/O

#### Scenario: A strategy adapter invokes a fixed-window indicator
- **WHEN** the shared strategy catalog requests KDJ(9,3,3) from 13 ordered bars or MACD(12,26,9) from 130
  ordered bars
- **THEN** the kernel MUST calculate only from the supplied exact finite input
- **AND** it MUST NOT choose a different window, read earlier history, retain incremental state or use a persisted
  checkpoint

#### Scenario: A crossover requests adjacent indicator values
- **WHEN** the strategy adapter has 14 KDJ bars or 131 MACD bars at anchor `t`
- **THEN** it MUST invoke the pure kernel for the adjacent prior and current fixed windows
- **AND** the kernel outputs MUST NOT depend on invocation order or an earlier invocation's state

### Requirement: Applications Shall Reuse Shared Analysis Kernels
`apps/mist`, `apps/chan`, backtesting and realtime strategy evaluation SHALL use their required shared kernel
exports instead of importing another application's internal modules or duplicating algorithms. V1 strategy
evaluation SHALL consume Indicator exports only and SHALL NOT expose or compute `chan.*`.

#### Scenario: Chan computation is used from two apps
- **WHEN** both adapters compute the same analysis request
- **THEN** both MUST invoke the same Chan kernel implementation
- **AND** differential fixtures MUST show equivalent results

#### Scenario: V1 strategy fields are compiled
- **WHEN** backtest or realtime compiles the approved V1 strategy catalog
- **THEN** it MUST import the approved Indicator kernels only
- **AND** it MUST reject `chan.*` rather than invoking ChanCore with an arbitrary fixed window

### Requirement: Kernel Extraction Shall Preserve Existing Behavior
This change SHALL preserve existing Indicator outputs and Chan Phase A/Phase B semantics.

#### Scenario: Characterization fixtures are replayed
- **WHEN** old and extracted implementations receive the same valid inputs
- **THEN** outputs MUST be equivalent under the approved numeric comparison
- **AND** any intentional algorithm change MUST be deferred to another change

#### Scenario: Existing HTTP and strategy adapters supply different bounded ranges
- **WHEN** each adapter invokes the same extracted indicator kernel with its own approved ordered input
- **THEN** the kernel MUST preserve the existing calculation for each supplied array
- **AND** this extraction MUST NOT add a public Indicator lookback parameter or force HTTP requests to use the
  strategy catalog window

#### Scenario: HTTP and strategy KDJ parameters differ
- **WHEN** the existing HTTP adapter supplies `period=14` and the strategy adapter supplies KDJ(9,3,3)
- **THEN** extraction MUST preserve each caller's explicit parameter and ordered input
- **AND** it MUST NOT silently align one caller to the other

### Requirement: Kernel Contracts Shall Be Reviewed Before File Moves
Public exports, input/output types, invalid-input behavior and numeric comparison rules SHALL be approved before
the corresponding extraction task changes source files.

#### Scenario: A kernel extraction task begins
- **WHEN** its contract decision is still open
- **THEN** the task MUST pause
- **AND** the accepted decision MUST be recorded in the design
