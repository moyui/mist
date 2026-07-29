# database-schema-safety Specification

## Purpose
TBD - created by archiving change disable-typeorm-auto-sync. Update Purpose after archive.
## Requirements
### Requirement: TypeORM schema synchronization is disabled

All Mist NestJS applications SHALL disable TypeORM automatic schema
synchronization explicitly and SHALL NOT derive `synchronize` from `NODE_ENV`.

#### Scenario: App database options are built in any environment

- **WHEN** an app configures `TypeOrmModule.forRootAsync`
- **THEN** the returned TypeORM options MUST contain `synchronize: false`
- **AND** the value MUST NOT depend on the runtime environment name

### Requirement: Schema changes use repository migrations

Database schema changes SHALL be represented by forward-only repository SQL
migrations and SHALL NOT rely on runtime TypeORM synchronization. Applied
migrations 001–010 SHALL remain byte-identical. Migration 011 SHALL rename
exactly the ten legacy audit columns and SHALL include pre/post audit and
MySQL 8.4 verification evidence.

#### Scenario: A database schema fix is required

- **WHEN** an entity change requires a database DDL change
- **THEN** the change MUST include or reference an explicit SQL migration under
  `deploy/database/migrations`
- **AND** tests or substitute verification MUST cover the migration contract

#### Scenario: Audit timestamp migration is applied

- **WHEN** migration 011 runs after migrations 001–010
- **THEN** all managed audit columns MUST use `created_at/updated_at`
- **AND** column types, nullability, defaults, update expressions, values,
  indexes, and constraints MUST remain otherwise unchanged
- **AND** a mixed old/new audit schema MUST fail the audit gate

### Requirement: Extension entity metadata matches migration schema

Extension entity metadata SHALL match the SQL migration schema for one-to-one
`k_id` ownership and numeric field types.

#### Scenario: Extension entity declares the `k_id` relationship

- **WHEN** an extension table has a one-to-one relationship with `k`
- **THEN** the entity MUST expose a `kId` column mapped to `k_id`
- **AND** the migration MUST enforce a unique key on that `k_id`

#### Scenario: Extension entity declares numeric provider fields

- **WHEN** a provider payload and migration column represent a decimal numeric
  field
- **THEN** the TypeScript entity property MUST use a number-compatible type
- **AND** tests MUST guard against bigint/entity-column mismatches

### Requirement: Alert dedupe metadata matches immutable migration history
`StrategyAlertEvent` entity metadata SHALL declare the same named unique
`dedupe_key` index already created by migration `006`. Applied migration `006`
MUST remain byte-identical.

#### Scenario: Schema metadata is audited
- **WHEN** repository guards inspect migration SQL and TypeORM metadata
- **THEN** both declare `uq_strategy_alert_events_dedupe_key` as unique for the
  same logical field
- **AND** no new migration is introduced by this change

#### Scenario: Production index is not proven
- **WHEN** read-only production schema inventory cannot confirm the named
  unique index
- **THEN** release remains blocked
- **AND** migration `006` MUST NOT be edited to compensate

### Requirement: K volume and amount use nullable exact decimals

The canonical `k` table SHALL store `volume` and `amount` as `DECIMAL(36,8) NULL`, and application entities SHALL represent both values as exact decimal strings or `null`.

#### Scenario: Migration is applied to existing K data

- **WHEN** the new migration alters the canonical columns
- **THEN** all existing row identities and numeric values MUST be preserved
- **AND** the migration MUST NOT rewrite any previously applied migration

#### Scenario: Exact and missing values round trip

- **WHEN** an isolated MySQL test writes explicit zero, fractional volume, an eight-decimal amount, a large in-range value, and `null`
- **THEN** TypeORM readback MUST match every exact decimal value and `null`
- **AND** no application layer may substitute zero for `null`

#### Scenario: Application rollback is required

- **WHEN** datasource or backend application images roll back after the migration
- **THEN** the widened nullable schema MUST remain compatible with the previous application writes
- **AND** ordinary rollback MUST NOT attempt a destructive reverse migration

### Requirement: K decimal migration is deployment-gated

Production deployment SHALL verify schema capacity and protected data before enabling the new application contract.

#### Scenario: Production migration is prepared

