## Purpose

Signal-level strategy backtesting replays immutable strategy versions over
historical K-line data, persists historical signal matches, and exposes
aggregate signal statistics without modeling portfolio execution.
## Requirements
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

### Requirement: Backtest Matches Shall Be Persisted As Signal Results

Backtests SHALL persist one signal-level result row for each strategy match,
while the owning `BacktestRun` remains the single source of truth for strategy
definition, strategy version, period, and source.

#### Scenario: Historical K-line matches

- **WHEN** a historical K-line context matches the strategy rule
- **THEN** the backend MUST persist a `BacktestSignalResult`
- **AND** the result MUST include backtest run, security code, signal time,
  context snapshot, and rule snapshot
- **AND** the result MUST NOT duplicate strategy definition, strategy version,
  period, or source columns owned by the run

#### Scenario: Backtest results are displayed

- **WHEN** a client displays a backtest result period or source
- **THEN** it MUST use the owning `BacktestRun` values
- **AND** it MUST NOT expect duplicate result-row fields

### Requirement: Backtest Runs Shall Report Aggregate Signal Statistics

Backtest runs SHALL expose aggregate signal-level statistics after replay.

#### Scenario: Backtest completes

- **WHEN** historical replay completes successfully
- **THEN** the backend MUST mark the run completed
- **AND** it MUST set signal count and matched security count
- **AND** it MUST set started and completed timestamps

### Requirement: Backtests Shall Exclude Portfolio Simulation

Signal-level backtests SHALL NOT include portfolio-level execution semantics.

#### Scenario: Backtest response is inspected

- **WHEN** a backtest run is returned
- **THEN** it MUST NOT require or populate cash, positions, orders, fills, fees,
  slippage, allocation, equity curve, or portfolio return fields

### Requirement: Backtest Failure Shall Be Recorded

Backtest execution errors SHALL be recorded on the run.

#### Scenario: Replay fails

- **WHEN** the backend cannot complete a requested replay
- **THEN** it MUST mark the run failed
- **AND** it MUST store an error message on the run

### Requirement: Backtest Signal Result Identity Is Idempotent

One strategy backtest run SHALL persist at most one result for the same security
and signal time.

#### Scenario: A duplicate result identity is inserted

- **WHEN** two result rows have the same backtest run, security code, and signal
  time
- **THEN** the database MUST reject the duplicate identity

#### Scenario: Multiple strategies match the same market event

- **WHEN** multiple strategy versions match the same security and signal time
- **THEN** each strategy MUST use a distinct `BacktestRun`
- **AND** each run MAY persist its own result

### Requirement: Backtest Signal Results Preserve Complete Evidence

Every persisted backtest signal result SHALL contain non-null context and rule
snapshots.

#### Scenario: A backtest result lacks snapshot evidence

- **WHEN** a writer attempts to persist a result with a null context or rule
  snapshot
- **THEN** persistence MUST fail

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

### Requirement: Signal Backtests Shall Execute Outside The Public API Process
Historical signal replay and `BacktestSignalResult` persistence SHALL execute in `apps/backtest`, while
`apps/mist` SHALL retain the public request and query endpoints.

#### Scenario: Historical replay begins
- **WHEN** a validated backtest command becomes executable
- **THEN** `apps/backtest` MUST perform the replay
- **AND** the `apps/mist` request process MUST NOT load and evaluate the historical range directly

### Requirement: Signal Backtest Creation Shall Be Asynchronous
Creating a signal backtest SHALL only register and submit the run; progress and results SHALL remain query
resources.

#### Scenario: A signal backtest run is submitted
- **WHEN** the PENDING run has been committed and its TCP command is accepted
- **THEN** `POST /v1/strategy-backtests` MUST return `202 Accepted`
- **AND** it MUST return `BacktestRunReceiptVo` with the created `runId`, literal
  `initialStatus=PENDING` and run-resource `Location`
- **AND** it MUST NOT wait for historical replay or return signal results

#### Scenario: A created signal backtest cannot be handed off
- **WHEN** queue capacity, backtest readiness, connection failure or a still-PENDING timeout prevents command
  acceptance
- **THEN** the run MUST be conditionally marked FAILED
- **AND** the API MUST return the approved `429` or `503` mapping with `runId` and run-resource `Location`
- **AND** a lost TCP response MUST still return `202` when readback proves the run is RUNNING or COMPLETED

#### Scenario: Signal backtest persistence fails unexpectedly
- **WHEN** creation or query encounters a non-target database error
- **THEN** the API MUST return the approved safe `500` database failure
- **AND** it MUST NOT report not-found, empty success, queue capacity or backtest unavailability
- **AND** a durably known run identity MUST retain its `runId` and `Location` without an unconfirmed status

### Requirement: Signal Backtest Results Shall Publish Only After Completion
Public signal-backtest results SHALL use the owning run status as the publication boundary and SHALL NOT expose
partial persistence as a successful result collection.

#### Scenario: A signal result collection is requested
- **WHEN** the owning run is PENDING or RUNNING
- **THEN** the API MUST return actual HTTP `200` with `success=false`, `statusCode=200` and
  `code=BACKTEST_RESULTS_NOT_READY`
- **AND** it MUST NOT return a successful empty or partial collection

#### Scenario: A failed signal result collection is requested
- **WHEN** the owning run is FAILED
- **THEN** the API MUST return actual HTTP `200` with `success=false`, `statusCode=200` and
  `code=BACKTEST_RESULTS_UNAVAILABLE`
- **AND** it MUST NOT expose physically retained partial rows

#### Scenario: A completed signal result collection is requested
- **WHEN** the owning run is COMPLETED
- **THEN** the API MUST return the final result collection
- **AND** a completed run with zero matches MUST return a successful empty final collection

### Requirement: Repeated Signal Backtests Shall Use Distinct Run Identities
Repeating a signal backtest SHALL create a new run and SHALL NOT require duplicate results within one run.

#### Scenario: The same signal backtest is submitted again
- **WHEN** a client repeats an earlier backtest request
- **THEN** the backend MUST create a distinct `BacktestRun`
- **AND** the new run MAY persist the same security and signal time as the earlier run

#### Scenario: One run attempts to persist the same result identity twice
- **WHEN** the existing run/security/signal-time unique key rejects the second result
- **THEN** the runner MUST treat it as a persistence failure
- **AND** it MUST NOT report an idempotent result success or silently skip the duplicate

### Requirement: Completed Signal Backtest Results Shall Be Bounded
The public signal-backtest result collection SHALL use the approved chronological cursor page contract after
the owning run reaches COMPLETED.

#### Scenario: A completed signal-backtest page is requested
- **WHEN** a client queries the completed signals resource
- **THEN** results MUST be ordered by signal time and stable id tie-breaker
- **AND** the page MUST contain at most the approved limit
- **AND** additional results MUST be followed only through nextCursor
- **AND** the API MUST NOT return the entire growing collection as a bare array

