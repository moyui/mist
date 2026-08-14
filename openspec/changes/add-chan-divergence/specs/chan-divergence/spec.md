# chan-divergence Specification

## ADDED Requirements

### Requirement: ChanCore Shall Detect Divergence As A Shared Pure Function

ChanCore SHALL expose a stateless `detectDivergences(input)` facade that detects divergence (背驰) as a
shared pure function reusable across Bi-level and Duan-level structures. The input SHALL carry the unit
sequence (Bi or Duan), the Channel sequence (Bi-level or Duan-level) and caller-computed per-unit force values;
ChanCore SHALL NOT compute MACD or any momentum indicator itself. Both trend divergence and consolidation
divergence SHALL be detected: consolidation divergence compares a Channel's entering unit with its leaving
unit, and trend divergence compares the force of a same-direction Channel chain.

#### Scenario: A caller requests divergence detection
- **WHEN** a caller requests divergence output
- **THEN** it MUST invoke `ChanCore.detectDivergences` with a `ChanDivergenceInput`
- **AND** the input MUST include the unit sequence, the Channel sequence and per-unit force values
- **AND** ChanCore MUST NOT compute momentum indicators (the caller supplies force values)
- **AND** the recommended force source is the shared indicator computation core (`@app/indicators`
  MACD histogram area aggregation)

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
- **THEN** a trend divergence MUST be reported for the chain's last Channel when its leaving unit's force is
  weaker than the chain's entering force baseline (the chain head Channel's entering unit force)
- **AND** the result MUST carry `type=trend` and the associated indices and force values

#### Scenario: A Channel without an entering or leaving unit is skipped
- **WHEN** a Channel sits at the beginning or the end of the unit sequence (no entering or leaving unit)
- **THEN** it MUST be skipped and MUST NOT produce a divergence result

#### Scenario: Force comparison uses strict inequality
- **WHEN** the leaving force equals the entering force
- **THEN** it MUST NOT be reported as divergence (strict less-than, no epsilon)

#### Scenario: Results are ordered and deterministic
- **WHEN** `detectDivergences` returns its results
- **THEN** they MUST be ordered by Channel index
- **AND** repeated calls with the same input MUST return the same structure, values and ordering
- **AND** the input MUST NOT be mutated

#### Scenario: An empty input is evaluated
- **WHEN** `detectDivergences` receives an input with no units or no Channels
- **THEN** it MUST return `[]`
- **AND** no empty result MUST be represented as a database, contract or algorithm error
