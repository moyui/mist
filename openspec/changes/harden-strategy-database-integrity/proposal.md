## Why

Strategy persistence currently relies on application convention for current-version ownership, snapshot completeness, and backtest-result identity. This permits cross-definition version pointers, unauditable signal rows, and duplicate or internally contradictory backtest results even though the normal write paths intend stronger invariants.

## What Changes

- Make strategy definition creation and rule-version updates atomic.
- Validate that every current strategy version exists and belongs to its definition, including before enabling or scanning a strategy.
- Add TypeORM relation metadata for strategy signal, alert, run, version, definition, and result foreign keys without renaming existing database columns.
- Require new live and backtest signal rows to contain both context and rule snapshots.
- Add a production audit for current-version ownership, snapshot NULL counts, backtest-result/run consistency, and duplicate result identities.
- Add a forward-only strategy-integrity migration with database constraints for current-version ownership and enabled-version presence.
- **BREAKING** Make strategy and backtest snapshots `NOT NULL`; deployment is gated on zero existing NULL rows and does not synthesize `{}`.
- **BREAKING** Remove `strategy_definition_id`, `strategy_version_id`, `period`, and `source` from `backtest_signal_results`; the owning `backtest_runs` row is their single source of truth.
- Add unique backtest-result identity `(backtest_run_id, security_code, signal_time)`.
- Update backend and frontend backtest-result contracts to read run-owned period/source from `BacktestRun`.
- Preserve migration 006 byte-for-byte and implement all DDL as a new forward-only migration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `strategy-definition-registry`: Strategy version creation, current-version assignment, ownership validation, and enablement become atomic and fail closed.
- `strategy-signal-alerts`: Persisted live signals require complete snapshots and relation metadata while scans reject foreign current versions.
- `strategy-signal-backtesting`: Backtest runs own strategy/version/period/source, result rows have one identity per run/security/time, and result snapshots are required.
- `database-schema-safety`: Strategy-integrity DDL requires a forward-only migration and zero-result preflight audit.

## Impact

- Repositories: `mist` backend/database/OpenSpec and `mist-fe` API types/UI tests.
- Database: new migration after 008; four backtest-result columns are dropped, four JSON columns become `NOT NULL`, current-version constraints and a result unique key are added.
- API: `BacktestSignalResult` no longer returns run-owned strategy/version/period/source scalar fields.
- Deployment: migration must not run until the audit reports zero snapshot NULLs, ownership mismatches, and duplicate result identities; rollback requires database backup restoration for dropped columns.
