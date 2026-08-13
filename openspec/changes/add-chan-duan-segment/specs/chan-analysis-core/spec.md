## MODIFIED Requirements

### Requirement: ChanCore Shall Publish A Minimal Algorithm Facade
The `@app/chancore` public barrel SHALL expose one stateless `ChanCore` facade with `mergeK`, `findFenxings`,
`createBi`, `createChannels` and `createDuan`, plus only the algorithm-owned types, enums and approved
`ChanInputError/ChanInvariantError` required by its call and throw contracts.

#### Scenario: A caller invokes an existing Chan operation
- **WHEN** a caller requests merged K, Fenxing, Bi or Channel output from ordered raw `ChanK` input
- **THEN** it MUST invoke the corresponding `ChanCore` facade method
- **AND** `createChannels` MUST derive Bi internally and consume Bi Phase B before deriving Channel output

#### Scenario: A caller invokes a Duan operation
- **WHEN** a caller requests Duan (segment) output from ordered raw `ChanK` input
- **THEN** it MUST invoke `ChanCore.createDuan`
- **AND** `createDuan` MUST derive Bi internally and consume Bi Phase B before deriving Duan output
- **AND** it MUST NOT re-derive Bi with a different algorithm than `createBi`

#### Scenario: An internal algorithm component is implemented
- **WHEN** Trend, K merge, Bi, Channel, Duan or a supporting helper is added under `libs/chancore`
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
