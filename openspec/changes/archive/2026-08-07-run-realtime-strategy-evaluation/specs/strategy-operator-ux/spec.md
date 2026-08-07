## MODIFIED Requirements

### Requirement: Strategy UX Shall Use Mist Backend Strategy APIs

The strategy operator workspace SHALL call Mist backend strategy APIs through the configured Mist API base path
and version-first `/v1/*` endpoints. It SHALL NOT expose a manual live-scan action.

#### Scenario: Strategy API calls are made

- **WHEN** the strategy workspace loads or performs a strategy action
- **THEN** the frontend MUST call Mist backend endpoints under `/v1/strategies`, `/v1/strategy-signals`,
  `/v1/strategy-alert-events`, or `/v1/strategy-backtests`
- **AND** it MUST NOT call `/v1/strategy-scans/run`
- **AND** it MUST NOT call datasource services or raw provider endpoints directly

### Requirement: Operators Shall Run Signal-Level Backtests

The strategy workspace SHALL use the signal-level BacktestRun workflow for every operator-requested strategy
execution and SHALL keep those results separate from live Signal and AlertEvent records.

#### Scenario: Backtest is requested

- **WHEN** an operator submits strategy version, target universe, period, source, start time, and end time
- **THEN** the frontend MUST call the signal-level backtest create API
- **AND** it MUST show BacktestRun status and BacktestSignalResult data when returned
- **AND** it MUST NOT describe the action as a live scan or show live-created Signal/AlertEvent counts

#### Scenario: Backtest signal results are inspected

- **WHEN** backtest signal rows are returned by the backend
- **THEN** the workspace MUST show security code, period, source, signal time, rule snapshot, and context snapshot
  access
- **AND** those rows MUST remain visually and contractually distinct from realtime Signal history

## REMOVED Requirements

### Requirement: Operators Shall Trigger Manual Scans

**Reason**: Operator-requested execution belongs exclusively to Backtest. Only the realtime trigger chain may
produce live Signal and AlertEvent records.

**Migration**: In the separately owned frontend project, delete the manual-scan action, API client, request and
summary types, display logic and tests. Route operators to `/v1/strategy-backtests` instead. The backend route and
frontend consumer form one breaking release gate.
