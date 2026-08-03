# chan-analysis-core Specification

## Purpose
TBD - created by archiving change extract-chan-core. Update Purpose after archive.
## Requirements
### Requirement: ChanCore Shall Be A Pure Derived-Analysis Boundary
ChanCore SHALL consume approved validated in-memory inputs and return deterministic merged-K, Fenxing, Bi and
Channel outputs without accessing TypeORM, MySQL, Redis, HTTP, environment variables or Nest controllers.

The implementation SHALL live under `libs/chancore`, use Nest project key `chancore`, and be imported through
`@app/chancore`.

#### Scenario: The same Chan calculation is replayed
- **WHEN** the same approved ordered input and algorithm version are supplied
- **THEN** ChanCore MUST return the same structure, values, enums and ordering
- **AND** it MUST perform no external I/O or Chan persistence

#### Scenario: A Chan algorithm source is moved into the library
- **WHEN** Trend, K merge, Fenxing, Bi, Channel or a pure supporting helper is extracted
- **THEN** the moved implementation MUST use library-owned inputs and outputs
- **AND** it MUST NOT import application controllers, HTTP DTO/VO, TypeORM entities or Nest dependency-injection
  decorators

#### Scenario: Bi width is evaluated after extraction
- **WHEN** a candidate Bi resolves its start and end middle-origin IDs in the ordered candidate K sequence
- **THEN** ChanCore MUST count independent K bars by the endpoint position distance in that sequence
- **AND** the result MUST NOT depend on gaps in global persisted K IDs
- **AND** a missing or duplicate endpoint occurrence MUST remain an invariant failure

#### Scenario: A caller needs behavior outside calculation
- **WHEN** a caller requires K retrieval, transport parsing, persistence, monitoring or external shape mapping
- **THEN** that behavior MUST remain outside `libs/chancore`
- **AND** it MAY invoke ChanCore directly or through a caller-owned thin wrapper

#### Scenario: An empty approved K sequence is evaluated
- **WHEN** a ChanCore facade receives an empty ordered K sequence
- **THEN** `mergeK` and `findFenxings` MUST return empty arrays
- **AND** `createBi` and `createChannels` MUST return `{ phaseA: [], phaseB: [] }`
- **AND** no empty result MUST be represented as a database, contract or algorithm error

#### Scenario: Available K is insufficient to form a derived structure
- **WHEN** valid non-empty K input cannot yet form a Fenxing, complete Bi or Channel
- **THEN** ChanCore MUST return the naturally derived empty collection or incomplete Bi
- **AND** it MUST NOT throw merely because the requested derived structure has not formed

#### Scenario: A non-empty K sequence enters a public facade
- **WHEN** ChanCore validates the sequence
- **THEN** every ID MUST be a unique positive safe integer
- **AND** every symbol MUST be non-empty and equal within the sequence
- **AND** every time MUST be a valid Date and times MUST be strictly increasing
- **AND** OHLC values MUST be finite numbers with `high >= low`
- **AND** IDs MUST NOT be required to be continuous or increasing

#### Scenario: A K quantity is validated
- **WHEN** `volume` or `amount` is non-null
- **THEN** it MUST be an exact non-exponent decimal string representable by `DECIMAL(36,8)`
- **AND** a MySQL fixed-scale value such as `"0.00000000"` MUST be accepted
- **AND** a JavaScript number, whitespace-padded value, exponent notation or excess precision MUST be rejected

#### Scenario: Input violates the ChanCore precondition
- **WHEN** identity, symbol, time, OHLC or quantity validation fails
- **THEN** the facade MUST throw `ChanInputError` without sorting, coercing, filtering, deduplicating or filling input

#### Scenario: Validated input reaches an impossible algorithm state
- **WHEN** an internal Chan invariant cannot be satisfied
- **THEN** ChanCore MUST throw `ChanInvariantError`
- **AND** it MUST NOT return a partial or empty result as recovery

#### Scenario: Price values are compared after extraction
- **WHEN** ChanCore evaluates containment, trend, Fenxing, Bi or Channel geometry
- **THEN** it MUST preserve the existing strict and non-strict JavaScript number comparisons
- **AND** it MUST NOT introduce epsilon equality, rounding, tick normalization, Decimal conversion or a rewritten
  midpoint formula
- **AND** `volume/amount` MUST NOT participate in current Chan numeric decisions

#### Scenario: Equal-price boundaries are evaluated
- **WHEN** compared values are exactly equal
- **THEN** equal containment centers MUST remain unmerged and strict Fenxing extrema MUST remain unformed
- **AND** equal same-type Fenxing or raw-K extremes MUST retain the earliest input occurrence
- **AND** Bi's approved non-strict progression comparisons MUST remain non-strict
- **AND** a Channel with `zg === zd` MUST remain invalid

