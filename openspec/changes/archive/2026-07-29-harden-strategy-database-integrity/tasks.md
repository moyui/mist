## 1. Strategy version integrity

- [x] 1.1 Make strategy definition creation and rule-changing updates use transaction-scoped repositories.
- [x] 1.2 Validate current-version ownership during scan resolution and before enabling a strategy.
- [x] 1.3 Add rollback, missing-version, and foreign-version regression tests.

## 2. Entity metadata and snapshot requirements

- [x] 2.1 Add TypeORM relations for strategy definitions, versions, signals, alerts, backtest runs, and results using existing join-column names.
- [x] 2.2 Make live and backtest context/rule snapshot entity properties non-null.
- [x] 2.3 Add metadata tests proving relations reuse physical columns and snapshots are non-null.

## 3. Backtest result ownership

- [x] 3.1 Remove run-owned strategy definition, strategy version, period, and source fields from `BacktestSignalResult`.
- [x] 3.2 Update backtest persistence to write the owning run relation and the reduced result shape.
- [x] 3.3 Add the `(backtestRunId, securityCode, signalTime)` entity unique index and regression tests.

## 4. Database migration safety

- [x] 4.1 Add a target-database audit for current-version ownership, enabled-version presence, snapshot NULLs, result/run mismatches, and duplicate identities.
- [x] 4.2 Add forward-only migration 009 with current-version constraints, snapshot `NOT NULL`, redundant result-column removal, and the result unique key.
- [x] 4.3 Update migration README and schema-safety tests without modifying migration 006.

## 5. Frontend and documentation

- [x] 5.1 Remove run-owned fields from the frontend backtest-result type and render period/source from `BacktestRun`.
- [x] 5.2 Update frontend fixtures/tests for the reduced result contract.
- [x] 5.3 Update root audit/database review documents with the confirmed design and unresolved production-audit gate.

## 6. Verification

- [x] 6.1 Run focused backend strategy, migration, and metadata tests.
- [x] 6.2 Run full `mist` lint, typecheck, tests, contracts, build, and strict OpenSpec validation.
- [x] 6.3 Run `mist-fe` lint, typecheck, and tests.
- [x] 6.4 Validate migration 009 against MySQL 8.4 when an instance is available and record the production audit as a release gate.
