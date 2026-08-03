## ADDED Requirements

### Requirement: Chan Adapters Shall Own Data Retrieval And HTTP Mapping
Chan HTTP adapters SHALL retrieve and validate ordered K inputs, explicitly convert them to library-owned
contracts, invoke the shared pure ChanCore, and map results to the existing public VO/envelope contract.

#### Scenario: A Chan API request is processed
- **WHEN** the adapter resolves the requested historical K data
- **THEN** it MUST invoke ChanCore without passing TypeORM entities, HTTP DTOs or Swagger VOs into the core
- **AND** no Chan entity or persistence path MUST be introduced

### Requirement: Chan Extraction Shall Preserve Existing Public Behavior
This change SHALL preserve existing `/v1/chan/*` URLs, envelope/OpenAPI shapes and K merge, Fenxing, Bi Phase
A/Phase B and Channel Phase A/Phase B semantics.

#### Scenario: Characterization and HTTP fixtures are replayed
- **WHEN** the extracted implementation receives the same valid ordered K input
- **THEN** its approved full-output fingerprint MUST match the pre-extraction result
- **AND** any route deletion, response change or algorithm correction MUST be deferred to another change

### Requirement: Chan Application Ownership Shall Be Explicit Before Rewiring
The owner of Chan controllers, TypeORM K read adapter, VO mapping and Nest module SHALL be approved before the
legacy `apps/chan → apps/mist` source import is removed.

#### Scenario: The app-to-app import is replaced
- **WHEN** `apps/chan/src/chan-app.module.ts` no longer imports `apps/mist` source
- **THEN** every retained public route MUST still have one explicitly named runtime owner
- **AND** existing gateway/frontend compatibility MUST be covered by contract tests
