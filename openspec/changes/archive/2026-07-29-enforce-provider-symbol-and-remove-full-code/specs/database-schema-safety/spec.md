## ADDED Requirements

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
