# audit-timestamp-contract Specification

## Purpose
TBD - created by archiving change normalize-audit-timestamps. Update Purpose after archive.
## Requirements
### Requirement: Managed audit timestamps use one vocabulary

All managed database audit columns SHALL use `created_at` and, for mutable
records, `updated_at`. Corresponding TypeScript and HTTP JSON properties SHALL
use `createdAt` and `updatedAt`. Runtime code SHALL NOT expose or consume
`create_time`, `update_time`, `createTime`, or `updateTime`.

#### Scenario: A mutable managed record is returned by an API

- **WHEN** a mutable record is read through a Mist HTTP endpoint
- **THEN** its JSON representation MUST expose `createdAt` and `updatedAt`
- **AND** it MUST NOT expose `createTime` or `updateTime`

#### Scenario: An append-only managed fact is returned by an API

- **WHEN** a strategy version, strategy signal, or backtest signal result is
  returned
- **THEN** its JSON representation MUST expose `createdAt`
- **AND** it MUST NOT expose any generic update timestamp

### Requirement: Audit timestamps have distinct lifecycle semantics

`createdAt` SHALL represent initial successful persistence and SHALL remain
unchanged. `updatedAt` SHALL represent the latest persisted business change.
Neither audit property SHALL replace a domain event timestamp.

#### Scenario: A mutable record changes

- **WHEN** an existing mutable row receives a persisted business-field change
- **THEN** `updated_at` MUST advance
- **AND** `created_at` MUST remain unchanged

#### Scenario: A domain event has its own time

- **WHEN** a row contains `timestamp`, `signal_time`, `started_at`,
  `completed_at`, `acknowledged_at`, or `cooldown_until`
- **THEN** that lifecycle field MUST remain distinct from the generic audit
  fields

### Requirement: Database generation covers ORM and raw writes

Creation audit columns SHALL retain `DEFAULT CURRENT_TIMESTAMP(6)`. Mutable
update audit columns SHALL retain both `DEFAULT CURRENT_TIMESTAMP(6)` and
`ON UPDATE CURRENT_TIMESTAMP(6)` so query-builder upserts do not require manual
timestamp assignment.

#### Scenario: A row is inserted without explicit audit values

- **WHEN** TypeORM or raw SQL inserts a managed row without audit properties
- **THEN** MySQL MUST populate the required audit columns

#### Scenario: A K row is corrected by duplicate-key upsert

- **WHEN** an existing K row receives changed OHLCV or amount values
- **THEN** MySQL MUST update `updated_at` without application timestamp code

### Requirement: MySQL DATETIME uses an explicit market timezone

Every Mist TypeORM MySQL connection SHALL configure mysql2 with
`timezone: '+08:00'`. Audit timestamp JSON SHALL serialize the resulting
JavaScript `Date` as an ISO-8601 instant.

#### Scenario: A database wall-clock value is read

- **WHEN** MySQL returns `2026-07-29 10:00:00` from a managed `DATETIME` column
- **THEN** the application MUST interpret it as `2026-07-29T10:00:00+08:00`
- **AND** JSON serialization MUST represent the same instant

### Requirement: Backend and frontend switch without compatibility fields

The backend and `mist-fe` SHALL switch to `createdAt/updatedAt` together.
Neither repository SHALL introduce aliases, duplicate response fields, dual
writes, or fallback parsing for the retired names.

#### Scenario: The workspace is scanned after implementation

- **WHEN** runtime code and current tests are searched for retired audit names
- **THEN** no retired name MAY remain except immutable migration history and
  migration documentation

