# chan-duan-channel Specification Delta

## MODIFIED Requirements
### Requirement: ChanCore Shall Derive Duan-Level Channels From Duan

ChanCore SHALL expose a stateless `createDuanChannels(duans)` facade that derives Duan-level Channels
(段级中枢) from the Duan sequence returned by `createDuan`. The algorithm SHALL mirror the Bi-level Channel
structure (Phase A fixed 3-Duan sliding window, Phase B extension and overlap merge with the shared `mergeSpans`
driver) but SHALL use a directionless symmetric-overlap geometry, because a Channel (中枢) is a region formed by
the overlap of at least three consecutive sub-level trend types and has no direction of its own. A Duan-level
Channel MUST carry `level = ChannelLevel.Duan`, wiring the previously unused enum variant. The derivation SHALL
consume **only confirmed-and-valid Duan** (`status === Valid`; 现时等价于 `endBi !== null` 且
`type=complete`,由断言锁定等价): an unconfirmed tail Duan
(「最后一段还没形成」) remains a first-class `createDuan` output for data presentation, but SHALL NOT participate
in Phase A enumeration, Phase B extension or overlap merging — unconfirmed boundaries cannot give objective
central-zone geometry. This is the lesson-72 distinction: only the segment that has met the destruction/confirmation
standard is "不可更改" and may enter structural statistics.

#### Scenario: A caller requests Duan-level Channel analysis
- **WHEN** a caller requests Duan-level Channel output
- **THEN** it MUST invoke `ChanCore.createDuanChannels` with the `ChanDuan[]` returned by `createDuan`
- **AND** it MUST NOT derive Duan internally from raw K or Bi (the caller composes
  `createDuanChannels(createDuan(createBi(k).phaseB))`)

#### Scenario: A Duan-level Channel is emitted
- **WHEN** `createDuanChannels` emits a Duan-level Channel
- **THEN** it MUST contain the full contributing `duans`, `zg/zd/gg/dd`, `level=duan`, `type`, `status`
  and boundary/display IDs
- **AND** it MUST NOT contain a `trend` field (a Channel is a directionless overlap region)
- **AND** `startId/endId/displayStartId/displayEndId` MUST identify raw K values rather than array positions
- **AND** no algorithm or caller MUST perform position arithmetic on those IDs

#### Scenario: Duan-level Channel geometry is the symmetric overlap
- **WHEN** the geometry of a Duan-level Channel is computed
- **THEN** `zg` MUST equal the minimum high of the constituent Duan, `zd` MUST equal the maximum low,
  `gg` MUST equal the maximum high and `dd` MUST equal the minimum low
- **AND** the validity rule MUST be `zg > zd` with at least three constituent Duan
- **AND** there MUST be no entry/exit breakout constraint and no directional front/back split

#### Scenario: A Duan-level Channel with equal upper and lower bound is invalid
- **WHEN** a candidate Duan-level Channel resolves `zg === zd`
- **THEN** it MUST remain invalid and MUST NOT appear in Phase B output

#### Scenario: Duan-level Channel Phase A enumerates with a three-Duan window
- **WHEN** Phase A scans the Duan sequence
- **THEN** it MUST attempt a base Duan-level Channel at every start position with a fixed 3-Duan window
- **AND** a candidate MUST require alternating Duan trends and the symmetric overlap `zg > zd`

#### Scenario: Duan-level Channel Phase B extends and merges to a fixed point
- **WHEN** Phase B processes the Phase A candidates
- **THEN** it MUST extend each candidate head/tail by pairs of Duan while the recomputed symmetric overlap
  stays valid
- **AND** it MUST overlap-merge candidates that overlap in time and price using the short-span-first,
  left-most-first fixed-point ordering of `mergeSpans`
- **AND** Phase B MUST contain only the retained final valid Duan-level Channels

#### Scenario: An unconfirmed tail Duan does not participate in Duan-level Channel derivation
- **WHEN** `createDuanChannels` receives a Duan sequence whose tail Duan is unconfirmed
  (`endBi === null`, `type=uncomplete` — 「最后一段还没形成」)
- **THEN** that tail Duan MUST NOT enter Phase A enumeration, Phase B extension or overlap merging
- **AND** the output MUST equal running the derivation on the sequence with the unconfirmed tail removed
- **AND** `createDuan` itself MUST keep emitting the unconfirmed tail Duan (it is first-class data output)
- **AND** the Bi-level Duan sequence (`createBi` phaseB) tail Bi, when unconfirmed (`type=uncomplete`),
  MUST likewise not be relied upon by any structural statistics; the Bi-level Channel path is already
  equivalent because an unconfirmed tail Bi cannot complete a three-Bi overlap, and MUST remain so

#### Scenario: An empty Duan sequence is evaluated
- **WHEN** `createDuanChannels` receives an empty `ChanDuan[]`
- **THEN** it MUST return `{ phaseA: [], phaseB: [] }`
- **AND** no empty result MUST be represented as a database, contract or algorithm error

### Requirement: Duan-Level Channel Output Shall Not Alter Existing Chan Output

Introducing Duan-level Channels SHALL NOT alter the output of the existing
`mergeK/findFenxings/createBi/createChannels/createDuan` facades, and SHALL wire `ChannelLevel.Duan` only
through the new `createDuanChannels` facade. The Duan-level Channel implementation SHALL be independent of the
Bi-level Channel calculator (no generalization of the frozen Bi-level geometry). `createDuan` output itself
(including the unconfirmed tail Duan) SHALL remain unchanged; only its **consumption** by structural statistics
and visualization is filtered to confirmed units. The visualization layer SHALL NOT render units that the
structural statistics exclude (unconfirmed tail Duan/Bi or anything derived from them).

#### Scenario: Existing facades are replayed after Duan-level Channel introduction
- **WHEN** the same approved ordered input is supplied to `mergeK/findFenxings/createBi/createChannels/createDuan`
- **THEN** their output MUST equal the pre-Duan-level-Channel full-output fingerprint exactly
- **AND** `ChanCore.algorithmVersion` MUST advance monotonically with each algorithm-behavior change and stay in
  lockstep with the characterization fingerprint

#### Scenario: The Duan-level Channel implementation stays independent of the Bi-level calculator
- **WHEN** the Duan-level Channel path is implemented
- **THEN** it MUST NOT modify the Bi-level `ChannelCalculator` or its directional geometry
- **AND** it MAY reuse the shared generic `mergeSpans` driver

#### Scenario: The Duan-level Channel enum is wired
- **WHEN** `createDuanChannels` emits a Duan-level Channel
- **THEN** its `level` MUST be `ChannelLevel.Duan`, replacing the previous unused placeholder semantics

#### Scenario: Unconfirmed or invalid units are not rendered by the visualization layer
- **WHEN** the Chan visualization adapter maps Chan structures (Bi/Duan/Channels) to display commands
- **THEN** it MUST NOT emit draw commands for units that are not confirmed-and-valid: an unconfirmed tail Bi
  (`type=uncomplete` / `status=unknown`), an invalid Bi (宽笔校验失败, `status=invalid`), an unconfirmed tail
  Duan (`endBi === null` / `status=unknown`), or a Duan-level Channel whose constituent set includes such a unit
- **AND** confirmed-and-valid structures MUST render exactly as before