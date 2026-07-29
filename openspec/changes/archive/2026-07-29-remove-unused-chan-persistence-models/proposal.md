## Why

The current Chan calculation path is stateless and request-scoped, but five
unused persistence-shaped classes still imply that derived fenxing, Bi, period,
and state data belongs in MySQL. Those classes are not registered with
TypeORM, have no repository consumers, and have no migration-backed schema, so
keeping them creates false database obligations and duplicate domain models.

## What Changes

- **BREAKING** Remove the unused Chan TypeORM/persistence-shaped classes and
  their table-name guard assertions.
- Define Chan fenxing, Bi, merged-K, and phase results as request-time derived
  data; retain runtime DTO/VO classes where NestJS OpenAPI reflection requires
  them.
- Keep Chan calculation services free of repositories and Chan-result MySQL
  writes.
- Add a read-only production audit for any legacy Chan tables and explicitly
  defer physical `DROP TABLE` DDL until table existence, row counts, and
  `SHOW CREATE TABLE` evidence are reviewed.
- Correct the root audit documents so Chan schema baseline, FK, unique, JSON,
  and audit-time-column work is no longer presented as required future schema
  work.

## Capabilities

### New Capabilities

- `chan-derived-analysis-lifecycle`: Defines Chan analysis results as
  request-time derived values rather than persistent entities.

### Modified Capabilities

- `database-schema-safety`: Requires legacy Chan tables to be audited before
  optional removal and prevents an unaudited destructive migration.

## Impact

- Affected backend code:
  `apps/mist/src/chan/entities/`,
  `apps/mist/src/naming-layout.guard.spec.ts`, and Chan-focused tests.
- Affected database operations:
  a new read-only audit under `deploy/database/`; no automatic schema migration
  is added by this change.
- Public Chan API response shapes and current Phase A/Phase B algorithm
  behavior remain unchanged.
- Root audit and database-review documents are updated to remove the obsolete
  Chan persistence backlog.
