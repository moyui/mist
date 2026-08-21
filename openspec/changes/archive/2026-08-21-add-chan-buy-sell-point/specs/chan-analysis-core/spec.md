## MODIFIED Requirements

### Requirement: ChanCore Shall Publish A Minimal Algorithm Facade
The `@app/chancore` public barrel SHALL expose one stateless `ChanCore` facade with `mergeK`,
`findFenxings`, `createBi`, `createChannels`, `createDuan`, `createDuanChannels`,
`detectDivergences` and `detectBuySellPoints`, plus only the algorithm-owned types, enums and
approved `ChanInputError/ChanInvariantError` required by its call and throw contracts.

#### Scenario: A caller invokes an existing Chan operation
- **WHEN** a caller requests merged K, Fenxing, Bi or Channel output from ordered raw `ChanK` input
- **THEN** it MUST invoke the corresponding `ChanCore` facade method
- **AND** `createChannels` MUST derive Bi internally and consume Bi Phase B before deriving Channel output

#### Scenario: A caller invokes a Duan operation
- **WHEN** a caller requests Duan (segment) output
- **THEN** it MUST invoke `ChanCore.createDuan` with the `ChanBi[]` Phase B sequence returned by `createBi`
- **AND** `createDuan` MUST consume the final Bi sequence directly (no two-phase envelope)

#### Scenario: A caller invokes a Duan-level Channel operation
- **WHEN** a caller requests Duan-level Channel (段级中枢) output
- **THEN** it MUST invoke `ChanCore.createDuanChannels` with the `ChanDuan[]` returned by `createDuan`
- **AND** `createDuanChannels` MUST consume Duan from that result before deriving Duan-level Channel output
- **AND** it MUST NOT derive Duan internally from raw K or Bi

#### Scenario: A caller invokes divergence detection
- **WHEN** a caller requests divergence (背驰) output
- **THEN** it MUST invoke `ChanCore.detectDivergences` with a `ChanDivergenceInput` carrying the unit sequence,
  the Channel sequence and caller-computed per-unit force values
- **AND** ChanCore MUST NOT compute momentum indicators (the caller supplies force values)
- **AND** the caller MAY compute force values with the shared indicator computation core
  (`@app/indicators`) without depending on the public Indicator HTTP API

#### Scenario: A caller invokes buy/sell point detection
- **WHEN** a caller requests buy/sell point (买卖点) output
- **THEN** it MUST invoke `ChanCore.detectBuySellPoints` with a `ChanBspInput` carrying the unit
  sequence (with high/low), the Channel sequence and caller-computed per-unit force values
- **AND** ChanCore MUST NOT compute momentum indicators (the caller supplies force values)
- **AND** the caller MAY compute force values with the shared indicator computation core
  (`@app/indicators`) without depending on the public Indicator HTTP API
- **AND** the output MUST cover first-, second- and third-type buy/sell points as specified by the
  `chan-buy-sell-point` capability

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
- **WHEN** Trend, K merge, Bi, Channel, Duan, Duan-level Channel, divergence, buy/sell point or a
  supporting helper is added under `libs/chancore`
- **THEN** that component MUST remain private to the library unless an approved facade signature requires it
- **AND** the public barrel MUST NOT export internal services, helpers or a Nest module

#### Scenario: No current consumer needs a combined analysis operation
- **WHEN** the extraction is implemented
- **THEN** ChanCore MUST NOT add a speculative `analyze` public method
- **AND** any future combined operation MUST be reviewed as a separate contract change

#### Scenario: Internal validation or algorithm helpers are implemented
- **WHEN** the facade validates a K series or executes a calculation
- **THEN** private validators and algorithm helpers MUST NOT be exported from the public barrel
- **AND** the approved error types MUST contain no HTTP status, Nest dependency or persistence error object
