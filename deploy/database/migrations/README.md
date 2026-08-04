# Database migrations

Migration files in this directory are executed by:

```bash
node tools/run-migrations.mjs
```

The runner sorts `*.sql` files by name, creates `schema_migrations`, skips files
already recorded there, and records each migration only after the SQL file
finishes successfully.

Production deployments run this through the one-shot `mist-migrate` service in
the Windows Docker stack before `mist-backend` and `chan-api` are considered
healthy.

Override the directory only when intentionally testing an alternate migration
set:

```bash
MIGRATION_DIR=/path/to/migrations node tools/run-migrations.mjs
```

## Security code identity cleanup

Before applying `003_security_code_identity.sql` on an existing database, run the
audit SQL if there is any doubt about existing data:

```bash
mysql -h <host> -P <port> -u <user> -p <database> < deploy/database/audit-security-identity.sql
```

The audit reports:

- `securities.code` rows that are not canonical internal codes.
- Rows that would collide after canonical normalization.
- Duplicate `security_source_configs` grouped by `(security_id, source)`.
- Exact duplicate source-config rows that the migration can remove safely.
- Non-identical duplicate source-config rows that require manual resolution.

Manual resolution rules:

- If two `securities.code` rows normalize to the same canonical code, decide
  which `securities.id` owns the history before changing data; do not merge
  automatically.
- If a `securities.code` row is provider-formatted but has no collision, update
  it to the canonical pure code before running the migration.
- If duplicate source configs for the same `(security_id, source)` differ by
  `formatCode`, `priority`, or `enabled`, choose the row to keep and delete or
  update the others before running the migration.

`003_security_code_identity.sql` deletes only exact duplicate source-config rows
and then adds a unique index on `(security_id, source)`.

## K volume/amount exact-decimal migration

Before and after applying `007_k_volume_amount_exact_decimal.sql`, run:

```bash
mysql -h <host> -P <port> -u <user> -p <database> \
  < deploy/database/audit-k-decimal-migration.sql
```

Keep both outputs with the release evidence. Row counts, null counts, numeric
aggregates, and `normalized_row_digest` must remain identical. Confirm enough
free disk space and a maintenance window before altering a large `k` table.

Migration `007` widens `volume` and `amount` to nullable `DECIMAL(36,8)`. It
does not repair values that older application versions already rounded or
filled with zero. Application rollback leaves the widened schema in place.

## Provider symbol audit and K extension fullCode removal

Before deploying the fail-closed provider-symbol application or applying
`008_remove_k_extension_full_code.sql`, run:

```bash
mysql -h <host> -P <port> -u <user> -p <database> \
  < deploy/database/audit-provider-format-code.sql
```

Both result sets must be empty. Correct every enabled source config with an
empty `formatCode`, and correct enabled TDX/QMT values that are not an exact
six-digit symbol ending in `.SH`, `.SZ`, or `.BJ`.

`fullCode` has no business reader and does not provide reliable capture
provenance. Migration `008` drops it from `k_extensions_tdx`,
`k_extensions_qmt`, and `k_extensions_ef`; it does not change K ownership or
provider routing.

Take and verify a database backup before applying this destructive migration.
Deploy migration `008` and the application that no longer reads or writes
`fullCode` in the same maintenance window. Old and new application versions
must not run together. Rollback requires restoring the pre-migration database
backup together with the previous application SHA because the removed values
cannot be reconstructed reliably.

## Strategy database integrity migration

Before applying `009_strategy_database_integrity.sql`, run:

```bash
mysql -h <host> -P <port> -u <user> -p <database> \
  < deploy/database/audit-strategy-database-integrity.sql
```

Every `violation_count` must be zero. The audit checks:

- non-null current versions that are missing or belong to another definition;
- enabled definitions without a current version;
- NULL context/rule snapshots in live and backtest signal rows;
- backtest result strategy/version/period/source values that disagree with the
  owning run;
- duplicate `(backtest_run_id, security_code, signal_time)` identities.

Do not replace missing snapshots with `{}`. Remove only explicitly identified
test rows, or reconstruct a snapshot only when exact source evidence exists.

Migration `009` makes snapshots non-null, adds current-version ownership and
enabled-version constraints, removes run-owned columns from
`backtest_signal_results`, and adds the result unique key. It must ship with the
matching backend and frontend in one maintenance window. Take and verify a
database backup first. Rollback requires restoring that backup together with
the prior backend and frontend SHAs because the dropped result columns are not
recoverable from the new schema alone.

