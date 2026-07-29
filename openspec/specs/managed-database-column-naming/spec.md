# managed-database-column-naming Specification

## Purpose
TBD - created by archiving change normalize-managed-database-column-names. Update Purpose after archive.
## Requirements
### Requirement: Managed MySQL physical columns use snake_case

All columns managed by the current Mist entities SHALL use lowercase
snake_case physical names. TypeScript properties MAY remain camelCase when they
declare an explicit physical-column mapping.

#### Scenario: Entity property has multiple words

- **WHEN** a managed entity property such as `formatCode` or `turnoverAmount`
  maps to MySQL
- **THEN** its physical column MUST be `format_code` or `turnover_amount`
- **AND** the TypeScript property name MUST remain unchanged unless separately
  approved as an application-contract change

#### Scenario: Current schema is inspected after migration

- **WHEN** information-schema columns for managed Mist tables are scanned
- **THEN** no physical column name may contain an uppercase ASCII letter

### Requirement: Boundary names remain stable

Physical-column normalization SHALL NOT rename provider-native fields, API/WS
JSON fields, DTO fields, or TypeScript domain properties.

#### Scenario: Provider data is normalized and persisted

- **WHEN** a provider response uses its established native or adapter field
  name
- **THEN** the adapter and TypeScript contracts MUST preserve their existing
  names
- **AND** TypeORM MUST map the entity property to the snake_case physical column

### Requirement: Physical rename is one-version and fail-closed

The application SHALL support only the post-migration physical schema after
this change and MUST NOT add aliases, views, dual writes, or fallback reads for
retired camelCase column names.

#### Scenario: Old application and new schema are mixed

- **WHEN** an old application revision queries a database after migration 010
- **THEN** the combination is unsupported
- **AND** rollback MUST restore the matching database backup and application
  revision together

