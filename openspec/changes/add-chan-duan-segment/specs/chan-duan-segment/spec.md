# chan-duan-segment Specification

## ADDED Requirements

### Requirement: ChanCore Shall Derive Duan From Bi Via The Standard Characteristic-Sequence Method

ChanCore SHALL expose a stateless `createDuan(bis)` facade that consumes the `ChanBiTwoPhaseResult` returned by
`createBi` (the two-phase Bi result, not raw K and not Phase B alone) and derives Duan (段, segment) using the
standard characteristic-sequence method (缠论 line-segment division). The implementation SHALL follow the orthodox
algorithm: maintain the current segment direction and its characteristic sequence, process characteristic-sequence
inclusion, identify the directional fenxing, and confirm segment termination through the two gap cases (the second
case requiring retrospective confirmation).

#### Scenario: A Duan is derived from Bi
- **WHEN** a caller passes the `ChanBiTwoPhaseResult` returned by `createBi` to `createDuan`
- **THEN** it MUST consume Bi Phase B from that result before deriving Duan
- **AND** it MUST NOT re-derive Bi from raw K or with a different algorithm than `createBi`
- **AND** the Duan algorithm MUST be the single-pass characteristic-sequence method, NOT the span-merge (`mergeSpans`)
  fixed-point mechanism used by Bi Phase B and Channel

#### Scenario: The characteristic sequence is constructed
- **WHEN** an upward segment is in progress
- **THEN** its characteristic sequence MUST consist of the downward Bi, each element carrying that Bi's high/low
- **WHEN** a downward segment is in progress
- **THEN** its characteristic sequence MUST consist of the upward Bi, each element carrying that Bi's high/low

#### Scenario: Characteristic-sequence inclusion is processed
- **WHEN** two adjacent characteristic-sequence elements have an overlapping interval
- **THEN** they MUST be merged using the same directional inclusion rule as K-line containment
- **AND** the post-inclusion sequence (standard characteristic sequence) MUST be the basis for fenxing detection

#### Scenario: A directional fenxing is identified
- **WHEN** the standard characteristic sequence is evaluated for an upward segment
- **THEN** it MUST consider only top fenxing
- **WHEN** the standard characteristic sequence is evaluated for a downward segment
- **THEN** it MUST consider only bottom fenxing

#### Scenario: Termination is confirmed without a gap (first case)
- **WHEN** a characteristic-sequence fenxing forms and its first and second elements have NO gap (their intervals
  overlap)
- **THEN** the segment MUST be confirmed to terminate at the fenxing extremum
- **AND** a new segment of the opposite direction MUST begin

#### Scenario: Termination awaits retrospective confirmation with a gap (second case)
- **WHEN** a characteristic-sequence fenxing forms and its first and second elements HAVE a gap (disjoint intervals)
- **THEN** the segment MUST enter a pending state and MUST NOT be confirmed yet
- **AND** it MUST be confirmed only when the opposite-direction characteristic sequence starting after the fenxing
  extremum also forms its directional fenxing
- **AND** if that opposite-direction confirmation never forms, the segment MUST continue to extend

#### Scenario: An incomplete tail Duan is emitted
- **WHEN** the Bi sequence ends before a segment termination is confirmed (including an unconfirmed pending state)
- **THEN** the tail Duan MUST use `type=uncomplete`, `status=unknown` and `endBi=null`
- **AND** `startBi` MAY be the preceding confirmed Duan endpoint Bi or `null` when no Duan has formed

#### Scenario: Duan numeric and identity comparisons
- **WHEN** ChanCore evaluates Duan geometry, characteristic-sequence intervals, gaps or fenxing extrema
- **THEN** it MUST preserve the existing strict and non-strict JavaScript number comparisons
- **AND** it MUST NOT introduce epsilon equality, rounding, tick normalization or Decimal conversion
- **AND** `volume/amount` MUST NOT participate in Duan decisions

### Requirement: ChanDuan Output Contract Shall Mirror ChanBi

`createDuan` SHALL return a flat `readonly ChanDuan[]` (no phaseA/phaseB envelope) containing the confirmed Duan
sequence. `ChanDuan` SHALL mirror `ChanBi`'s field structure, with endpoint Bi in place of endpoint Fenxing and
constituent Bi in place of constituent raw K. The characteristic sequence and its fenxings are internal algorithm
intermediates and SHALL NOT be exposed as separate result fields.

#### Scenario: A complete Duan is emitted
- **WHEN** `createDuan` emits a complete `ChanDuan`
- **THEN** it MUST contain endpoint `startTime/endTime`, algorithm-derived `high/low`, `trend`, `type`, `status`,
  `independentCount`, ordered identity-deduplicated `originIds`, the constituent `originBis` and both endpoint Bi
  (`startBi`/`endBi`)
- **AND** `originIds` MUST identify the raw K values covered by the constituent Bi
- **AND** `startBi` and `endBi` MUST both be non-null for a complete Duan

#### Scenario: The confirmed Duan list is returned
- **WHEN** `createDuan` completes its characteristic-sequence fenxing detection and gap-case retrospection
- **THEN** it MUST return the confirmed Duan as a flat `ChanDuan[]` in temporal order
- **AND** each Duan MUST be either a confirmed complete Duan or the final uncomplete tail Duan
- **AND** callers MUST NOT need to flatten, merge or select a phase

#### Scenario: An empty Bi result is evaluated
- **WHEN** `createDuan` receives a `ChanBiTwoPhaseResult` whose Phase B is empty
- **THEN** it MUST return `[]`
- **AND** no empty result MUST be represented as a database, contract or algorithm error

### Requirement: Existing Chan Output Shall Remain Unchanged By Duan Introduction

Introducing Duan SHALL NOT alter the output of the existing `mergeK/findFenxings/createBi/createChannels` facades,
and SHALL NOT wire the `ChannelLevel.Duan` enum (reserved for the deferred Duan-level Channel change).

#### Scenario: Existing facades are replayed after Duan introduction
- **WHEN** the same approved ordered input is supplied to `mergeK/findFenxings/createBi/createChannels`
- **THEN** their output MUST equal the pre-Duan full-output fingerprint exactly
- **AND** `ChanCore.algorithmVersion` MUST remain `1`

#### Scenario: The Duan-level Channel enum stays unwired
- **WHEN** Duan is introduced without a Duan-level Channel
- **THEN** `ChannelLevel.Duan` MUST remain an unused placeholder enum variant
- **AND** the existing Bi-level Channel scope requirement MUST remain unchanged
