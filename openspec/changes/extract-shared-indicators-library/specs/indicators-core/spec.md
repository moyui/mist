# indicators-core Specification

## ADDED Requirements

### Requirement: Indicator Computation Core Shall Provide Stateless Series Calculations

`@app/indicators` SHALL expose stateless pure functions `computeMacdSeries`, `computeKdjSeries`,
`computeRsiSeries`, `computeAdxSeries`, `computeAtrSeries` and `computeDualMaSeries` that compute full
indicator series with TA-Lib-style `{begIndex, ...arrays}` output, where `begIndex` marks the leading
positions carrying no valid value and each output array aligns to the input by `out[i] === in[i + begIndex]`.
The fixed default parameters SHALL be MACD(12,26,9 EMA), KDJ(9,3,3), RSI(14), ADX(14), ATR(14) and
DualMA(13,60). Each series function SHALL accept `readonly number[]` inputs, SHALL NOT mutate them, SHALL
copy inputs internally before delegating to the underlying math library, SHALL have no I/O, no
Nest/TypeORM/environment dependency, and SHALL produce deterministic output for identical input. An empty
or insufficient input SHALL return empty output arrays with `begIndex` equal to the input length (no
error).

#### Scenario: A caller computes a full indicator series
- **WHEN** a caller supplies an ordered OHLC or close series
- **THEN** the corresponding `compute*Series` function MUST return `{ begIndex, ...series arrays }`
- **AND** each series array MUST contain only valid values aligned to the input by `begIndex`
- **AND** the output MUST be deterministic and the inputs MUST NOT be mutated

#### Scenario: A caller passes a read-only array
- **WHEN** a caller passes a `readonly number[]` (including a derived or frozen view) to a series
  function
- **THEN** the function MUST accept it without mutation of the caller's array

#### Scenario: A caller uses the fixed default parameters
- **WHEN** a caller invokes a series function without parameter overrides
- **THEN** the calculation MUST use MACD(12,26,9 EMA), KDJ(9,3,3), RSI(14), ADX(14), ATR(14) and
  DualMA(13,60) respectively

### Requirement: Indicator Computation Core Shall Provide Anchor Observations

`@app/indicators` SHALL expose stateless pure functions `computeMacdObservation(closes, opts?)` and
`computeKdjObservation(high, low, close, opts?)` where `opts.windowSize` is optional. Each returns the
trailing scalar observation (`{line, signal, histogram}` / `{k, d, j}`) of the exact-catalog-window
calculation over the supplied input. When `opts.windowSize` is provided the input length SHALL equal it,
otherwise the function SHALL throw `IndicatorInputError`. A non-finite trailing value SHALL throw
`IndicatorValueError`. For identical input and parameters the observation SHALL equal the trailing value
of the corresponding series result, and each function SHALL have no I/O, no Nest/TypeORM/environment
dependency, SHALL NOT mutate its inputs and SHALL be deterministic.

#### Scenario: A caller obtains an anchor observation
- **WHEN** a caller supplies an ordered window of closes (or OHLC triples) ending at the anchor of
  interest
- **THEN** `computeMacdObservation` / `computeKdjObservation` MUST return the trailing scalar observation
- **AND** the observation MUST equal the trailing value of the corresponding `compute*Series` result for
  the same input and parameters

#### Scenario: A caller enforces an exact window
- **WHEN** a caller supplies `opts.windowSize` and the input length differs from it
- **THEN** the function MUST throw `IndicatorInputError`

#### Scenario: The trailing observation is not finite
- **WHEN** the input window is too short to produce a finite trailing value
- **THEN** the function MUST throw `IndicatorValueError`

### Requirement: Public Indicator Endpoints Shall Delegate To The Pure Core

