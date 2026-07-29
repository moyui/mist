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
