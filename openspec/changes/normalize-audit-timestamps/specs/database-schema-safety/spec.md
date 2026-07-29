## MODIFIED Requirements

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
