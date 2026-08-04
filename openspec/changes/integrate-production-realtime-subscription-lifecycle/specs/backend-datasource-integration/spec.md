## MODIFIED Requirements

### Requirement: WebSocket subscription resync

The backend TDX and QMT realtime clients SHALL each expose the same four Nest-internal in-process methods: `syncSubscriptions`, `subscribe`, `unsubscribe` and `getSubscriptions`. Each method SHALL execute the matching datasource WebSocket request and await its typed response. The provider clients MUST NOT derive business desired state themselves; when lifecycle mode is on, the independent production coordinator SHALL derive desired from ACTIVE immutable assignments. Ready/reconnect and weekday 09:15 SHALL perform `getSubscriptions`, full `syncSubscriptions`, then final `getSubscriptions`; eligible intraday activation MAY use one incremental `subscribe`; public application paths MUST NOT call `unsubscribe`.

#### Scenario: Datasource sends ready

- **WHEN** the backend client accepts a WebSocket `ready` message from a TDX or QMT datasource on a new connection
- **THEN** it MUST update connection/readiness state and publish one bounded provider-neutral ready observation
- **AND** the lifecycle coordinator in on mode MUST use that observation to start one authoritative convergence round
- **AND** the client itself MUST NOT construct or cache a desired set

#### Scenario: Production coordinator synchronizes after connection

- **WHEN** the coordinator receives a ready observation while lifecycle mode is on
- **THEN** it MUST read the complete current ACTIVE-assignment provider-symbol set for that source
- **AND** it MUST call `getSubscriptions` once, `syncSubscriptions` once and `getSubscriptions` once more
- **AND** it MUST NOT call incremental `subscribe` or `unsubscribe` to reproduce the full-set transition

#### Scenario: WebSocket reconnects

- **WHEN** a provider WebSocket reconnects after disconnect and accepts a new ready frame
- **THEN** the old pending method MUST already have settled as disconnected/outcome-unknown
- **AND** the new ready observation MUST trigger a fresh database read and full-set convergence
- **AND** backend MUST NOT replay the old request or reuse its request payload as desired authority

#### Scenario: Backend reconnects after an ambiguous mutation

- **WHEN** the provider WebSocket reconnects after a disconnect or lost response
- **THEN** the pending method MUST finish with an outcome-unknown failure
- **AND** backend MUST NOT automatically replay the previous mutation
- **AND** the coordinator MUST explicitly call `getSubscriptions` on the new ready connection before one safe full sync
- **AND** provider evidence MUST NOT replace ACTIVE assignments as desired authority

#### Scenario: An internal method is called

- **WHEN** a Nest test, HIL harness or production coordinator calls one control method on the current provider leader
- **THEN** the client MUST send exactly one matching request on its existing datasource WebSocket
- **AND** the returned Promise MUST settle only from the matching response, bounded timeout, disconnect or local validation failure

#### Scenario: Internal method is called before control readiness

- **WHEN** an in-process caller invokes a method while the provider WebSocket is closed or has not accepted the datasource ready contract
- **THEN** the method MUST fail locally with a stable not-ready result
- **AND** it MUST not send, queue or retry the request

#### Scenario: Datasource rejects the connection as non-leader

- **WHEN** a sent control request receives the datasource's stable non-leader failure
- **THEN** the method MUST return that typed failure to its in-process caller
- **AND** it MUST not retry, reconnect solely for the mutation or infer success

#### Scenario: Production runtime graph is inspected

- **WHEN** modules, controllers, routes, commands and startup lifecycle hooks are inspected
- **THEN** exactly one `apps/mist` lifecycle coordinator MAY call production control methods
- **AND** no public raw-control controller, GraphQL mutation, CLI, diagnostic mutation route, `apps/schedule` caller or provider client-local desired owner MUST exist

## REMOVED Requirements

### Requirement: Internal control validates symbols without adding a business desired coordinator

**Reason**: Production lifecycle now deliberately adds the business desired/effective coordinator that this transport-only requirement deferred.

**Migration**: Symbol validation moves from static env business allowlists to immutable realtime assignments plus ACTIVE Security status and provider-confirmed effective inventory when lifecycle mode is on; provider clients and datasource handle membership remain transport/provider boundaries.

## ADDED Requirements

### Requirement: Internal control validates symbols through ACTIVE immutable assignments and effective state

The TDX and QMT client methods SHALL accept normalized provider symbols and SHALL validate coordinator requests through current immutable realtime assignment inventory before sending control. Mist backend SHALL be sole owner of business authorization and `providerSymbol -> securityId` resolution; `Security.status=ACTIVE` SHALL determine desired membership. Datasource current handle membership SHALL remain a separate provider-allocation check and SHALL NOT be treated as a second business allowlist. TDX datasource's revisioned transport desired state SHALL continue to be updated only by accepted TDX control calls and SHALL not become Mist business desired store.

#### Scenario: An assigned provider symbol is passed

- **WHEN** the coordinator invokes a control method with a symbol that resolves through the current source assignment inventory
- **THEN** backend MUST send that exact normalized provider symbol on the current provider WebSocket
- **AND** QMT MUST retain its market suffix while `Security.code` remains suffix-free

#### Scenario: A provider symbol is not assigned to the source

- **WHEN** one requested provider symbol does not resolve through an immutable assignment for that source
- **THEN** the client method MUST fail locally before sending any control request
- **AND** a partial `syncSubscriptions` request MUST NOT be sent

#### Scenario: Assignments attempt to resolve the same security to both sources

- **WHEN** persisted TDX and QMT assignment inventory would resolve the same canonical `securityId`
- **THEN** initialization or startup validation MUST fail closed before either source is admitted to production lifecycle
- **AND** backend MUST NOT choose a source from arrival order or snapshot freshness

#### Scenario: An assigned Security becomes ACTIVE during the add-only window

- **WHEN** an assigned Security becomes ACTIVE during weekday 09:15–15:00 `Asia/Shanghai`
- **THEN** lifecycle coordinator MAY call only incremental `subscribe` for its immutable provider symbol followed by readback
- **AND** source/providerSymbol MUST remain unchanged
- **AND** the action MUST NOT cancel or rebuild unrelated subscriptions

#### Scenario: An assigned Security becomes inactive

- **WHEN** an assigned Security becomes SUSPENDED or DELISTED
- **THEN** no public application path or status observer MUST call incremental `unsubscribe`
- **AND** removal MUST wait for ready/reconnect or weekday 09:15 full reset

#### Scenario: Effective membership changes

- **WHEN** fresh provider-specific readback proves a symbol was added or removed
- **THEN** backend MUST atomically replace that source's effective inventory
- **AND** snapshot authorization/latest cleanup/candle listener changes MUST follow effective evidence rather than desired intent alone
