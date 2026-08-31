# chan-bi-width-validation Specification Delta

## MODIFIED Requirements
### Requirement: Wide Bi Distance Shall Use Ordered Raw K Positions

The Chan Bi algorithm SHALL determine the number of raw K values between two Fenxing extremes from their
positions in the candidate Bi's ordered `originData`. It MUST NOT interpret database K identity values as a
sequence distance. A Bi whose width validation fails SHALL carry `status=invalid` and SHALL NOT be treated as
a structural unit by statistics or visualization consumers: such units (together with unconfirmed
`status=unknown` tail Bi) SHALL be excluded from Bi-level Channel derivation input, from Bi-level buy/sell-point
unit input and from the visualization layer — the data itself MAY remain in `createBi` output for presentation.

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

#### Scenario: An invalid or unconfirmed Bi is excluded from statistics and visualization

- **WHEN** a Bi fails width validation (`status=invalid`, e.g. a top at 14:05 and a bottom at 14:15 with only
  one raw K between them) or is the unconfirmed tail Bi (`status=unknown`, `type=uncomplete`)
- **THEN** it MUST remain visible in the `createBi` Phase B data output (first-class data, 数据层可显示)
- **AND** it MUST NOT be consumed as a unit by Bi-level Channel derivation: `createChannels` MUST filter
  `status === Valid` at its entry (现状输出与过滤后一致——invalid/unknown 尾笔当前恰好构不成三笔重叠——
  但该性质由显式过滤保证而非数据偶然；回归断言锁定)
- **AND** it MUST NOT be consumed as a unit by Bi-level buy/sell-point pipelines
  (`chan-bsp.pipeline` with `units='bi'` MUST filter `status === Valid` before building units)
- **AND** the visualization layer MUST NOT emit draw commands for it, and MUST NOT render any Bi-level
  Channel whose constituent set includes an invalid or unconfirmed Bi (中枢是"参与计算"的已确认结构，
  含未确认/无效单元的笔中枢不得渲染——画出来即暗示其已被确认计算)
- **AND** the Duan algorithm MAY still read the Phase B array (including invalid Bi) as data input; whether
  invalid Bi ever forms a complete Duan is governed by the Duan consumption rule (segment structure only
  consumes confirmed-and-valid units — see chan-duan-channel), and on current 000001 data invalid Bi land in
  the leading-discard / trailing-uncomplete inert zones

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