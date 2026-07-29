## ADDED Requirements

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
