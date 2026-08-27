# chan-bi-width-validation Specification

## Purpose
Define wide-Bi distance validation as ordered raw-K positions inside `originData`, not database-ID arithmetic, preserving identity boundaries and failing closed on missing or ambiguous Fenxing positions.
## Requirements
### Requirement: Wide Bi Distance Shall Use Ordered Raw K Positions

The Chan Bi algorithm SHALL determine the number of raw K values between two Fenxing extremes from their
positions in the candidate Bi's ordered `originData`. It MUST NOT interpret database K identity values as a
sequence distance.

#### Scenario: Adjacent raw K values have a large identity gap

- **WHEN** two Fenxing extreme K values are adjacent in ordered `originData` but their database IDs are far apart
- **THEN** the algorithm MUST calculate zero raw K values between them
- **AND** it MUST NOT accept the candidate as wide solely because of the ID gap

#### Scenario: The width boundary is evaluated

- **WHEN** exactly three ordered raw K values exist between the two Fenxing extremes
- **THEN** the distance condition MUST pass
- **AND** when fewer than three exist, the distance condition MUST fail

#### Scenario: Identity values are replaced without changing order

- **WHEN** the same ordered price and time series is evaluated once with consecutive IDs and once with arbitrary
  gapped or interleaved IDs
- **THEN** the non-identity Bi structure and validity MUST be the same
- **AND** identity-bearing output fields MUST still contain the actual IDs supplied by each input

### Requirement: Wide Bi Position Resolution Shall Preserve Identity Boundaries

Database `K.id`, `middleOriginId`, `originIds` and Channel boundary IDs SHALL remain persistence identities only.
Any temporary position used by width validation SHALL remain internal to the algorithm call and SHALL NOT be
serialized, persisted or exposed as a public ordinal.

#### Scenario: Fenxing extremes are resolved inside a candidate

- **WHEN** width validation locates `startFenxing.middleOriginId` and `endFenxing.middleOriginId`
- **THEN** it MUST use those IDs only to locate their entries in ordered `originData`
- **AND** the numeric difference between the IDs MUST NOT affect the distance result

#### Scenario: A Fenxing identity is missing or ambiguous

- **WHEN** either Fenxing extreme ID is absent from `originData` or occurs more than once
- **THEN** the algorithm MUST raise an internal invariant error identifying the conflicting ID
- **AND** it MUST NOT fall back to ID arithmetic or silently mark the candidate valid

#### Scenario: Public contracts are inspected after the fix

- **WHEN** Chan HTTP DTO/VO, database schema and persisted records are compared before and after the change
- **THEN** no new position or ordinal field MUST exist
- **AND** all retained identity fields and Phase A/Phase B response shapes MUST remain unchanged

