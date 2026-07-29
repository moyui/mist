## ADDED Requirements

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
