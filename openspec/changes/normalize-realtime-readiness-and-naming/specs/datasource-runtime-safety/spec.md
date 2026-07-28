## MODIFIED Requirements

### Requirement: Datasource health reports component readiness

The datasource service SHALL expose HTTP provider readiness on application health and SHALL expose builtin bridge owner, subscription, freshness, and error state through source-neutral component paths.

#### Scenario: Health endpoint is called after startup

- **WHEN** `GET /health` is called after datasource startup
- **THEN** the response MUST include provider HTTP reachability and public service connection state
- **AND** TDX and QMT bridge-owner state MUST be nested at `bridge.ready`
- **AND** the bridge object MUST use `ownerId`, `ownerGeneration`, and `bridgeBuildId` for owner metadata
- **AND** it MUST NOT expose `tdxRealtimeBridgeReady`, `collectorReady`, removed process-local adapter, TQ, queue, or legacy collector fields

#### Scenario: Bridge-scoped health is called

- **WHEN** a caller reads `/tdx/bridge/health` or `/qmt/bridge/health`
- **THEN** the bridge health object MUST expose its readiness as top-level `ready`
- **AND** both providers MUST use the same owner metadata names

#### Scenario: Provider HTTP probe fails

- **WHEN** the provider health probe cannot reach the TDX HTTP endpoint
- **THEN** health output MUST report provider readiness as false with a stable error field
- **AND** the process MUST remain observable to WinSW and deployment health checks
