# chan-central-extension Specification

## MODIFIED Requirements

### Requirement: ChanCore Shall Resolve Channel Central Expansion At Both Levels

`ChanCore.createChannels` (Bi-level) and `ChanCore.createDuanChannels` (Duan-level) SHALL recognize
central expansion (中枢扩张) between adjacent same-level Channels and resolve it so that each Phase B
output contains **no pair of adjacent same-level Channels that satisfies the expansion condition**.
Per 缠论 20 课中心定理二, expansion (forming a higher-level Central) holds exactly when two adjacent
same-level Channels have **strictly separated central zones** (`max(prev.zd, next.zd) > min(prev.zg, next.zg)`:
`后ZG < 前ZD` or `后ZD > 前ZG`) **and** overlapping or touching wave ranges
(`max(prev.dd, next.dd) <= min(prev.gg, next.gg)`: `后GG >= 前DD` or `后DD <= 前GG`). A pair whose
central zones overlap belongs to the same zone region revisited (中心定理一: extension/overlap of the
same Central), and is NOT an expansion regardless of wave-range overlap. The resolution SHALL merge an
expanded adjacent pair into a single higher-level Central carrying an explicit `expanded` marker,
iterating to a fixed point. This provides the clean non-overlapping Channel input that trend-chain
(背驰) consumption requires at both levels, and MUST NOT alter the output of
`mergeK/findFenxings/createBi/createDuan`.

#### Scenario: Adjacent same-level Channels satisfying the expansion condition are resolved
- **WHEN** either `createChannels` or `createDuanChannels` produces a Phase B sequence in which two
  adjacent same-level Channels satisfy the expansion condition (strictly separated central zones AND
  overlapping/touching wave ranges, i.e. `isCentralExpansion` holds)
- **THEN** the expansion MUST be resolved so no adjacent pair in Phase B satisfies the expansion
  condition
- **AND** the resolution MUST merge the expanded pair into a single higher-level Central (or otherwise
  remove the same-level wave-range overlap) and continue to a fixed point
- **AND** `phaseA` MUST remain the raw enumerated candidates (unchanged) at both levels

#### Scenario: Expansion is judged by central-zone separation and wave-range overlap
- **WHEN** `isCentralExpansion(prev, next)` evaluates two adjacent same-level Channels
- **THEN** it MUST use both the central-zone boundaries (`zd`/`zg`) and the wave-range extrema
  (`dd`/`gg`) through a minimal structural interface that is independent of Channel level (Bi or Duan)
- **AND** expansion MUST hold only when `max(prev.zd, next.zd) > min(prev.zg, next.zg)` (central zones
  strictly separated; a zone touch `max(zd) === min(zg)` does NOT expand, 缠论 20 课 `后ZG<前ZD` 严格)
  AND `max(prev.dd, next.dd) <= min(prev.gg, next.gg)` (wave ranges overlap or touch — a pure wave
  touch `max(dd) === min(gg)` counts as expansion too)
- **AND** when the central zones overlap (`max(prev.zd, next.zd) <= min(prev.zg, next.zg)`), expansion
  MUST NOT hold even if the wave ranges overlap or touch (同一区间延伸，非扩张)
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

#### Scenario: Channel extension preserves immutable central zone bounds
- **WHEN** either `createChannels` or `createDuanChannels` extends a base Channel during Phase B
- **THEN** the central zone bounds (`zd` and `zg`) established by the base unit MUST remain unchanged
- **AND** only the wave range extrema (`dd`/`gg`) and boundary IDs/timestamps MAY be updated to reflect the extension

#### Scenario: A non-expanded Channel is not altered
- **WHEN** a Channel in Phase B is not part of any expansion
- **THEN** it MUST remain unchanged in the resolved Phase B output, including `expanded: false`

#### Scenario: Phase B resolution guarantees no expansion pair, determinism and strict separation only for non-overlapping-zone neighbors
- **WHEN** `createChannels` or `createDuanChannels` returns its resolved Phase B sequence
- **THEN** every adjacent pair MUST satisfy `isCentralExpansion(prev, next) === false` — i.e. either
  `max(prev.zd, next.zd) <= min(prev.zg, next.zg)` (central zones overlap: same-zone extension, kept
  as separate Channels) or `max(prev.dd, next.dd) > min(prev.gg, next.gg)` (wave ranges separated)
- **AND** adjacent pairs whose central zones are strictly separated MUST satisfy
  `max(prev.dd, next.dd) > min(prev.gg, next.gg)` (strictly separated wave ranges)
- **AND** repeated calls with the same input MUST return the same structure, values and ordering
- **AND** the input MUST NOT be mutated

#### Scenario: An empty input is evaluated
- **WHEN** a calculator receives an empty sequence of Bi or Duan
- **THEN** it MUST return `{ phaseA: [], phaseB: [] }`
- **AND** the new guarantees MUST be satisfied vacuously

#### Scenario: Existing Chan output and algorithm version change together
- **WHEN** expansion resolution semantics change at both levels
- **THEN** the output of `mergeK/findFenxings/createBi/createDuan` MUST equal the pre-change
  full-output fingerprint exactly
- **AND** `ChanCore.algorithmVersion` MUST increment from `2` to `3` and the full-output fingerprint
  MUST be updated and explained in the same owning change (because `createChannels` and
  `createDuanChannels` output semantics change: zone-overlapping pairs that were previously merged as
  one expanded Central now remain separate ordinary Channels)