- **WHEN** the release is scheduled
- **THEN** operators MUST capture K row count, table size, column definitions, and source-grouped count/digest before migration
- **AND** sufficient migration duration and free-space headroom MUST be confirmed

#### Scenario: Migration or readback verification fails

- **WHEN** schema alteration, protected count/digest comparison, or exact-decimal readback fails
- **THEN** the new datasource and backend builds MUST NOT deploy
- **AND** existing application builds MUST remain active against the last verified schema state

### Requirement: Unused K extension identity columns are removed by migration

The database SHALL remove `fullCode` from `k_extensions_tdx`, `k_extensions_qmt`, and `k_extensions_ef` through a new forward-only repository migration. Applied migrations MUST remain unchanged.

#### Scenario: Full-code removal migration runs

- **WHEN** the migration is applied to a schema containing the three legacy columns
- **THEN** it drops `fullCode` from all three K extension tables
- **AND** it does not alter K ownership, numeric values, or row counts

#### Scenario: Entity schema is compared with migrated schema

- **WHEN** schema safety tests inspect K extension metadata
- **THEN** no extension entity declares `fullCode`
- **AND** the current migration set does not create `fullCode` after all migrations have run

### Requirement: Strategy Integrity Migration Is Forward Only

Strategy table constraint and ownership changes SHALL use a new migration and
MUST NOT modify migration 006.

#### Scenario: Strategy integrity schema is changed

- **WHEN** current-version, snapshot, relation, or backtest-result constraints
  require DDL
- **THEN** the repository MUST contain a migration ordered after migration 008
- **AND** migration 006 MUST remain byte-identical

### Requirement: Destructive Strategy Migration Requires Zero-Result Audit

The repository SHALL provide a target-database audit for every invariant needed
before dropping result columns or making snapshots non-null.

#### Scenario: Migration readiness is assessed

- **WHEN** an operator prepares to apply the strategy integrity migration
- **THEN** the audit MUST report current-version ownership errors
- **AND** enabled definitions without current versions
- **AND** snapshot NULL counts
- **AND** backtest result/run mismatches
- **AND** duplicate backtest result identities
- **AND** every reported violation count MUST be zero before migration

#### Scenario: Historical snapshot evidence is missing

- **WHEN** an existing snapshot column is NULL
- **THEN** the migration process MUST NOT replace it with an empty JSON object
- **AND** the operator MUST resolve the row from exact evidence or remove
  explicitly identified test data before continuing

### Requirement: Legacy Chan tables are audited before optional removal

Repository migrations MUST NOT create or drop legacy Chan result tables merely
from unused TypeORM metadata. Any physical removal SHALL be based on production
table existence, exact row counts, captured DDL, and an explicit cleanup
decision.

#### Scenario: Persistence-shaped Chan classes are removed

- **WHEN** the application removes unused Chan TypeORM models
- **THEN** the same change MUST NOT add an automatic `DROP TABLE` migration
- **AND** it MUST provide a read-only audit for the legacy table names

#### Scenario: A legacy Chan table exists in production

- **WHEN** the read-only audit reports that a legacy Chan table exists
- **THEN** operators MUST capture its exact row count and `SHOW CREATE TABLE`
  output before approving physical deletion
- **AND** table removal MUST be delivered through a separately reviewed
  forward-only cleanup change

### Requirement: Physical column normalization is forward-only and verified

CamelCase-to-snake_case physical renames SHALL be delivered through a new
forward-only migration without modifying migrations 001–009.

#### Scenario: Migration 010 is applied

- **WHEN** the migration runner upgrades a schema at version 009
- **THEN** exactly the approved 26 physical columns MUST be renamed
- **AND** column values, types, nullability, defaults, indexes, FKs, and unique
  constraints MUST remain equivalent

#### Scenario: A fresh database is created

- **WHEN** migrations 001 through 010 execute in order on MySQL 8.4
- **THEN** all migrations MUST succeed
- **AND** the resulting managed schema MUST contain the new snake_case names
  and none of the retired camelCase names

#### Scenario: Production migration is prepared

- **WHEN** operators prepare to apply migration 010
- **THEN** a pre/post information-schema audit and verified backup MUST be
  available
- **AND** the matching application revisions MUST be released atomically

