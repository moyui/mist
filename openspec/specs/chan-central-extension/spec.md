# chan-central-extension Specification

## Purpose
Define central expansion (中枢扩张) resolution for Bi-level and Duan-level Channel Phase B output, so no
adjacent same-level Channels overlap or touch in wave range and merged expansion Centrals carry an explicit
`expanded` marker, while leaving the other Chan facades unchanged.
## Requirements
### Requirement: ChanCore Shall Resolve Channel Central Expansion At Both Levels

`ChanCore.createChannels` (Bi-level) and `ChanCore.createDuanChannels` (Duan-level) SHALL recognize
central expansion (中枢扩张) between adjacent same-level Channels and resolve it so that each Phase B
output contains **no pair of adjacent same-level Channels whose wave ranges (`dd..gg`) overlap or touch**.
A Chan (中枢) is a directionless overlap region (17 课), so expansion is judged by the wave range
(`gg`/`dd`), not the central zone (`zg`/`zd`); two adjacent same-level Channels whose wave ranges overlap
or touch belong to one expanded higher-level Central (29 课 级别扩展), not to a same-level trend chain.
The resolution SHALL merge an expanded adjacent pair into a single higher-level Central carrying an
explicit `expanded` marker, iterating to a fixed point. This provides the clean non-overlapping Channel
input that trend-chain (背驰) consumption requires at both levels, and MUST NOT alter the output of
`mergeK/findFenxings/createBi/createDuan`.

#### Scenario: Adjacent same-level Channels with overlapping or touching wave ranges are resolved
- **WHEN** either `createChannels` or `createDuanChannels` produces a Phase B sequence in which two
  adjacent same-level Channels overlap or touch in wave range (`isCentralExpansion` holds)
- **THEN** the expansion MUST be resolved so no adjacent pair in Phase B has overlapping or touching
  wave ranges
- **AND** the resolution MUST merge the expanded pair into a single higher-level Central (or otherwise
  remove the same-level overlap) and continue to a fixed point
- **AND** `phaseA` MUST remain the raw enumerated candidates (unchanged) at both levels

#### Scenario: Expansion is judged by wave range overlap with touch counting
- **WHEN** `isCentralExpansion(prev, next)` evaluates two adjacent same-level Channels
- **THEN** it MUST use the wave-range extrema (`dd`/`gg`) through a minimal structural interface that is
  independent of Channel level (Bi or Duan)
- **AND** expansion MUST hold when `max(prev.dd, next.dd) <= min(prev.gg, next.gg)` — a pure touch where
  `max(dd) === min(gg)` counts as expansion too (缠论 29 课：最弱即触及波动边沿)
- **AND** the predicate MUST be a pure deterministic function with no I/O

#### Scenario: The merged expansion Central carries explicit expanded geometry
- **WHEN** two adjacent same-level Channels are merged as an expansion
- **THEN** the merged Central MUST contain the union of both subunits (identity-deduplicated by start
  time) and MUST carry `expanded: true`
- **AND** its `zd/zg` MUST equal the wave-overlap zone (`zd = max(prev.dd, next.dd)`,
  `zg = min(prev.gg, next.gg)`) and its `dd/gg` MUST equal the union extrema
  (`dd = min(prev.dd, next.dd)`, `gg = max(prev.gg, next.gg)`)
- **AND** it MUST NOT be required to satisfy the normal geometry invariant of the level (Duan symmetric
  overlap `zg > zd`; Bi directional front/back formula with entry/exit breakout), because it is a
  higher-level Unit rather than an ordinary same-level Central
- **AND** a Bi-level merged Unit MUST retain the leading subunit's `trend`
- **AND** its boundary IDs MUST come from `prev` (start) and `next` (end)

#### Scenario: A non-expanded Channel is not altered
- **WHEN** a Channel in Phase B is not part of any expansion
- **THEN** it MUST remain unchanged in the resolved Phase B output, including `expanded: false`

#### Scenario: Phase B resolution guarantees strict adjacent separation and determinism
- **WHEN** `createChannels` or `createDuanChannels` returns its resolved Phase B sequence
- **THEN** every adjacent pair MUST satisfy `max(prev.dd, next.dd) > min(prev.gg, next.gg)`
  (strictly separated wave ranges — neither overlap nor touch, because touch also expands)
- **AND** repeated calls with the same input MUST return the same structure, values and ordering
- **AND** the input MUST NOT be mutated

#### Scenario: An empty input is evaluated
- **WHEN** a calculator receives an empty sequence of Bi or Duan
- **THEN** it MUST return `{ phaseA: [], phaseB: [] }`
- **AND** the new guarantees MUST be satisfied vacuously

#### Scenario: Existing Chan output and algorithm version change together
- **WHEN** expansion handling is introduced at both levels
- **THEN** the output of `mergeK/findFenxings/createBi/createDuan` MUST equal the pre-expansion
  full-output fingerprint exactly
- **AND** `ChanCore.algorithmVersion` MUST increment from `1` to `2` and the full-output fingerprint
  MUST be updated and explained in the same owning change (because the existing `createChannels` and
  `createDuanChannels` face output semantics changed)
