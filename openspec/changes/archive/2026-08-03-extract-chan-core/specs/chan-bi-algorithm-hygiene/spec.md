## MODIFIED Requirements

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
