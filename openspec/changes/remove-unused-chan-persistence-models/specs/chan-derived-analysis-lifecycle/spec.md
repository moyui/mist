## ADDED Requirements

### Requirement: Chan analysis results are request-time derived data

The Chan service SHALL compute merged K, fenxing, Bi, and channel results from
the supplied K input without reading or writing Chan-result MySQL entities.

#### Scenario: Chan analysis is requested

- **WHEN** a caller supplies valid K input to a Chan calculation endpoint
- **THEN** the service MUST derive the result during the request
- **AND** it MUST NOT require persisted fenxing, Bi, period, or state rows

#### Scenario: The same deterministic input is evaluated again

- **WHEN** the same ordered K input is evaluated with the same algorithm version
- **THEN** the result MUST be reproducible without loading a prior Chan result
  from MySQL

### Requirement: Chan domain contracts are persistence-free

Compile-time Chan analysis contracts SHALL contain only fields used by current
calculation or API behavior and MUST NOT contain TypeORM decorators, audit
columns, persistence-only table identity, or unused algorithm-state fields.

#### Scenario: A derived Chan contract is declared

- **WHEN** the backend declares merged-K, fenxing, Bi, or two-phase result
  structures
- **THEN** the compile-time contract MUST be a TypeScript interface or type
- **AND** an OpenAPI VO MAY remain a runtime class implementing that contract

#### Scenario: Persistence-only legacy models are removed

- **WHEN** the workspace is searched for the retired Chan persistence models
- **THEN** no TypeORM entity, repository, table decorator, or application
  entity registration for them may remain

### Requirement: Chan API behavior remains stable

Removing persistence-shaped classes SHALL NOT change the current public Chan
response shapes or Phase A/Phase B algorithm behavior.

#### Scenario: Focused Chan regressions run

- **WHEN** the Chan calculation and OpenAPI tests execute after removal
- **THEN** existing merged-K, fenxing, Bi, channel, and two-phase expectations
  MUST continue to pass
