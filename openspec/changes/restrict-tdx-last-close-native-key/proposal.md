## Why

TDX realtime fixtures and the native `get_market_snapshot` contract establish `LastClose` as the provider field, but the backend converter also accepts `PreClose` and camelCase `lastClose`. Those unproven aliases blur the boundary between provider-native input and Mist canonical output.

## What Changes

- **BREAKING** Accept only exact native `LastClose` as the TDX realtime previous-close input.
- Remove backend `PreClose` and `lastClose` fallback aliases.
- Make datasource realtime validation reject non-native previous-close spellings instead of accepting a frame that backend later interprets differently.
- Add negative tests for retired aliases and document the separate TDX
  historical-bars and realtime-bridge paths.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `realtime-market-data-ingress`: Requires exact TDX native `LastClose` at the datasource and backend conversion boundaries.

## Impact

- Repositories: `mist` and `mist-datasource`.
- Runtime contract: TDX realtime native snapshots using only `PreClose` or `lastClose` no longer populate or pass validation as the previous-close field.
- No database or HTTP historical-bars schema change. The independent
  `remove-unused-tdx-snapshot-query` change removes the orphaned normalized HTTP
  snapshot route.
