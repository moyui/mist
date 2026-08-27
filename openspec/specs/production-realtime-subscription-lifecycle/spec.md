# production-realtime-subscription-lifecycle Specification

## Purpose
Define the production realtime subscription lifecycle: one immutable routing assignment per ACTIVE STOCK Security and enabled TDX/QMT config, bounded version-first HTTP contracts, a single backend convergence coordinator and provider-specific recovery boundaries.
## Requirements
### Requirement: Realtime assignments persist one immutable route per security

Mist SHALL persist realtime subscription routing separately from historical source selection. Each assignment MUST reference exactly one STOCK Security and one enabled TDX or QMT `SecuritySourceConfig` belonging to that Security; its source config, source, provider symbol and enabled state MUST become immutable after initialization. Assignment persistence MUST NOT contain a second desired boolean: an assigned Security is desired exactly when `Security.status=ACTIVE`.

#### Scenario: A new security assignment is initialized

- **WHEN** an operator submits a valid new ACTIVE STOCK Security and exact TDX/QMT provider symbol
- **THEN** backend MUST create the Security, source config and routing assignment in one short database transaction
- **AND** the public result MUST map the persisted entities to a realtime subscription VO

#### Scenario: An existing source config is assigned

- **WHEN** an operator selects an enabled TDX/QMT source config belonging to an ACTIVE STOCK Security without an assignment
- **THEN** backend MUST create exactly one routing assignment for that Security and source config
- **AND** it MUST NOT copy or infer another provider symbol

#### Scenario: Assigned realtime identity is changed or deleted

- **WHEN** a caller attempts to change assigned providerSymbol/source/enabled state, delete the source config or delete the assignment
- **THEN** backend MUST preserve the assignment and realtime identity
- **AND** it MUST return expected business rejection `REALTIME_SOURCE_LOCKED` through the shared HTTP envelope
- **AND** a priority-only historical source update MAY remain available

#### Scenario: Active capacity would be exceeded

- **WHEN** assignment initialization or Security activation would make more than five ACTIVE assignments for one source
- **THEN** backend MUST leave the persisted ACTIVE set unchanged
- **AND** it MUST return expected business rejection `REALTIME_ACTIVE_CAPACITY_REACHED`

### Requirement: Realtime subscription management uses bounded version-first HTTP contracts

Backend SHALL expose `/v1/realtime-subscriptions` GET/POST through shared HTTP envelopes, explicit DTO/VO mappings and bounded cursor pagination. It SHALL reuse idempotent `PUT /v1/securities/:code/activate` and `PUT /v1/securities/:code/deactivate` for desired changes and SHALL expose no assignment desired PATCH, raw unsubscribe/sync or assignment-delete endpoint. Expected domain rejection MUST use real HTTP 200 with `success=false`, a stable code, a safe message and approved typed data; validation, dependency and unknown failures MUST retain their real transport status.

#### Scenario: Assignments are listed

- **WHEN** a caller requests `GET /v1/realtime-subscriptions` with optional positive `afterId` and `limit`
- **THEN** backend MUST read assignments in stable `id ASC` order with default limit 20 and maximum limit 100
- **AND** it MUST return `RealtimeSubscriptionPageVo` without exposing TypeORM entities
- **AND** each row's desired value MUST be computed from current Security status
- **AND** the page MUST include pagination-independent `sourceCapacities` entries for exact sources `tdx` and `qmt`, each with authoritative `activeAssignmentCount` and `limit=5`
- **AND** `activeAssignmentCount` MUST count ACTIVE assignments that consume desired capacity and MUST NOT represent provider active evidence
- **AND** the public contract MUST NOT expose or accept legacy frontend source alias `mqmt`

#### Scenario: An assigned Security is activated

- **WHEN** `PUT /v1/securities/:code/activate` commits ACTIVE for an assigned Security
- **THEN** ACTIVE persistence MUST become authoritative before provider I/O
- **AND** backend MUST refresh database-derived desired evidence before returning without waiting for provider convergence
- **AND** HTTP success MUST remain the shared HTTP 200 envelope with `data=null`
- **AND** provider failure MUST NOT roll back the Security status
- **AND** frontend/consumer MUST obtain latest active/convergence through bounded subscription inventory readback

#### Scenario: An assigned Security is deactivated

- **WHEN** `PUT /v1/securities/:code/deactivate` commits SUSPENDED or DELISTED for an assigned Security
- **THEN** backend MUST issue no provider unsubscribe from that HTTP path
- **AND** backend MUST refresh database-derived desired evidence before returning without issuing provider control
- **AND** HTTP success MUST remain the shared HTTP 200 envelope with `data=null`
- **AND** the row MUST remain active/effective when prior fresh evidence still proves provider membership
- **AND** it MUST expose deferred removal until a later reset proves absence

#### Scenario: No trustworthy active readback exists

- **WHEN** the provider is disconnected, readback is stale or control outcome is unknown
- **THEN** the VO MUST return `active=null`, `activeEvidence=null` and convergence `unknown` or `blocked` as applicable
- **AND** it MUST NOT infer inactive state from silence or missing fields

### Requirement: One backend coordinator owns trigger-specific convergence

When `REALTIME_SUBSCRIPTION_LIFECYCLE_MODE=on`, one `apps/mist` coordinator SHALL own production subscription mutation for TDX and QMT. It MUST derive desired only from ACTIVE assignments, use full reset only for ready/reconnect and weekday 09:15 barriers, use incremental subscribe only for eligible intraday activation, and MUST NOT use a public raw control endpoint or `apps/schedule`.

