# indicators-core Specification

## ADDED Requirements

### Requirement: Indicator Computation Core Shall Provide Stateless MACD Histogram Computation

`@app/indicators` SHALL expose a stateless `computeMacdHistogram(closes)` pure function that computes the
MACD histogram (MACD bar) from a close-price series with the standard 12/26/9 EMA configuration
(fast=12, slow=26, signal=9, EMA oscillator and EMA signal), aligned to the input series by a `begIndex`
(the leading warm-up positions that carry no valid MACD value). The function SHALL have no I/O, no
Nest/TypeORM/environment dependency and SHALL NOT mutate its input.

#### Scenario: A caller computes the MACD histogram from a close series
- **WHEN** a caller supplies an ordered close-price series
- **THEN** `computeMacdHistogram` MUST return `{ begIndex, histogram }`
- **AND** the output MUST be deterministic for identical input
- **AND** the input MUST NOT be mutated

#### Scenario: The public Indicator HTTP endpoint delegates to the pure function
- **WHEN** `IndicatorService.runMACD` computes MACD for `POST /v1/indicators/macd`
- **THEN** it MUST delegate to `computeMacdHistogram`
- **AND** the HTTP response contract (macd/signal/histogram values and `begIndex` semantics) MUST NOT change

### Requirement: Indicator Computation Core Shall Aggregate Unit Force From MACD Histogram

`@app/indicators` SHALL expose a stateless `computeUnitForces(histogram, begIndex, kTimes, units)` pure
function that computes one force value per unit, where a unit's force is the sum of valid histogram values
over the K indices whose times fall inside the unit's `[startTime, endTime]` interval (positions before
`begIndex` are invalid and skipped). A unit with no valid in-interval histogram value SHALL receive force 0.
The function SHALL have no I/O, no Nest/TypeORM/environment dependency and SHALL NOT mutate its inputs.

#### Scenario: A caller aggregates unit force over an interval
- **WHEN** a caller supplies a histogram aligned to K times and units with start/end times
- **THEN** `computeUnitForces` MUST return one force per unit in the same order
- **AND** each force MUST be the sum of valid histogram values over the unit's K interval
- **AND** units entirely inside the warm-up (before `begIndex`) MUST receive force 0
- **AND** the inputs MUST NOT be mutated

#### Scenario: A backtest or realtime runtime consumes force without the public Indicator HTTP API
- **WHEN** a backtest or realtime consumer needs unit force values
- **THEN** it MAY import `@app/indicators` directly (pure functions, no HTTP, no database)
- **AND** the runtime MUST NOT depend on the public Indicator HTTP API for force computation
