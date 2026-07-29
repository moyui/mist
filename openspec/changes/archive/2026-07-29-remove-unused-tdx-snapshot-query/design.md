## Context

TDX currently exposes three acquisition paths: historical bars through
`/v1/bars/query`, an on-demand normalized snapshot through
`/v1/snapshots/query`, and terminal-owned realtime snapshots through the bridge
and datasource WebSocket. Repository-wide call-site analysis found no production
consumer of `TdxSource.fetchSnapshot`; only tests and the TDX runtime smoke call
the normalized snapshot endpoint.

The endpoint therefore duplicates the native `get_market_snapshot` capability
without participating in realtime ingress. QMT intentionally has no matching V1
snapshot route because its realtime source is native subscriptions.

## Goals / Non-Goals

**Goals:**

- Remove the orphaned TDX on-demand snapshot product path end to end.
- Leave one unambiguous TDX historical path and one unambiguous TDX realtime path.
- Make active contracts, generated OpenAPI, smoke scripts, and documentation match
  the runtime surface.
- Return 404 for the removed route with no alias or compatibility parser.

**Non-Goals:**

- Do not change `/v1/bars/query`.
- Do not change terminal bridge acquisition, `/tdx/bridge/snapshot`, or the TDX
  realtime WebSocket.
- Do not add a QMT `/v1/snapshots/query` endpoint.
- Do not rewrite archived OpenSpec evidence that describes the former route.
- Do not change database schemas or persisted market data.

## Decisions

1. Delete the complete vertical slice rather than only the HTTP route. The
   backend method, interface/type, provider operation, route models,
   normalization used exclusively by the route, tests, smoke probe, and living
   documentation are removed together. This prevents an apparently supported
   internal API from surviving without a transport.
2. Keep terminal-native `get_market_snapshot` realtime acquisition. The same
   native method name does not make the paths equivalent: realtime ownership,
   subscription control, ingress validation, and transport remain in the
   dedicated bridge/WebSocket path.
3. Remove normalized snapshot smoke coverage. Runtime proof remains split between
   historical `get_market_data`/`/v1/bars/query` and realtime bridge/WebSocket HIL.
   A raw diagnostic command is not promoted to a product contract.
4. Regenerate TDX OpenAPI artifacts from the post-removal application rather than
   hand-editing route entries. Archived OpenSpec remains immutable historical
   evidence.

## Risks / Trade-offs

- [Unknown external caller receives 404] → Release atomically and state the
  breaking removal in OpenSpec; repository and deployment scans show no owned
  production caller.
- [Smoke loses a native snapshot check] → Realtime HIL remains the authoritative
  snapshot proof, while bar smoke continues to validate normalized HTTP.
- [Shared normalization is accidentally removed] → Delete only functions and
  models proven by call-site search to belong exclusively to `get_snapshots`.
- [Generated references drift] → Regenerate OpenAPI and run artifact consistency
  tests plus a workspace search for the old endpoint.

## Migration Plan

1. Remove owned callers first in the same release set.
2. Remove backend and datasource implementation surfaces.
3. Regenerate OpenAPI and update living contracts/documentation.
4. Run backend, datasource, deploy smoke-script tests, and strict OpenSpec
   validation.
5. Deploy `mist`, `mist-datasource`, and `mist-deploy` together.

Rollback requires restoring the same three-repository revision set; mixed
versions are unsupported.

## Open Questions

None. The user confirmed the endpoint has no long-term role and should be removed.