#### Scenario: A datasource connection becomes ready

- **WHEN** backend accepts the first ready frame or a ready frame on a new provider connection
- **THEN** the coordinator MUST read exact ACTIVE desired, call `getSubscriptions()`, call `syncSubscriptions(exactDesired)`, then call `getSubscriptions()` again
- **AND** destructive cancel/replacement MUST remain implemented inside datasource control
- **AND** the provider client MUST remain a typed transport executor rather than deriving desired state itself

#### Scenario: An assigned Security is activated during the add-only window

- **WHEN** ACTIVE commits on Monday through Friday from 09:15 inclusive until 15:00 exclusive in `Asia/Shanghai`
- **THEN** the coordinator MUST read fresh active evidence and call incremental `subscribe` at most once only when the target symbol is missing
- **AND** it MUST follow with `getSubscriptions()`
- **AND** it MUST NOT cancel or rebuild unrelated subscriptions

#### Scenario: Activation occurs outside the add-only window

- **WHEN** ACTIVE commits outside Monday-through-Friday 09:15–15:00 `Asia/Shanghai`
- **THEN** backend MUST persist ACTIVE without provider mutation
- **AND** the assignment MUST wait for the next ready/reconnect or weekday 09:15 reset

#### Scenario: An assigned Security becomes inactive

- **WHEN** Security status becomes SUSPENDED or DELISTED
- **THEN** coordinator MUST issue no incremental unsubscribe
- **AND** it MUST retain a bounded deferred-removal observation until reset/readback proves absence

#### Scenario: Weekday reset runs

- **WHEN** the realtime lifecycle cron reaches 09:15 on Monday through Friday in `Asia/Shanghai`
- **THEN** coordinator MUST execute `get -> sync exact ACTIVE set -> get` for each enabled source even when previous state was converged
- **AND** it MUST NOT consult or create a holiday-calendar provider

#### Scenario: Multiple triggers overlap

- **WHEN** a source already has a running round and more triggers arrive
- **THEN** coordinator MUST retain at most one dirty rerun marker
- **AND** it MUST NOT create an unbounded queue, pending map or promise chain

#### Scenario: Transport is not ready

- **WHEN** a trigger occurs while source WebSocket is not ready
- **THEN** coordinator MUST send and queue no mutation
- **AND** it MUST record unknown/not-ready and wait for later explicit ready or scheduled trigger

### Requirement: Active and effective state retain provider-specific evidence

Backend SHALL derive TDX active state only from a fresh terminal-native list and QMT active state only from durable datasource registry. It MUST expose evidence as `tdx_native_list` or `qmt_durable_registry`, MUST NOT create a false common provider inventory, and MUST update effective listener inventory only from fresh readback.

#### Scenario: TDX readback is fresh

- **WHEN** TDX `getSubscriptions()` returns a fresh terminal-native symbol list for current connection
- **THEN** backend MUST compare exact list with ACTIVE desired and publish `activeEvidence=tdx_native_list`

#### Scenario: QMT readback is fresh

- **WHEN** QMT `getSubscriptions()` returns its journal-backed whole/single registry
- **THEN** backend MUST compare registry membership with ACTIVE desired and publish `activeEvidence=qmt_durable_registry`
- **AND** it MUST NOT describe that registry as a QMT native active-list query

#### Scenario: An active Security is not yet subscribed

- **WHEN** Security is ACTIVE but fresh active evidence does not contain its provider symbol
- **THEN** convergence MUST be `drifted` or `blocked`
- **AND** the symbol MUST NOT become an effective candle listener

#### Scenario: An inactive Security remains provider-active

- **WHEN** Security is not ACTIVE but prior fresh effective inventory still contains its provider symbol
- **THEN** snapshots MAY remain accepted until a later reset/readback proves removal
- **AND** convergence MUST be drifted with bounded deferred-removal reason rather than false success
- **AND** successful removal MUST atomically delete it from effective inventory, clean common latest and notify candle listener removal
- **AND** an already registered candle due MUST still reach its owning terminal state

### Requirement: Lifecycle mode has one desired authority and a safe rollback state

`REALTIME_SUBSCRIPTION_LIFECYCLE_MODE` SHALL accept only `off|on` and default to `off`. Mode `off` MUST register no production mutation or 09:15 cron; mode `on` MUST use ACTIVE assignments as the only desired authority and MUST fail startup if either legacy realtime env allowlist is non-empty.

#### Scenario: Lifecycle is deployed disabled

- **WHEN** code and migration are deployed with lifecycle mode off
- **THEN** operators MAY initialize assignments without automatic provider mutation
- **AND** public active state MUST remain unknown/lifecycle-disabled until trustworthy readback exists

#### Scenario: Conflicting desired authorities are configured

- **WHEN** lifecycle mode is on and `TDX_REALTIME_ALLOWLIST` or `QMT_REALTIME_ALLOWLIST` is non-empty
- **THEN** backend startup MUST fail closed naming conflicting configuration
- **AND** it MUST NOT partially start one production coordinator

#### Scenario: Operator rolls lifecycle back

- **WHEN** operator changes lifecycle mode from on to off
- **THEN** backend MUST stop new production triggers without deleting assignments, journal, Redis or MySQL business facts
- **AND** unknown QMT handles MUST remain subject to source-scoped operator recovery

