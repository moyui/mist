## MODIFIED Requirements

### Requirement: ChanCore Shall Publish A Minimal Algorithm Facade
The `@app/chancore` public barrel SHALL expose one stateless `ChanCore` facade with `mergeK`, `findFenxings`,
`createBi`, `createChannels`, `createDuan` and `createDuanChannels`, plus only the algorithm-owned types, enums
and approved `ChanInputError/ChanInvariantError` required by its call and throw contracts.

#### Scenario: A caller invokes an existing Chan operation
- **WHEN** a caller requests merged K, Fenxing, Bi or Channel output from ordered raw `ChanK` input
- **THEN** it MUST invoke the corresponding `ChanCore` facade method
- **AND** `createChannels` MUST derive Bi internally and consume Bi Phase B before deriving Channel output

#### Scenario: A caller invokes Channel analysis with non-overlapping output
- **WHEN** a caller invokes `ChanCore.createChannels` for Bi-level Channel (中枢) output
- **THEN** the Phase B output MUST contain no adjacent same-level Channels whose wave ranges (`dd..gg`)
  overlap or touch (central expansion resolved by the `chan-central-extension` capability)
- **AND** the `expanded` marker on an expansion-merged Channel MUST remain visible through the facade output

#### Scenario: A caller invokes Duan-level Channel analysis with non-overlapping output
- **WHEN** a caller invokes `ChanCore.createDuanChannels` for Duan-level Channel (段级中枢) output
- **THEN** it MUST consume the `ChanDuan[]` returned by `createDuan` and return `{ phaseA, phaseB }`
- **AND** the Phase B output MUST contain no adjacent same-level Channels whose wave ranges overlap or
  touch (central expansion resolved by the `chan-central-extension` capability)
- **AND** the `expanded` marker on an expansion-merged Channel MUST remain visible through the facade output

#### Scenario: An internal algorithm component is implemented
- **WHEN** Trend, K merge, Bi, Channel, Duan, Duan-level Channel, expansion resolution or a supporting
  helper is added under `libs/chancore`
- **THEN** that component MUST remain private to the library unless an approved facade signature requires it
- **AND** the public barrel MUST NOT export internal services, helpers or a Nest module

#### Scenario: A caller identifies current Chan semantics
- **WHEN** it reads the stateless facade contract
- **THEN** `ChanCore.algorithmVersion` MUST be the readonly positive integer `2` for this baseline after
  the `chan-central-extension` change
- **AND** callers MUST NOT pass or negotiate an algorithm version
- **AND** the version MUST NOT be duplicated into each result, external protocol, database schema or
  environment config

#### Scenario: Existing algorithm semantics change in a future change
- **WHEN** a formation rule, comparison boundary, tie-breaker, reduction order, phase rule, output semantic
  or new calculation changes an existing facade result
- **THEN** that owning change MUST increment `algorithmVersion`
- **AND** it MUST update and explain the full-output fingerprint in the same change

#### Scenario: Algorithm semantics do not change
- **WHEN** source is moved, internals are renamed, adapters change or a performance refactor remains fully
  differential-equivalent
- **THEN** `algorithmVersion` MUST remain unchanged
- **AND** a Git build SHA MUST remain separate from the semantic algorithm version

#### Scenario: A future Chan strength algorithm uses MACD or quantity
- **WHEN** a future change defines Bi strength, divergence or volume-price analysis
- **THEN** that change MAY derive a Chan-owned calculation from complete `ChanK` input
- **AND** it MUST separately approve parameters, algorithm version, null handling and output contract
- **AND** ChanCore MUST NOT import the public IndicatorService or Strategy evaluator implementation