#### Scenario: Time and identity values are compared
- **WHEN** ChanCore resolves temporal order or raw K identity
- **THEN** Date values MUST be compared by exact millisecond values
- **AND** identities MUST be compared as exact safe integers without distance arithmetic

#### Scenario: A facade evaluates caller-owned input
- **WHEN** any ChanCore operation receives an approved K sequence
- **THEN** public inputs, outputs, properties and collections MUST use readonly value contracts
- **AND** ChanCore MUST NOT mutate the caller's array, K objects or Date values
- **AND** it MUST retain no mutable module state, previous-call data or result cache

#### Scenario: Evidence is reused inside an output graph
- **WHEN** merged K, Bi phases or Channels include the same raw K evidence
- **THEN** ChanCore MAY share an immutable `ChanK` reference instead of deep-cloning it for every structure
- **AND** it MUST NOT require runtime freeze, JSON cloning or recursive deep-copy isolation
- **AND** consumers MUST NOT rely on object reference identity between inputs, phases or repeated calls

#### Scenario: A caller source model becomes ChanCore input
- **WHEN** a caller maps its own market-data model
- **THEN** it MUST create a new complete `ChanK` value object
- **AND** it MUST copy any mutable timestamp into a new Date value

#### Scenario: Core output is mapped by a thin wrapper
- **WHEN** a caller maps core output to another shape
- **THEN** it MUST create new structures without mutating or re-sorting the core result
- **AND** changing the wrapper-owned result MUST NOT change the core result

#### Scenario: A caller identifies current Chan semantics
- **WHEN** it reads the stateless facade contract
- **THEN** `ChanCore.algorithmVersion` MUST be the readonly positive integer `1` for this extraction baseline
- **AND** callers MUST NOT pass or negotiate an algorithm version
- **AND** the version MUST NOT be duplicated into each result, external protocol, database schema or environment
  config

#### Scenario: Existing algorithm semantics change in a future change
- **WHEN** a formation rule, comparison boundary, tie-breaker, reduction order, phase rule, output semantic or new
  calculation changes an existing facade result
- **THEN** that owning change MUST increment `algorithmVersion`
- **AND** it MUST update and explain the full-output fingerprint in the same change

#### Scenario: Algorithm semantics do not change
- **WHEN** source is moved, internals are renamed, adapters change or a performance refactor remains fully
  differential-equivalent
- **THEN** `algorithmVersion` MUST remain unchanged
- **AND** a Git build SHA MUST remain separate from the semantic algorithm version

### Requirement: ChanCore Shall Publish A Minimal Algorithm Facade
The `@app/chancore` public barrel SHALL expose one stateless `ChanCore` facade with `mergeK`, `findFenxings`,
`createBi` and `createChannels`, plus only the algorithm-owned types, enums and approved
`ChanInputError/ChanInvariantError` required by its call and throw contracts.

#### Scenario: A caller invokes an existing Chan operation
- **WHEN** a caller requests merged K, Fenxing, Bi or Channel output from ordered raw `ChanK` input
- **THEN** it MUST invoke the corresponding `ChanCore` facade method
- **AND** `createChannels` MUST derive Bi internally and consume Bi Phase B before deriving Channel output

#### Scenario: An internal algorithm component is implemented
- **WHEN** Trend, K merge, Bi, Channel or a supporting helper is added under `libs/chancore`
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

### Requirement: ChanCore Shall Accept Complete Raw Market Bars
`ChanK` SHALL require `id`, `symbol`, `time`, `open`, `high`, `low`, `close`, `volume` and `amount`.
Price fields SHALL be numbers, `time` SHALL remain a `Date`, and `volume/amount` SHALL remain canonical decimal
strings or `null` rather than JavaScript numbers.

#### Scenario: A caller maps a market bar into ChanCore
- **WHEN** the caller prepares an ordered bar for ChanCore
- **THEN** it MUST map the complete OHLCVA value into `ChanK`
- **AND** it MUST NOT pass an application entity or transport DTO as the library input
- **AND** a Backtest or realtime caller MUST apply the shared `KPriceProjector` before mapping stored OHLC into
  `ChanK`
- **AND** ChanCore MUST NOT parse a MySQL fixed-scale price string, read Redis or own a storage migration
- **AND** it MUST NOT coerce non-null volume or amount to a JavaScript number

#### Scenario: Current Chan algorithms receive the expanded input
- **WHEN** K merge, Fenxing, Bi and Channel run during this extraction
- **THEN** their existing decision logic and output behavior MUST remain unchanged
- **AND** the presence of open, close, volume or amount MUST NOT silently enable a new calculation

#### Scenario: K containment produces a merged K
- **WHEN** `mergeK` emits a `ChanMergedK`
- **THEN** it MUST contain `startTime`, `endTime`, algorithm-derived `high/low`, `trend`, `mergedCount`,
  `mergedIds` and the complete contributing `ChanK[]` as `mergedData`
