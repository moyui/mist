## ADDED Requirements

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

#### Scenario: A Chan request needs application behavior
- **WHEN** a request requires K retrieval, date or source parsing, OpenAPI metadata, HTTP envelope or VO mapping
- **THEN** that behavior MUST remain in an application adapter outside `libs/chancore`
- **AND** it MUST invoke the same `@app/chancore` implementation used by every retained Chan route

### Requirement: ChanCore Shall Not Own Strategy Indicators Or Market Retrieval
ChanCore SHALL NOT provide Strategy KDJ/MACD, public Indicator endpoints, a public unified K API or
`StrategyMarketDataPort` implementations.

#### Scenario: Backtest or realtime evaluates an Indicator field
- **WHEN** Strategy evaluates an approved KDJ or MACD field
- **THEN** the Strategy-owned evaluator contract MUST perform or invoke that calculation
- **AND** the runtime MUST NOT depend on ChanCore or the public Indicator HTTP API

#### Scenario: A Chan request needs K data
- **WHEN** a Chan HTTP adapter handles a request
- **THEN** the adapter MUST retrieve, order, validate and map K input before invoking ChanCore
- **AND** ChanCore MUST NOT query K data itself

### Requirement: ChanCore Contracts Shall Be Approved Before Source Moves
The library name, public exports, input/output fields, invalid-input behavior, numeric comparison, mutation and
algorithm-version rules SHALL be approved before Chan source files are moved.

#### Scenario: A Chan extraction task begins
- **WHEN** any required contract decision remains open
- **THEN** implementation MUST pause
- **AND** the accepted decision MUST be written back to the change artifacts
