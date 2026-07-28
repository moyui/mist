## Why

TDX and QMT currently expose the same bridge-owner readiness through incompatible names and paths, while the backend also uses `ready` for WebSocket protocol readiness. Deployment guards and monitoring therefore require source-specific branches and can misclassify a healthy datasource process or transport as an unavailable bridge. Related internal symbols, files, and directories also obscure ownership and lifecycle boundaries across the realtime and source layers.

## What Changes

- **BREAKING** Normalize datasource root health to expose bridge-owner state at `bridge.ready` for both TDX and QMT, while bridge-scoped health endpoints expose top-level `ready`.
- **BREAKING** Normalize `realtime.ready` metadata to a nested `bridge` object and rename backend protocol readiness to `transportReady`.
- **BREAKING** Use `TDX|QMT` for the ready-frame domain `data.source` while preserving lowercase `tdx|qmt` for the outer transport `provider`.
- **BREAKING** Remove `tdxRealtimeBridgeReady`, `collectorReady`, ambiguous public `generation`, and unproduced `datasourceBuildId` fields without compatibility aliases.
- Update backend, deployment guards, monitoring collectors, tests, and operator documentation atomically.
- Align approved internal error APIs, provider source-service/fetcher names, realtime types/decoders, Chan entity names, datasource gateway paths, and TDX market-normalization paths with their actual responsibilities.
- Establish reusable naming rules for identities, lifecycle timestamps, files, directories, and external or persisted compatibility boundaries.
- Rewrite the realtime/history audit and reusable quality checklist with evidence-backed findings and explicit finding states.

## Capabilities

### New Capabilities

- `cross-repo-naming-governance`: Defines semantic naming, file/path alignment, and explicit exemptions for provider-native and persisted contracts.

### Modified Capabilities

- `realtime-market-data-ingress`: Distinguishes transport readiness from bridge-owner readiness and normalizes ready-frame metadata.
- `datasource-runtime-safety`: Normalizes root and bridge-scoped health contracts without changing terminal registration semantics.
- `datasource-provider-contract`: Separates the shared realtime gateway path from provider-specific runtime orchestration.
- `monitoring-health-alerts`: Requires monitoring and recovery consumers to use the normalized readiness contract.

## Impact

- Repositories: `mist`, `mist-datasource`, `mist-deploy`, and `mist-monitoring`.
- Public/runtime contracts: datasource `/health`, bridge health endpoints, datasource WebSocket `realtime.ready`, backend diagnostics, metrics collectors, and recovery scripts.
- Internal paths: selected realtime utilities, source services, Chan entities, datasource gateways, and normalization modules.
- Release: mixed old/new component versions are unsupported; deployment and rollback must switch all consumers and producers as one coordinated release.
- Exclusions: database table/column names, provider-native payload fields, and terminal bridge registration payloads remain unchanged.
- Dependency: this change is authoritative for the final `realtime.ready` shape; `migrate-qmt-realtime-to-native-subscription` MUST consume it and MUST NOT define a competing ready-frame contract.
