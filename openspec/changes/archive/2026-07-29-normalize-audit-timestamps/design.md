## Context

The 12 active TypeORM entities share one logical audit-time model but currently
mix two database conventions. Five mutable market-data tables use
`create_time/update_time`; the remaining entities use
`created_at/updated_at`. All entities expose `createTime/updateTime`, and NestJS
controllers return several of those entities directly, so the TypeScript names
are also HTTP JSON names consumed by `mist-fe`.

Three entities are append-only facts (`strategy_versions`,
`strategy_signals`, and `backtest_signal_results`) and intentionally have only
a creation timestamp. Nine entities are mutable and have both creation and
update timestamps.

MySQL runs with `TZ=Asia/Shanghai`, but the four TypeORM configurations do not
currently declare a mysql2 `timezone`. Because `DATETIME` has no embedded zone,
the application must explicitly interpret it as China Standard Time.

Migrations 001–010 are immutable history. The release policy does not allow
aliases, dual fields, dual writes, compatibility parsing, or mixed versions.

## Goals / Non-Goals

**Goals:**

- Establish one database, TypeScript, and JSON audit timestamp vocabulary.
- Preserve creation and update values, precision, defaults, and update
  behavior through a forward-only migration.
- Preserve the creation-only model for append-only fact entities.
- Make mysql2 interpretation of all managed `DATETIME` values explicit as
  `+08:00`.
- Update backend and frontend consumers atomically and reject the retired
  names in contract tests.

**Non-Goals:**

- Rename `K.timestamp` or domain lifecycle fields such as `signalTime`,
  `startedAt`, `completedAt`, `acknowledgedAt`, or `cooldownUntil`.
- Add update timestamps to append-only entities.
- Convert `DATETIME(6)` columns to `TIMESTAMP`, change precision, or rewrite
  stored values.
- Rename `schema_migrations.applied_at`, datasource-native runtime fields, or
  deployment evidence fields.

## Decisions

### Use past-participle audit names across all managed boundaries

Database columns become `created_at/updated_at`; TypeScript and JSON properties
become `createdAt/updatedAt`. These names match the existing majority schema and
the established lifecycle vocabulary (`startedAt`, `completedAt`,
`acknowledgedAt`).

Alternative: keep TypeScript `createTime/updateTime` and map only the database.
Rejected because the old API vocabulary would remain inconsistent and there is
no production compatibility requirement.

### Preserve mutable versus append-only entity shape

All 12 entities expose `createdAt`. Only the nine currently mutable entities
expose `updatedAt`. No field is added merely for symmetry.

Alternative: add `updatedAt` everywhere. Rejected because it suggests that
immutable versions, signals, and backtest result facts may be edited in place.

### Add migration 011 and preserve migrations 001–010

Migration 011 renames exactly ten columns across
`security_source_configs`, `k`, and the three K extension tables. It does not
modify types or values. A read-only information-schema audit reports the
pre/post state and rejects mixed schemas.

Alternative: rewrite migration 001 because the system is not live. Rejected
because applied migration history and hash guards already form a repository
contract, and a fresh database must exercise the same forward path as an
existing one.

### Keep database-generated audit values

The schema retains `DEFAULT CURRENT_TIMESTAMP(6)` and, for mutable records,
`ON UPDATE CURRENT_TIMESTAMP(6)`. TypeORM uses `CreateDateColumn` and
`UpdateDateColumn`, but services do not manually assign audit values. Database
generation remains effective for raw query-builder upserts.

### Interpret MySQL DATETIME as +08:00 explicitly

Every TypeORM MySQL options object sets `timezone: '+08:00'`. This matches the
existing MySQL service and A-share market wall clock without changing stored
values. JSON serialization continues to emit ISO-8601 UTC instants from
JavaScript `Date`.

Alternative: change the database and all application containers to UTC.
Rejected for this change because the same connections also carry market bar
`DATETIME` values; changing the storage convention would require a separate K
time migration and broader proof.

### Ship backend, migration, and frontend atomically

The entity property rename intentionally changes JSON. `mist-fe` switches its
interfaces, UI access, and fixtures in the same release. No old JSON fields are
emitted or accepted.

## Risks / Trade-offs

- [Old frontend with new backend loses audit fields] → Pin both repository SHAs
  and release migration, backend, and frontend in one maintenance window.
- [Column rename changes attributes unexpectedly] → Compare type, nullability,
  default, extra, values, and counts before and after migration on MySQL 8.4.
- [A missed entity or API fixture retains old vocabulary] → Add metadata and
  JSON contract inventories plus a workspace-wide retirement scan.
- [Explicit `+08:00` changes previously misinterpreted `Date` values] → Verify
  round-trip examples for both audit timestamps and K timestamps in MySQL 8.4;
  treat the corrected absolute instant as intentional.
- [Raw upserts bypass TypeORM update-date handling] → Retain MySQL
  `ON UPDATE CURRENT_TIMESTAMP(6)` and test a duplicate-key business update.

## Migration Plan

1. Audit existing five legacy table pairs and require all ten old columns with
   no target duplicates.
2. Take a verified database backup and pin `mist` and `mist-fe` release SHAs.
3. Apply migration 011.
4. Deploy the matching backend and frontend together.
5. Run the post-migration audit, API contract checks, and timestamp round-trip
   smoke tests.
6. Roll back only by restoring the pre-011 database backup together with both
   previous application SHAs; mixed schemas are unsupported.

## Open Questions

None. The user approved the breaking names and explicit `+08:00` connection
interpretation.