The composite current-version foreign key intentionally rejects directly
deleting a definition that still points at a current version. There is no
product hard-delete API; normal lifecycle removal uses `archived`. For an
explicit maintenance delete, first change the definition to a non-enabled
status and set `current_version_id` to NULL, then delete it. The existing
definition-owned cascades will remove versions and dependent rows.

## Legacy Chan result-table inventory

Chan fenxing, Bi, index-period, and state values are request-time derived data;
the application does not register repositories or TypeORM entities for their
legacy table names. No migration creates those tables, and removing the unused
application models does not authorize deleting an unobserved production table.

Run the read-only inventory:

```bash
mysql -h <host> -P <port> -u <user> -p <database> \
  < deploy/database/audit-legacy-chan-tables.sql
```

For every table reported as present, execute and retain the generated exact
`COUNT(*)` and `SHOW CREATE TABLE` statements. Also check external scripts,
dashboards, and manual consumers that are outside this repository.

There is intentionally no automatic `DROP TABLE` migration in this change. A
physical cleanup requires a separate reviewed forward-only change with the
captured production evidence, a verified backup, an explicit table list and
drop order, and a database-restore rollback procedure.

## Managed column snake_case normalization

Migration `010_normalize_managed_column_names.sql` renames 26 application-owned
physical columns in `security_source_configs`, `k`, and the EF/TDX/QMT K
extension tables. It changes names only: data types, nullability, values,
indexes, and foreign keys must remain unchanged. TypeScript properties stay
camelCase and map explicitly to the new physical names.

Before and after migration 010, run:

```bash
mysql -h <host> -P <port> -u <user> -p <database> \
  < deploy/database/audit-managed-column-names.sql
```

Before migration, all 26 rows must report `pre_migration_ready`; after migration,
all must report `post_migration_ready`, with `old_column_count = 0`,
`new_column_count = 26`, and `invalid_mapping_count = 0`. The final uppercase
column-name result set must also be empty.

The older security identity, K decimal, and provider-symbol audits refer to the
schema stage immediately before their corresponding migrations. Run them at
that documented stage; use `audit-managed-column-names.sql` for the current
post-010 physical naming contract.

Take and verify a database backup before migration 010. Deploy migration 010 and
the matching backend atomically; old and new application versions must not run
against the same database at the same time. Verify row values and the K
natural-key/FK and extension one-to-one constraints before reopening traffic.
Rollback is a database restore from the pre-010 backup together with the
previous backend SHA; do not attempt mixed-schema application rollback.

## Audit timestamp naming normalization

Migration `011_normalize_audit_timestamp_names.sql` renames the remaining five
managed `create_time/update_time` pairs to `created_at/updated_at`. It does not
add update timestamps to append-only strategy versions, strategy signals, or
backtest signal results. TypeScript and HTTP JSON switch from
`createTime/updateTime` to `createdAt/updatedAt` in the same release.

Before and after migration 011, run:

```bash
mysql -h <host> -P <port> -u <user> -p <database> \
  < deploy/database/audit-timestamp-names.sql
```

Before migration, all ten rows must report `pre_migration_ready`; after
migration, all must report `post_migration_ready`, with
`old_column_count = 0`, `new_column_count = 10`,
`invalid_mapping_count = 0`, and `invalid_attribute_count = 0`. The final
legacy-column result set must be empty.

The renamed columns must retain `DATETIME(6) NOT NULL` and
`DEFAULT CURRENT_TIMESTAMP(6)`. Every `updated_at` must also retain
`ON UPDATE CURRENT_TIMESTAMP(6)`. Deploy migration 011, backend, and `mist-fe`
atomically because the HTTP property rename is intentionally breaking and has
no compatibility aliases. Rollback requires the pre-011 database backup and
both previous application SHAs.

## QMT effective dividend request provenance removal

Migration `012_remove_qmt_effective_dividend_type.sql` removes
`k_extensions_qmt.effective_dividend_type`. The column repeated the backend's
fixed `dividend_type='front_ratio'` request parameter for every K row; it was
not populated from an independently verified provider response.

Before and after migration 012, run:

```bash
mysql -h <host> -P <port> -u <user> -p <database> \
  < deploy/database/audit-qmt-effective-dividend-type-removal.sql
```

The audit count must be `1` before migration and `0` afterward. Deploy migration
012 and the application that no longer reads or writes the property together.
Do not run the previous application against the post-012 schema. Take a
database backup before migration; rollback requires that backup and the
previous backend SHA.

## QMT native request-period provenance removal

Migration `013_remove_qmt_native_period.sql` removes
`k_extensions_qmt.native_period`. The column repeated the QMT request string
derived by `PeriodMappingService` for every K row. It was not an independently
returned provider field, while the authoritative domain period already remains
in `k.period`.

