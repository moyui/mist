## ADDED Requirements

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