- **AND** `mergedCount`, `mergedIds.length` and `mergedData.length` MUST be equal
- **AND** its algorithm-derived `high/low` MUST NOT be replaced with simple raw-range extrema

#### Scenario: A Fenxing is emitted
- **WHEN** `findFenxings` emits a `ChanFenxing`
- **THEN** it MUST contain the raw K IDs of the left, middle and right merged-K groups
- **AND** `middleIndex` MUST identify the middle merged K position in the current ordered merged-K sequence
- **AND** `middleOriginId` MUST identify the raw K that produced the middle extreme
- **AND** it MUST contain `type` and algorithm-derived `high/low`
- **AND** it MUST NOT require copied raw K groups or a newly invented time field

#### Scenario: A complete Bi is emitted
- **WHEN** `createBi` emits a complete `ChanBi`
- **THEN** it MUST contain extreme-origin `startTime/endTime`, algorithm-derived `high/low`, `trend`, `type`,
  `status`, `independentCount`, ordered identity-deduplicated `originIds/originData` and both endpoint Fenxings
- **AND** `originData` MUST retain the complete contributing `ChanK` values
- **AND** `startFenxing` and `endFenxing` MUST both be non-null

#### Scenario: An incomplete tail Bi is emitted
- **WHEN** the ordered K input ends before a complete endpoint Fenxing is formed
- **THEN** the tail Bi MUST use `type=uncomplete`, `status=unknown` and `endFenxing=null`
- **AND** `startFenxing` MAY be the preceding complete Bi endpoint or `null` when no Fenxing has formed

#### Scenario: Bi two-phase output is returned
- **WHEN** `createBi` completes its Phase A and Phase B reductions
- **THEN** it MUST return both `phaseA` and `phaseB` as full `ChanBi[]` values
- **AND** callers MUST NOT flatten, merge or omit either phase
- **AND** Channel derivation MUST consume Bi Phase B

#### Scenario: A Channel is emitted
- **WHEN** `createChannels` emits a `ChanChannel`
- **THEN** it MUST contain the full contributing `bis`, `zg/zd/gg/dd`, `level`, `type`, `status`, `trend`,
  boundary IDs and display IDs
- **AND** `startId/endId/displayStartId/displayEndId` MUST identify raw K values rather than array positions
- **AND** no algorithm or caller MUST perform position arithmetic on those IDs

#### Scenario: Current Channel scope is preserved
- **WHEN** the current Channel algorithm runs after extraction
- **THEN** it MUST continue to produce Bi-level complete Channels only
- **AND** retaining the existing Duan-level and incomplete enum variants MUST NOT enable a new algorithm

#### Scenario: Channel two-phase output is returned
- **WHEN** `createChannels` completes its enumeration, extension, merge and filtering
- **THEN** it MUST return both complete `phaseA` and `phaseB` arrays
- **AND** Phase A MAY contain valid and invalid candidates
- **AND** Phase B MUST contain the retained final valid Channels
- **AND** callers MUST NOT recompute display IDs, flatten the result or omit either phase

#### Scenario: A future Chan strength algorithm uses MACD or quantity
- **WHEN** a future change defines Bi strength, divergence or volume-price analysis
- **THEN** that change MAY derive a Chan-owned calculation from complete `ChanK` input
- **AND** it MUST separately approve parameters, algorithm version, null handling and output contract
- **AND** ChanCore MUST NOT import the public IndicatorService or Strategy evaluator implementation

### Requirement: ChanCore Shall Not Own Strategy Indicators Or Market Retrieval
ChanCore SHALL NOT provide Strategy KDJ/MACD, public Indicator endpoints, a public unified K API or
`StrategyMarketDataPort` implementations.

#### Scenario: Backtest or realtime evaluates an Indicator field
- **WHEN** Strategy evaluates an approved KDJ or MACD field
- **THEN** the Strategy-owned evaluator contract MUST perform or invoke that calculation
- **AND** the runtime MUST NOT depend on ChanCore or the public Indicator HTTP API

#### Scenario: A ChanCore caller needs K data
- **WHEN** any caller invokes ChanCore
- **THEN** that caller MUST retrieve, order and map K input before invocation
- **AND** ChanCore MUST NOT query K data itself

### Requirement: ChanCore Contracts Shall Be Approved Before Source Moves
The library name, public exports, input/output fields, invalid-input behavior, numeric comparison, mutation and
algorithm-version rules SHALL be approved before Chan source files are moved.

#### Scenario: A Chan extraction task begins
- **WHEN** any required contract decision remains open
- **THEN** implementation MUST pause
- **AND** the accepted decision MUST be written back to the change artifacts

