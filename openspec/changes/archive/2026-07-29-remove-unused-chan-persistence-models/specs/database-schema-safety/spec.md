## ADDED Requirements

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
