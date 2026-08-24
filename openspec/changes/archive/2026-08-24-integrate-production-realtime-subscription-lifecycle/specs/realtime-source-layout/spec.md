## MODIFIED Requirements

### Requirement: Subscription capability parity is checked in code

Both TDX and QMT datasource implementations SHALL support `sync_subscriptions`, `subscribe`, `unsubscribe` and `get_subscriptions`. Both Mist provider clients SHALL expose matching `syncSubscriptions`, `subscribe`, `unsubscribe` and `getSubscriptions` Nest-internal methods through one common interface. This parity SHALL not depend on a dynamic protocol capability advertisement. When lifecycle mode is on, exactly one `apps/mist` lifecycle coordinator MAY call those methods for production convergence; provider clients, public adapters and other apps MUST NOT become independent mutation owners.

#### Scenario: Capability guard runs

- **WHEN** the provider implementations are loaded in tests
- **THEN** all four datasource operations and all four Mist client methods MUST exist, validate their exact request shape and return the simple success-or-failure response
- **AND** the guard MUST fail when any implementation is absent
- **AND** a client method that does not send and match the provider WebSocket request/response MUST fail the guard

#### Scenario: Ready message is inspected

- **WHEN** a provider connects to backend
- **THEN** readiness MUST represent the build's complete control implementation
- **AND** no dynamic capability array is required
- **AND** the client MUST publish readiness without deriving desired or directly starting a control request

#### Scenario: Product caller surface is inspected

- **WHEN** layout and import guards inspect controllers, frontend routes, commands, schedulers and lifecycle hooks
- **THEN** one `apps/mist` lifecycle coordinator MAY be the production subscription mutation caller
- **AND** public raw-control routes, datasource product mutation routes, `apps/schedule`, frontend direct control and provider client-local desired state MUST be absent
- **AND** test-only direct invocation MUST remain clearly separated from the application runtime graph

#### Scenario: Legacy realtime paths are inspected

- **WHEN** lifecycle integration is enabled
- **THEN** it MUST reuse the formal provider clients and four-method interface
- **AND** it MUST NOT restore experimental clients, generic datasource product APIs or retired compatibility aliases
