# chan-bi-algorithm-hygiene Specification

## Purpose

Track the completed P2 Chan Bi range-aggregation hygiene remediation so future
algorithm work keeps the shared range boundary and its regression coverage.
## Requirements
### Requirement: Bi range aggregation is single-sourced

The Chan Bi algorithm SHALL compute merged-K range statistics through one
shared helper or helper module instead of repeating the same range scan in each
Bi construction path.

#### Scenario: Complete Bi construction uses shared range statistics

- **WHEN** a complete candidate Bi is built from two fenxings
- **THEN** the Bi highest, lowest, origin IDs, origin data, and independent
  count MUST come from the shared range aggregation boundary
- **AND** focused tests MUST prove the produced fields match the current
  behavior for a representative merged-K range

#### Scenario: Merged Bi construction uses shared range statistics

- **WHEN** two-Bi or three-Bi merge paths build a replacement Bi
- **THEN** they MUST reuse the same range aggregation boundary
- **AND** tests MUST cover both merge paths or their shared construction helper

#### Scenario: Unfinished Bi construction uses shared range statistics

- **WHEN** the final unfinished Bi is built or extended from the previous Bi
- **THEN** its new origin IDs, origin data, highest, lowest, and independent
  count MUST preserve current behavior while reusing the shared aggregation
  boundary

### Requirement: Chan Bi behavior remains externally stable

The hygiene refactor SHALL preserve Chan Bi algorithm values and ordering for existing calculations. The separately
approved HTTP contract migration MAY rename public price interval fields from `highest/lowest` to `high/low`, but
MUST NOT alter the underlying extrema or Bi reduction behavior.

#### Scenario: Public getBi behavior is characterized

- **WHEN** `BiService.getBi` or its ChanCore replacement runs against a focused merged-K fixture
- **THEN** the resulting Bi sequence MUST preserve the same extrema, origin, status and ordering before and after
  the refactor
- **AND** the current HTTP representation MUST expose those extrema as `high/low`
- **AND** the test MUST not depend on database, datasource, or HTTP services

#### Scenario: Review evidence is explicit

- **WHEN** this batch is completed
- **THEN** its evidence MUST map the prior hygiene findings and the approved field migration to changed files and
  verification commands
- **AND** the implementation MUST NOT claim unrelated Chan algorithm items are complete
