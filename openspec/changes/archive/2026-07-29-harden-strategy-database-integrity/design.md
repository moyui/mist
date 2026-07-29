## Context

Migration 006 created the strategy tables and physical scalar foreign keys. Later code made live signal and alert creation transactional and aligned the alert dedupe index, but four integrity gaps remain:

- `strategy_definitions.current_version_id` is nullable and unconstrained, while create/update writes are not atomic and scan lookup checks only the version ID.
- Entity metadata exposes most strategy foreign keys only as scalar columns even though the database has relations.
- live and backtest snapshot columns are nullable even though current writers produce both snapshots.
- `backtest_signal_results` repeats run-owned strategy/version/period/source values and has no unique identity for one strategy evaluation at one security/time.

The production MySQL instance is not reachable from the current development host. Migration readiness therefore depends on a checked-in audit that operators must run against the target database.

## Goals / Non-Goals

**Goals:**

- Make definition/version creation and current-version changes atomic.
- Guarantee that a non-null current version belongs to its definition and that an enabled definition has a current version.
- Align TypeORM relation metadata with existing physical foreign keys.
- Require complete snapshots for all newly persisted live and backtest results.
- Make `BacktestRun` the single owner of strategy/version/period/source.
- Enforce one backtest result per run, security, and signal time.
- Provide a fail-closed production audit and forward-only migration.

**Non-Goals:**

- Rewriting migration 006 or previously applied schema history.
- Synthesizing `{}` or reconstructing unavailable historical snapshots.
- Adding retry/resume behavior for failed backtest runs.
- Changing realtime snapshot-to-signal orchestration.
- Allowing one strategy version to emit multiple named results for the same security/time; that future feature would require an explicit result key.

## Decisions

### Definition and current version are written in one transaction

Create and rule-changing update operations use one TypeORM transaction and transaction-scoped repositories. A failed version write or current-pointer update rolls back the definition change.

Current-version lookup always filters by both version ID and definition ID. Enablement performs the same ownership check before changing status.

### Current-version ownership uses a composite database constraint

The migration adds a unique referenced key on
`strategy_versions(strategy_definition_id, id)` and a composite foreign key:

```text
strategy_definitions(id, current_version_id)
  → strategy_versions(strategy_definition_id, id)
```

This permits `NULL` for a draft creation boundary but rejects a pointer to a
foreign strategy version. A same-row check constraint rejects an enabled
definition whose `current_version_id` is NULL.

The alternative simple FK from `current_version_id` to `strategy_versions.id`
was rejected because it proves existence but not ownership.

### Relations are explicit while scalar IDs remain where still stored

Unidirectional or inverse TypeORM relations are added for definition/version,
signal/alert, run, and result ownership. Existing scalar ID properties remain
where their columns remain useful for filtering and insertion. Relation
metadata reuses the same `@JoinColumn` names and does not create compatibility
columns.

### Snapshots are required evidence

`context_snapshot` and `rule_snapshot` become non-null in both
`strategy_signals` and `backtest_signal_results`. Entity properties become
required. The migration performs no backfill; target data must already have
zero NULL rows, as proven by the audit.

The alternative `{}` backfill was rejected because it would turn missing
evidence into falsely asserted empty evidence.

### Backtest run owns invariant execution configuration

`backtest_signal_results` keeps only:

```text
backtest_run_id
security_code
signal_time
context_snapshot
rule_snapshot
created_at
```

`strategy_definition_id`, `strategy_version_id`, `period`, and `source` are
dropped because they are invariant for a run and can contradict their owning
row. Backend writes and frontend display use `BacktestRun` for those values.

### Backtest result identity is run, security, and signal time

One run evaluates one immutable strategy version. Multiple strategies use
different runs. The unique key is therefore:

```text
(backtest_run_id, security_code, signal_time)
```

If one strategy later emits multiple named results for one snapshot, a
`result_key` must be designed before relaxing this invariant.

## Risks / Trade-offs

- [Existing NULL snapshots make the migration fail] → Run the audit first; delete test-only rows or reconstruct only from exact evidence, never `{}`.
- [Existing duplicate backtest results make unique-key creation fail] → Audit and explicitly resolve duplicate test rows before migration.
- [Dropped backtest columns cannot be restored by application rollback] → Take a verified backup and roll back database plus backend/frontend SHAs together.
- [Application and database versions become incompatible during rollout] → Deploy migration, backend, and frontend in one maintenance window with no mixed versions.
- [Composite current-version FK creates a cycle with definition-owned version cascade] → Strategy definitions have no hard-delete API and use archived lifecycle state. A manual hard delete MUST first set a non-enabled status and clear `current_version_id`; deleting the definition then retains migration 006 cascade behavior. MySQL 8.4 integration tests cover both the initial rejection and the explicit two-step deletion.
- [Production database is unavailable during implementation] → Treat real audit output and MySQL migration execution as release gates, not as completed evidence.

## Migration Plan

1. Deploy the new backend/frontend artifacts only as a coordinated candidate; do not mix them with the old schema.
2. Back up the target database.
3. Run `deploy/database/audit-strategy-database-integrity.sql`.
4. Require zero current-version mismatches, enabled definitions without a current version, snapshot NULLs, result/run mismatches, and duplicate result identities.
5. Resolve only known test data or exact reconstructable evidence.
6. Apply the new forward-only migration through `mist-migrate`.
7. Run schema contract tests and read back representative strategy, signal, alert, run, and result rows.
8. For an intentional hard delete, first move the definition out of enabled
   status and clear `current_version_id`, then delete the definition so its
   versions and dependent rows cascade normally.
9. Rollback restores the database backup and the previous backend/frontend SHA set.

## Open Questions

- Target MySQL audit counts remain unknown until the operator runs the checked-in audit on the production Windows stack.
