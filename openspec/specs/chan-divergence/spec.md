# chan-divergence Specification

## Purpose
Define divergence (背驰) detection as a shared pure ChanCore function reusable across Bi-level and
Duan-level structures, comparing caller-computed per-unit force values for consolidation and trend
divergence without computing momentum indicators itself.
## Requirements
### Requirement: ChanCore Shall Detect Divergence As A Shared Pure Function

ChanCore SHALL expose a stateless `detectDivergences(input)` facade that detects divergence (背驰) as a
shared pure function reusable across Bi-level and Duan-level structures. The input SHALL carry the unit
sequence (Bi or Duan), the Channel sequence (Bi-level or Duan-level) and caller-computed per-unit force values;
ChanCore SHALL NOT compute MACD or any momentum indicator itself. Each unit's force SHALL carry two positive
scalars — directional histogram area (red bars for up, green bars for down, per lesson 24) and absolute
yellow-white-line (DIF) peak (per lesson 25) — and ChanCore SHALL only compare them numerically without
direction awareness. Both trend divergence and consolidation divergence SHALL be detected: consolidation
divergence compares a Channel's entering unit with its leaving unit, and trend divergence compares the force
of the LAST Channel of a same-direction Channel chain.

#### Scenario: A caller requests divergence detection
- **WHEN** a caller requests divergence output
- **THEN** it MUST invoke `ChanCore.detectDivergences` with a `ChanDivergenceInput`
- **AND** the input MUST include the unit sequence, the Channel sequence and per-unit force values
- **AND** ChanCore MUST NOT compute momentum indicators (the caller supplies force values)
- **AND** the recommended force source is the shared indicator computation core (`@app/indicators`:
  `computeUnitDirectionalAreas` for directional area and `computeUnitLinePeaks` with direction-absolute
  selection for the DIF peak)

#### Scenario: Units and Channels of either level are accepted
- **WHEN** a caller supplies Bi units with Bi-level Channels
- **THEN** `detectDivergences` MUST accept them through the minimal structural interfaces
- **WHEN** a caller supplies Duan units with Duan-level Channels
- **THEN** `detectDivergences` MUST accept them through the same minimal structural interfaces

#### Scenario: Consolidation divergence is detected
- **WHEN** a Channel has both an entering unit (the unit immediately before it) and a leaving unit (the unit
  immediately after it)
- **THEN** a consolidation divergence MUST be reported when the leaving unit's force is strictly less than the
  entering unit's force
- **AND** the result MUST carry `type=consolidation`, the Channel index, the entering/leaving unit indices and
  both force values

#### Scenario: Trend divergence is detected
- **WHEN** at least two same-direction Channels form a contiguous chain
- **THEN** the chain SHALL be constructed from Channel time order: a Channel's direction is the trend of
  its leaving unit (equivalent to its entering unit's trend), and consecutive same-direction Channels
  (the second Channel higher for an up chain / lower for a down chain — position progress) SHALL belong to
  the same chain; a chain of length 2 or more constitutes a trend (a lone Channel only participates in
  consolidation divergence)
- **AND** a trend divergence MUST be reported for the chain's LAST Channel (the 24-lesson B Channel)
  comparing its OWN entering unit (A segment) with its OWN leaving unit (C segment), both in the trend
  direction — directional area and absolute yellow-white-line peak of the leaving unit are BOTH strictly
  weaker than the entering unit's
- **AND** the result MUST carry `type=trend` and the associated indices and force values

#### Scenario: A Channel without an entering or leaving unit is skipped
- **WHEN** a Channel sits at the beginning or the end of the unit sequence (no entering or leaving unit)
- **THEN** it MUST be skipped and MUST NOT produce a divergence result

#### Scenario: Force comparison uses strict inequality on both components
- **WHEN** the leaving force is compared to the entering force
- **THEN** divergence MUST be reported only when the leaving unit's area AND its peak are BOTH strictly less
  than the entering unit's (strict less-than on each component, no epsilon)
- **AND** when either component equals or exceeds, it MUST NOT be reported as divergence

#### Scenario: Trend chain requires position progress and treats expanded Channels as ordinary
- **WHEN** two same-direction Channels are candidates for the same trend chain
- **THEN** the later Channel MUST progress in the trend direction (up: `later.gg > earlier.gg` and
  `later.dd > earlier.dd`; down: symmetric) — when it does not, the chain MUST break between them
- **AND** the chain MUST NOT require its own non-expansion check: central expansion is resolved upstream by
  the `chan-central-extension` capability (no expansion pair remains; a zone-overlapping adjacent pair may
  retain overlapping wave ranges and then simply breaks the chain here via position progress), and an
  expansion-merged Channel (`expanded=true`) is a same-level Channel treated like any ordinary Channel

#### Scenario: Results are ordered and deterministic
- **WHEN** `detectDivergences` returns its results
- **THEN** they MUST be ordered by Channel index
- **AND** repeated calls with the same input MUST return the same structure, values and ordering
- **AND** the input MUST NOT be mutated

#### Scenario: An empty input is evaluated
- **WHEN** `detectDivergences` receives an input with no units or no Channels
- **THEN** it MUST return `[]`
- **AND** no empty result MUST be represented as a database, contract or algorithm error
