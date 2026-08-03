## ADDED Requirements

### Requirement: Chan Adapters Shall Own Data Retrieval And HTTP Mapping
Chan HTTP adapters SHALL retrieve and validate ordered K inputs, explicitly convert them to library-owned
contracts, invoke the shared pure ChanCore, and map results to the existing public VO/envelope contract.

#### Scenario: A Chan API request is processed
- **WHEN** the adapter resolves the requested historical K data
- **THEN** it MUST invoke ChanCore without passing TypeORM entities, HTTP DTOs or Swagger VOs into the core
- **AND** no Chan entity or persistence path MUST be introduced

#### Scenario: DB-derived K violates the core input contract
- **WHEN** a valid HTTP query resolves K data that triggers `ChanInputError`, or calculation triggers
  `ChanInvariantError`
- **THEN** the adapter MUST preserve it as an internal data or program failure
- **AND** it MUST NOT map the failure to a user-input 400, an empty success or an expected business rejection

### Requirement: Chan Extraction Shall Preserve Existing Public Behavior
This change SHALL preserve existing `/v1/chan/*` URLs, envelope/OpenAPI shapes and K merge, Fenxing, Bi Phase
A/Phase B and Channel Phase A/Phase B semantics, except for the explicitly approved empty-history correction.

#### Scenario: Characterization and HTTP fixtures are replayed
- **WHEN** the extracted implementation receives the same valid ordered K input
- **THEN** its approved full-output fingerprint MUST match the pre-extraction result
- **AND** any route deletion, response change or algorithm correction other than the approved empty-history
  correction MUST be deferred to another change

#### Scenario: A retained Chan route resolves no historical K
- **WHEN** its validated query completes successfully with an empty K collection
- **THEN** the route MUST return HTTP 200 with its retained envelope and a natural empty Chan result
- **AND** the Channel route MUST return `{ phaseA: [], phaseB: [] }`
- **AND** it MUST NOT expose an internal empty-Bi validation error to the HTTP consumer

### Requirement: Chan Application Ownership Shall Be Explicit Before Rewiring
The independently deployed `chan-api` SHALL be the long-term runtime owner of `/v1/chan/*`. Its controller,
TypeORM K read adapter, VO mapping and Nest module placement SHALL be approved before the legacy
`apps/chan → apps/mist` source import is removed.

#### Scenario: The app-to-app import is replaced
- **WHEN** `apps/chan/src/chan-app.module.ts` no longer imports `apps/mist` source
- **THEN** every retained public route MUST still have one explicitly named runtime owner
- **AND** existing gateway/frontend compatibility MUST be covered by contract tests

#### Scenario: The duplicate Mist Backend route is considered for removal
- **WHEN** the internal extraction has completed
- **THEN** this change MUST leave the current `mist-backend` compatibility route in place
- **AND** a separate route-migration change MUST own its consumer audit and deletion
