## ADDED Requirements

### Requirement: Source-level realtime diagnostic endpoints SHALL admit loopback and the mist-network bridge

Backend source-level realtime diagnostic endpoints (`GET /internal/realtime/{tdx,qmt}/status` and
`GET /internal/realtime/{tdx,qmt}/:formatCode`) SHALL admit requests from loopback origins AND from
origins on the `mist-network` Docker bridge network segment, while rejecting all other origins.
The admit rule SHALL be network-segment based, not pinned to a specific container IP, because Docker
reassigns bridge IPs across restarts.

#### Scenario: Loopback origin is admitted

- **WHEN** a request reaches a source-level realtime diagnostic endpoint with `request.ip` being
  `127.x.x.x` (IPv4), `::1`, or the literal `localhost`
- **THEN** the endpoint SHALL process the request normally and return the status payload
- **AND** the IPv4-mapped form `::ffff:127.x.x.x` SHALL be normalized before the loopback check

#### Scenario: mist-network bridge origin is admitted

- **WHEN** the `mist-monitoring` exporter container (or any service on `mist-network`) requests a
  source-level realtime diagnostic endpoint, with `request.ip` being a Docker bridge address in the
  `172.16.0.0/12` range (e.g. `172.18.0.x`)
- **THEN** the endpoint SHALL process the request normally and return the status payload
- **AND** the admit decision SHALL be based on the CIDR segment, not a hardcoded container IP

#### Scenario: Public or unknown origin is rejected

- **WHEN** a request reaches a source-level realtime diagnostic endpoint from an origin that is
  neither loopback nor in the `172.16.0.0/12` bridge segment
- **THEN** the endpoint SHALL reject the request with `403 Forbidden`
- **AND** the response SHALL NOT leak which admit branch failed or echo the origin IP

#### Scenario: Diagnostics remain read-only and payload-unchanged

- **WHEN** an admitted origin reads a source-level diagnostic status
- **THEN** the endpoint SHALL return the same payload shape it returns for loopback callers
  (`mode / schemaVersion / quality / connected / transportReady / lastAcceptedAt / lastCapturedAt /
  rejectCounts / lastReject / lastError`, plus `allowlist` for the status route and the canonical
  snapshot for the `:formatCode` route)
- **AND** no diagnostic endpoint SHALL perform a mutation, recovery action, or datasource operation
- **AND** the payload SHALL NOT contain credentials, tokens, or business secrets (it carries only
  runtime freshness and reject/error state)

#### Scenario: Admission rule is a single shared guard

- **WHEN** any controller under `internal/realtime/{tdx,qmt}` handles a diagnostic request
- **THEN** it SHALL delegate origin admission to the shared `requireRealtimeDiagnosticLoopback`
  guard (renamed or supplemented as needed), so the admit rule cannot diverge per source
- **AND** the bridge-segment admit SHALL apply uniformly to both TDX and QMT source diagnostics
