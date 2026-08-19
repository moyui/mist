# strategy-evaluation-contract Specification

## ADDED Requirements

### Requirement: Strategy Indicator Observations Shall Be Computed By The Shared Indicator Core

The shared Strategy evaluator SHALL compute KDJ and MACD observations by delegating to the
`@app/indicators` anchor-observation functions over the exact catalog window (KDJ 13, MACD 130) with an
explicit `windowSize`, retaining the exact-window validation, finite-value guards, fixed parameters
`(9,3,3)`/`(12,26,9)`, the `calculationBarCount` (including `crossesAbove`/`crossesBelow` +1) and the
shared observation cache. Neither the analysis layer, the evaluator nor a backtest/realtime runtime
SHALL import `technicalindicators` directly.

#### Scenario: A MACD observation is computed at an anchor
- **WHEN** a MACD condition is evaluated at ordered bar anchor `t`
- **THEN** its current observation MUST be `computeMacdObservation(closes, { windowSize: 130 })` over
  exactly `K[t-129...t]`
- **AND** a crossover prior observation MUST be `computeMacdObservation(closes, { windowSize: 130 })`
  over exactly `K[t-130...t-1]`
- **AND** the evaluator MUST NOT substitute an infinite-history continuation, a persistent EMA
  checkpoint or a differently seeded calculation

#### Scenario: A KDJ observation is computed at an anchor
- **WHEN** a KDJ condition is evaluated at ordered bar anchor `t`
- **THEN** its current observation MUST be `computeKdjObservation(high, low, close, { windowSize: 13 })`
  over exactly `K[t-12...t]`
- **AND** a crossover prior observation MUST be `computeKdjObservation(..., { windowSize: 13 })` over
  exactly `K[t-13...t-1]`

#### Scenario: The evaluator delegates rather than re-implements
- **WHEN** the analysis layer computes KDJ or MACD observations
- **THEN** it MUST delegate to `@app/indicators`
- **AND** the analysis layer, evaluator and runtimes MUST NOT import `technicalindicators`