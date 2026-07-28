## ADDED Requirements

### Requirement: Public state names identify their lifecycle layer
Cross-repository runtime contracts SHALL distinguish service health, transport readiness, bridge-owner readiness, subscription readiness, and data freshness with qualified names or explicit object scope.

#### Scenario: A readiness field is added or changed
- **WHEN** a producer exposes a readiness value consumed outside its module or repository
- **THEN** its name and JSON path identify the responsible lifecycle layer
- **AND** the same semantic value uses the same path for every supported provider

### Requirement: Public fields have producer-to-consumer inventories
Every breaking public field rename SHALL inventory its producer, wire representation, decoder, stored state, deployment consumer, monitoring consumer, recovery consumer, tests, and current documentation.

#### Scenario: Contract rename is reviewed
- **WHEN** a public HTTP, WebSocket, metric, configuration, or diagnostic field changes
- **THEN** the change includes evidence for every reachable producer and consumer
- **AND** retired names are absent from active runtime code after the cutover

### Requirement: Identity and time vocabulary is explicit
Mist-owned code SHALL use qualified identity and lifecycle timestamp names and SHALL isolate provider-native or persisted legacy names at their declared boundaries.

#### Scenario: Provider identity enters Mist
- **WHEN** a provider-specific symbol is converted into a Mist-owned model
- **THEN** the boundary distinguishes `providerSymbol` from canonical `securityCode`

#### Scenario: Realtime time is recorded
- **WHEN** code records market event, capture, receive, acceptance, or close time
- **THEN** the field name identifies the lifecycle event rather than using an ambiguous timestamp name

### Requirement: Files and directories match their primary responsibility
Tracked implementation files SHALL use the repository language convention, align the basename with the primary exported responsibility, and place equivalent provider roles at equivalent relative paths unless a documented semantic difference requires otherwise.

#### Scenario: Naming audit scans tracked files
- **WHEN** TypeScript and Python implementation paths are audited
- **THEN** TypeScript basenames use kebab-case and Python basenames use snake_case
- **AND** generic names such as `runtime`, `types`, `utils`, or `common` have a narrow directory-scoped responsibility

#### Scenario: Provider source and gateway paths are inspected
- **WHEN** the TDX and QMT source services and realtime gateways are compared
- **THEN** backend source services use `tdx-source.service.ts` and `qmt-source.service.ts`
- **AND** the TDX fetcher contract uses `tdx-source-fetcher.interface.ts`
- **AND** datasource gateways use `src/datasource/<source>/realtime/gateway.py`
- **AND** provider-scoped realtime clients may retain the shared basename `realtime.client.ts`

#### Scenario: External or persisted name is encountered
- **WHEN** a database name, provider-native key, or external API field violates internal naming conventions
- **THEN** the audit records it as an explicit compatibility boundary
- **AND** it is not mechanically renamed without a separately scoped migration

### Requirement: Naming findings use evidence-based severity
Naming audits SHALL classify each candidate as confirmed, partial, intentional, or not found and SHALL assign severity from operational impact, likelihood, and exposure.

#### Scenario: Cosmetic and operational naming debt are compared
- **WHEN** one name can trigger incorrect recovery while another only obscures a local file role
- **THEN** the recovery-facing contract receives higher severity
- **AND** the report does not treat both as equivalent style violations
