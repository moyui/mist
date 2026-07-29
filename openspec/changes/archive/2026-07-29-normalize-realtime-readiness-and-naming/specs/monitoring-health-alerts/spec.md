## ADDED Requirements

### Requirement: Readiness consumers use the normalized component contract
Monitoring, deployment health checks, and automated recovery SHALL consume datasource bridge readiness from the normalized component path and SHALL keep service, transport, bridge-owner, subscription, and freshness evidence distinct.

#### Scenario: Root datasource health is evaluated
- **WHEN** monitoring or deployment reads TDX or QMT root health
- **THEN** it reads bridge-owner readiness from `bridge.ready`
- **AND** does not read `tdxRealtimeBridgeReady` or `collectorReady`

#### Scenario: Bridge-scoped health is evaluated
- **WHEN** a guard reads a source bridge health endpoint
- **THEN** it reads top-level `ready` for both TDX and QMT

#### Scenario: Automated recovery evaluates readiness
- **WHEN** a service is healthy and the transport is connected but the bridge owner is unavailable
- **THEN** recovery classifies the bridge layer explicitly
- **AND** does not treat an absent retired field as evidence that the datasource process is down
