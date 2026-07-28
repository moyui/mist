## ADDED Requirements

### Requirement: Realtime protocol and bridge readiness are distinct
The datasource realtime ready frame SHALL identify successful protocol negotiation separately from terminal bridge-owner readiness, and the backend SHALL expose the accepted protocol state as `transportReady`.

#### Scenario: Datasource emits realtime ready metadata
- **WHEN** a TDX or QMT backend client completes WebSocket negotiation
- **THEN** the datasource emits a `realtime.ready` frame whose data includes `bridge.ready`, `bridge.ownerId`, `bridge.ownerGeneration`, and `bridge.bridgeBuildId`
- **AND** it does not emit `tdxRealtimeBridgeReady`, `collectorReady`, a top-level owner `generation`, or `datasourceBuildId`

#### Scenario: Backend accepts a realtime ready frame
- **WHEN** a source client validates the ready frame
- **THEN** backend diagnostics set `transportReady=true`
- **AND** retain bridge-owner state separately
- **AND** do not infer subscription or market-data freshness from either value
