## ADDED Requirements

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
- **AND** it MUST return the created `runId`, creation snapshot `status=PENDING` and run-resource `Location`
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
