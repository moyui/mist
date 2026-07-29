## Why

Mist currently exposes one audit-time concept through two database naming
families (`create_time/update_time` and `created_at/updated_at`) while every
TypeScript entity still uses `createTime/updateTime`. Because controllers return
entities directly, this inconsistency also leaks into HTTP JSON and
`mist-fe`; the system is not yet in production, so this is the safest point to
make one breaking, compatibility-free correction.

## What Changes

- **BREAKING** Standardize managed database audit columns on
  `created_at/updated_at`, using a forward-only migration without rewriting
  migrations 001–010.
- **BREAKING** Rename TypeScript and HTTP JSON properties from
  `createTime/updateTime` to `createdAt/updatedAt`.
- Keep append-only strategy versions, signals, and backtest results
  creation-only; do not add artificial update timestamps.
- Update `mist-fe` API types, UI consumers, and fixtures in the same release.
- Make the MySQL wall-clock interpretation explicit as `+08:00` for every
  TypeORM connection that reads or writes market and audit `DATETIME` values.
- Add schema, metadata, JSON contract, timezone, and cross-repository
  retirement tests. No aliases, dual fields, dual writes, or compatibility
  parsing are introduced.

## Capabilities

### New Capabilities

- `audit-timestamp-contract`: Defines audit timestamp semantics, database,
  TypeScript and JSON names, mutable versus append-only entity coverage, and
  MySQL timezone interpretation.

### Modified Capabilities

- `database-schema-safety`: Requires a forward-only, audited migration for the
  remaining legacy audit column names while preserving applied migration
  history.

## Impact

- `mist`: 12 shared-data entities, alert ordering, four TypeORM connection
  configurations, migration 011, audits, tests, and OpenSpec documentation.
- `mist-fe`: strategy/backtest response types, timestamp rendering, and test
  fixtures.
- HTTP API: `createTime/updateTime` disappear and are replaced by
  `createdAt/updatedAt`.
- Deployment: migration, backend, and frontend must ship as one release; mixed
  old/new API versions are unsupported.
