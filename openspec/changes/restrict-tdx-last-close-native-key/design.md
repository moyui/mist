## Context

TDX exposes two owned market-data paths. Historical bars use datasource HTTP
`/v1/bars/query` and TDX JSON-RPC `get_market_data`. Realtime acquisition runs
inside the terminal bridge, calls local `tq.get_market_snapshot`, POSTs the
complete native object to datasource bridge ingestion, and then broadcasts it
to backend over WebSocket. The independent
`remove-unused-tdx-snapshot-query` change removes the orphaned on-demand
snapshot product route.

Fixtures and datasource field projection identify exact native `LastClose`. The backend nevertheless accepts `PreClose` and canonical-looking `lastClose`, while generic key normalization in datasource can also collapse non-native spellings.

## Goals / Non-Goals

**Goals:**

- Make exact `LastClose` the only accepted TDX realtime native previous-close key.
- Keep datasource acceptance and backend conversion consistent.
- Document the two TDX paths by data purpose and native method.

**Non-Goals:**

- Change canonical `prices.lastClose`.
- Add previous close to TDX historical bars.
- Change database schemas.

## Decisions

Datasource realtime validation reads `native["LastClose"]` exactly and rejects a frame when `PreClose`, `lastClose`, or another normalized spelling attempts to supply the previous-close value without `LastClose`. Backend conversion reads only `LastClose`.

The native object remains otherwise unmodified. Canonical camelCase `prices.lastClose` remains the Mist-owned output name and is not accepted back as provider-native input.

## Risks / Trade-offs

- **An unverified TDX build emits a different spelling** → Treat it as a contract failure and require fixture/HIL evidence before adding any explicit new native key.
- **Canonical output is mistaken for realtime native input** → Keep exact
  native-key tests and document canonical `prices.lastClose` as output only.

## Migration Plan

Deploy datasource validation and backend converter together. HIL must show terminal `tq.get_market_snapshot` emits `LastClose`. Rollback restores both revisions; no data migration is required.

## Open Questions

None.
