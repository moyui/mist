## MODIFIED Requirements

### Requirement: Diagnostic endpoints are retired to structured logs

The datasource SHALL NOT expose passive diagnostic readback endpoints;
diagnostic information SHALL be read from structured logs instead. The
`GET /providers` capability listing and the `GET /tdx/bridge/evidence/{symbol}`
native evidence readback SHALL be removed. The `POST /v1/raw/tdx/call`
active probe SHALL remain the only diagnostic tool, because passive logs
cannot answer "does this TDX SDK method exist" probes.

#### Scenario: Capability listing is removed

- **WHEN** `GET /providers` is requested on the TDX datasource
- **THEN** the route MUST NOT exist (404)
- **AND** no production consumer SHALL depend on it

#### Scenario: Evidence readback is removed; reconciliation uses backend logs

- **WHEN** shadow HIL needs to reconcile native frames against the
  decode/convert layer
- **THEN** the reconciliation fields (nativeKeys, asOf, volume, amount) SHALL
  be read from the backend `candle ingest start` log
- **AND** `GET /tdx/bridge/evidence/{symbol}` MUST NOT exist (404)
- **AND** the datasource MUST NOT emit a per-frame evidence log (the
  datasource deletes the evidence cache entirely)

#### Scenario: Raw TDX probe stays

- **WHEN** an operator needs to probe a TDX SDK capability
- **THEN** `POST /v1/raw/tdx/call` MUST remain available as the single active
  diagnostic tool
- **AND** it MUST remain the only passthrough endpoint (QMT has no equivalent)