Before and after migration 013, run:

```bash
mysql -h <host> -P <port> -u <user> -p <database> \
  < deploy/database/audit-qmt-native-period-removal.sql
```

The audit count must be `1` before migration and `0` afterward. Deploy migration
013 and the application that no longer reads or writes the property together.
Do not run the previous application against the post-013 schema. Take a
database backup before migration; rollback requires that backup and the
previous backend SHA.

## Strategy evaluation contract migration

Migration `014_evolve_strategy_evaluation_contract.sql` is authorized only by
the 2026-08-04 production inventory that proved migrations 001-013 and zero
rows in all six strategy/backtest tables. Immediately before deployment, run:

```bash
mysql -h <host> -P <port> -u <user> -p <database> \
  < deploy/database/audit-strategy-evaluation-contract.sql
```

Every relevant row count must still be zero. If any row exists, stop before
DDL; do not infer signal kind, map security codes, delete rows, add a default,
or introduce a compatibility column.

Migration 014 adds non-null, no-default `signal_kind` to
`strategy_versions`, replaces live `strategy_signals.security_code` with
canonical `security_id`, and adds non-null, no-default `signal_kind` to live
Signals. `fk_strategy_signals_security` references `securities(id)` with
`ON DELETE RESTRICT ON UPDATE RESTRICT`. The existing Signal indexes are
retargeted to `security_id`; no Signal composite unique is added and
`uq_strategy_alert_events_dedupe_key` remains the alert dedupe owner.

MySQL DDL commits per table. Migration 014 therefore accepts only the exact
pre-migration state, the known repair-forward state where the
`strategy_versions` ALTER committed but `strategy_signals` remains unchanged,
or the exact post-migration state. If the runner fails between the two ALTERs,
fix the environmental cause and rerun the same migration; it completes the
remaining table and records 014. Any other mixed state fails closed and
requires a new audited repair-forward decision.

After the migration runner records 014, run:

```bash
mysql -h <host> -P <port> -u <user> -p <database> \
  < deploy/database/readback-strategy-evaluation-contract.sql
```

Every `*_ready` value must be `1`; `retired_security_code_count` and
`unapproved_signal_unique_count` must be `0`; the migration-ledger result must
contain exactly `014_evolve_strategy_evaluation_contract.sql`. Retain the
readback and both `SHOW CREATE TABLE` results with release evidence.

The schema is intentionally incompatible with the previous backend. Deploy
migration 014 together with the matching backend and frontend release; do not
run old and new application versions against the same schema. Take and verify
a backup first. Rollback requires restoring that backup together with the
previous backend/frontend SHAs; application-image rollback alone is invalid.

## Realtime subscription assignment migration

Migration `015_add_realtime_subscription_assignments.sql` is authorized by the
2026-08-04 lifecycle preflight that proved production migration history through
014, the exact `securities` and `security_source_configs` schema, 9 Securities,
13 source configs, no orphan/duplicate/invalid enabled realtime config, and no
existing assignment table. Immediately before deployment, take a verified
backup and run:

```bash
mysql -h <host> -P <port> -u <user> -p <database> \
  < deploy/database/audit-realtime-subscription-assignments.sql
```

Stop if migration history no longer ends at 014, the target assignment table
already exists in an unknown shape, or the named source-config composite unique
exists with different columns. Do not import legacy env allowlists, infer a
realtime source from historical priority, add a desired column, or create
assignment rows in this migration.

Migration 015 first adds named unique
`uq_security_source_configs_id_security(id, security_id)` and source-local lock
index `idx_security_source_configs_source(source)` in one ALTER, then creates
`realtime_subscription_assignments`. Each Security and source config is unique;
the composite source-config FK proves the config belongs to the same Security.
All assignment FKs use `RESTRICT` for update/delete.

MySQL DDL commits per table. If the first ALTER commits and CREATE TABLE fails,
fix the environmental cause and rerun 015: the exact partial state is accepted
and the table is created. If the exact post-state exists but the runner did not
record the migration, rerun records 015 after postflight. Any differently named,
partial or mismatched schema fails closed and requires a new audited
repair-forward decision; do not edit 015 after it has been applied.

After the migration runner records 015, run:

```bash
mysql -h <host> -P <port> -u <user> -p <database> \
  < deploy/database/readback-realtime-subscription-assignments.sql
```

Every `*_ready` value must be 1; orphan/cross-Security and ineligible counts must
be zero. Retain the complete ledger, readback and `SHOW CREATE TABLE` output.
Application rollback leaves migration 015 and assignment rows in place and
sets lifecycle mode off. It must not drop the table or delete routing facts.
