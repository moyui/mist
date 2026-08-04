## ADDED Requirements

### Requirement: Operators can initialize immutable realtime routing from one page

Frontend SHALL provide `/settings/realtime-subscriptions` for creating a new ACTIVE STOCK Security/source/assignment or binding an existing eligible SecuritySourceConfig. It MUST consume the frozen version-first backend API through existing gateway and MUST NOT expose datasource or terminal control routes.

#### Scenario: Operator opens subscription settings

- **WHEN** operator navigates from an existing operator-visible application surface
- **THEN** UI MUST provide a visible route to `/settings/realtime-subscriptions`
- **AND** the feature MUST NOT depend on manually entering a hidden URL

#### Scenario: Operator initializes a new security

- **WHEN** operator enters canonical security identity, name, STOCK type, one TDX/QMT source and exact provider symbol
- **THEN** page MUST submit new-security initialization contract
- **AND** it MUST render returned assignment without manual page reload

#### Scenario: Operator binds an existing source config

- **WHEN** operator enters one canonical Security code for existing binding
- **THEN** page MUST call existing `GET /v1/securities/:code/sources` only for that Security and display its enabled `tdx|qmt` source configs
- **AND** it MUST display the existing response field `formatCode` as a read-only provider symbol
- **AND** it MUST NOT enumerate unbounded `/v1/securities` results or issue per-security N+1 source lookups
- **WHEN** operator selects one returned source config
- **THEN** page MUST submit only its stable source-config ID
- **AND** it MUST not duplicate or rewrite provider symbol in browser
- **AND** backend initialization MUST remain authoritative for ACTIVE STOCK, enabled source, assignment uniqueness and capacity eligibility

#### Scenario: Assignment initialization succeeds

- **WHEN** backend returns initialized routing assignment
- **THEN** source and providerSymbol MUST become read-only
- **AND** page MUST provide no assignment delete, source switch or desired checkbox

### Requirement: Security status and provider active evidence are displayed separately

Frontend SHALL display Security status/computed desired, provider active, active evidence, convergence and bounded reason independently. It MUST preserve `active=null` as unknown and MUST NOT render unknown, disconnected or blocked state as unsubscribed.

#### Scenario: Security activation is in progress

- **WHEN** operator invokes existing activate PUT and request has not completed
- **THEN** row MUST show pending state and prevent second conflicting status request

#### Scenario: Security is deactivated while provider remains active

- **WHEN** backend reports desired false, active true and deferred-removal reason
- **THEN** page MUST show Security as inactive while preserving actual active evidence
- **AND** it MUST explain that removal waits for ready/reconnect or weekday 09:15 reset

#### Scenario: Activation is outside the add-only window

- **WHEN** activation succeeds outside weekday 09:15–15:00 `Asia/Shanghai`
- **THEN** page MUST preserve ACTIVE status and show pending/drifted guidance until next reset
- **AND** it MUST not claim immediate provider subscription

#### Scenario: QMT recovery is blocked

- **WHEN** convergence is blocked by QMT journal reconciliation
- **THEN** page MUST direct operator to approved source-scoped recovery runbook
- **AND** it MUST provide no bypass, raw subscribe, unsubscribe, sync or context-rebuild mutation button

#### Scenario: Provider evidence differs

- **WHEN** TDX and QMT assignments are shown
- **THEN** TDX MUST be labelled terminal native-list evidence and QMT durable registry evidence
- **AND** UI MUST not imply QMT supplied a native active-list

### Requirement: Operator inventory remains bounded and contract-driven

Frontend SHALL page through assignments using backend cursor contract, enforce backend-advertised per-source ACTIVE capacity in interaction state, and use pinned OpenAPI/fixture copies with SHA-256 sidecars for offline contract tests.

#### Scenario: Source values are decoded

- **WHEN** frontend receives or submits a realtime source
- **THEN** it MUST use exact backend values `tdx` or `qmt`
- **AND** it MUST fail closed on legacy alias `mqmt` rather than silently remapping it

#### Scenario: More assignments exist than one page

- **WHEN** response contains a next cursor
- **THEN** page MUST request next bounded page explicitly
- **AND** it MUST not issue an unbounded fetch or infer larger limit

#### Scenario: Active capacity is reached

- **WHEN** five assignments for one source are already ACTIVE
- **THEN** page MUST use pagination-independent `sourceCapacities` from the backend to prevent activation or active initialization that would exceed capacity and explain limit
- **AND** it MUST NOT infer global capacity from current-page rows or fetch all pages for that calculation
- **AND** backend `REALTIME_ACTIVE_CAPACITY_REACHED` remains authoritative under races

#### Scenario: Security status PUT succeeds

- **WHEN** existing activate/deactivate PUT returns HTTP 200 shared envelope with `data=null`
- **THEN** frontend MUST accept it through the data-returning envelope parser and refresh the bounded current inventory page
- **AND** it MUST NOT require or interpret HTTP 204 as success

#### Scenario: Backend contract fixture changes

- **WHEN** API path, field, nullability, enum or expected error code changes
- **THEN** owning OpenSpec and backend fixture MUST change first
- **AND** frontend pinned copy under `__fixtures__/contracts/realtime-subscriptions/` and its `.sha256` MUST update together before tests pass

#### Scenario: An older request finishes late

- **WHEN** a prior page, lookup or mutation refresh response arrives after a newer request generation
- **THEN** frontend MUST ignore the stale response
- **AND** it MUST preserve the newest operator intent and rendered inventory
