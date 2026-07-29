## Why

TDX `POST /v1/snapshots/query` is an orphaned on-demand snapshot path: production
business code does not call it, while realtime snapshots already have a dedicated
terminal-bridge-to-WebSocket path. Keeping the endpoint, backend wrapper, and smoke
coverage creates a third TDX acquisition path that is easy to confuse with realtime
and has no long-term product owner.

## What Changes

- **BREAKING** Remove TDX datasource `POST /v1/snapshots/query` and its request,
  provider, operation, normalization, and response-model code that has no other
  consumer.
- **BREAKING** Remove `TdxSource.fetchSnapshot`, `TdxSnapshot`, and the corresponding
  source-fetcher interface contract.
- Remove the normalized snapshot probe from TDX runtime smoke; retain direct proof
  for historical bars and the dedicated realtime bridge/WebSocket path.
- Remove active tests, generated OpenAPI entries, reference matrices, and living
  documentation that advertise the endpoint.
- Do not add a QMT equivalent and do not change TDX historical bars or realtime
  acquisition.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backend-datasource-integration`: Remove the unused backend-to-datasource
  on-demand TDX snapshot contract and its tests/documentation requirements.
- `mist-api-path-standardization`: Remove `/v1/snapshots/query` from the protected
  datasource route set.
- `tdx-interface-coverage`: Reclassify `get_market_snapshot` as realtime-bridge
  acquisition rather than a normalized product endpoint and remove its normalized
  smoke requirement.
- `datasource-provider-contract`: Limit provider-neutral public product routes to
  supported product capabilities; realtime native snapshots remain internal.

## Impact

- `mist`: TDX source interface/service/types/tests, living OpenSpec, and integration
  documentation.
- `mist-datasource`: TDX V1 router, provider/market operation/model/normalization
  code, tests, README/reference artifacts, and generated OpenAPI.
- `mist-deploy`: TDX runtime smoke and its tests/docs.
- Clients calling `/v1/snapshots/query` will receive 404 after the atomic release;
  no compatibility alias or replacement endpoint is provided.