The public Indicator HTTP endpoints (`POST /v1/indicators/macd|kdj|rsi`) SHALL compute their output by
delegating to the `@app/indicators` series functions through the existing `IndicatorService` methods
(thin conversion only: DTO validation, numeric coercion, delegation, assembly), and the HTTP response
contract (series arrays, `begIndex` semantics, `nbElement`) MUST NOT change. The `IndicatorService`
methods `runADX`, `runDualMA` and `runATR` SHALL also delegate to the pure core while preserving their
existing signatures and behavior.

#### Scenario: The public MACD endpoint delegates to the pure function
- **WHEN** `IndicatorService.runMACD` computes MACD for `POST /v1/indicators/macd`
- **THEN** it MUST delegate to `computeMacdSeries`
- **AND** the HTTP response contract (macd/signal/histogram values and `begIndex` semantics) MUST NOT change

#### Scenario: The public KDJ and RSI endpoints delegate to the pure functions
- **WHEN** `IndicatorService.runKDJ` or `IndicatorService.runRSI` computes output for
  `POST /v1/indicators/kdj|rsi`
- **THEN** each MUST delegate to the corresponding `compute*Series` function
- **AND** the HTTP response contract MUST NOT change

#### Scenario: The endpoint response is aligned to the K series
- **WHEN** a public MACD/KDJ/RSI endpoint produces its response array
- **THEN** it MUST return one entry per input K bar with `formatIndicator` NaN alignment for warm-up
  positions
- **AND** the delegated series values MUST preserve the current HTTP contract identically

#### Scenario: The KDJ endpoint uses the catalog parameters
- **WHEN** `IndicatorService.runKDJ` computes KDJ for `POST /v1/indicators/kdj`
- **THEN** it MUST delegate with the core default parameters `(9,3,3)`
- **AND** the historical controller override `period: 14` MUST be removed as a deliberate API
  behaviour fix (the only public API output change of this change)

#### Scenario: A legacy no-route method delegates
- **WHEN** `IndicatorService.runADX`, `runDualMA` or `runATR` is invoked by any caller
- **THEN** it MUST delegate to the corresponding series function
- **AND** its method signature and returned shape MUST NOT change

### Requirement: The Indicator Dependency Shall Be Confined To The Core

The `technicalindicators` package SHALL be imported only by `libs/indicators` source files. Any other
library or application SHALL consume indicator math through `@app/indicators` pure functions; a
backtest or realtime runtime MAY import `@app/indicators` directly (pure functions, no HTTP, no
database) and MUST NOT depend on the public Indicator HTTP API for indicator computation.

#### Scenario: The repository is scanned for the indicator dependency
- **WHEN** all `libs/**` and `apps/**` TypeScript sources are scanned for `technicalindicators`
  imports
- **THEN** only files under `libs/indicators` MUST contain such an import

#### Scenario: A runtime consumes indicator values without the public Indicator HTTP API
- **WHEN** a backtest or realtime consumer needs indicator values
- **THEN** it MAY import `@app/indicators` directly
- **AND** it MUST NOT depend on the public Indicator HTTP API for indicator computation

### Requirement: Indicator Computation Core Shall Aggregate Unit Force From MACD Histogram

`@app/indicators` SHALL expose a stateless `computeUnitForces(histogram, begIndex, kTimes, units)`
pure function that computes one force value per unit, where a unit's force is the sum of valid
histogram values over the K indices whose times fall inside the unit's `[startTime, endTime]` interval
(positions before `begIndex` are invalid and skipped). A unit with no valid in-interval histogram
value SHALL receive force 0. The function SHALL have no I/O, no Nest/TypeORM/environment dependency
and SHALL NOT mutate its inputs.

#### Scenario: A caller aggregates unit force over an interval
- **WHEN** a caller supplies a histogram aligned to K times and units with start/end times
- **THEN** `computeUnitForces` MUST return one force per unit in the same order
- **AND** each force MUST be the sum of valid histogram values over the unit's K interval
- **AND** units entirely inside the warm-up (before `begIndex`) MUST receive force 0
- **AND** the inputs MUST NOT be mutated