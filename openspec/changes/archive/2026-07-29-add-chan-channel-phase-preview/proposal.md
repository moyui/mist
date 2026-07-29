## Why

The Chan channel endpoint currently exposes only a flat final array, while the
Bi pipeline already exposes inspectable Phase A and Phase B results. The pending
channel refactor also labels every detected candidate Valid, so its advertised
Phase B reduction is an identity operation and cannot explain or consume invalid
intermediate channels.

## What Changes

- **BREAKING** Change the `/v1/chan/channel` response envelope's `data` payload
  to `{ phaseA, phaseB }` instead of a bare channel array.
- Preserve every detected base channel in Phase A and classify it with the
  established range and endpoint-extreme validity rules.
- Reduce overlapping, zone-compatible spans that contain Invalid candidates,
  then expose only Valid fixed-point channels in Phase B.
- Make frontend API and snapshot boundaries accept both legacy arrays and the
  canonical two-phase object while rendering Phase B by default.
- Keep real market snapshots in `mist-fe`; backend Chan unit tests use only
  self-contained synthetic data.

## Capabilities

### New Capabilities
- `chan-channel-phase-preview`: Two-phase channel calculation, API response,
  frontend compatibility, snapshot generation, and display behavior.

### Modified Capabilities
- `chan-bi-phase-preview`: Snapshot regeneration may now update canonical
  two-phase channel data instead of preserving the legacy channel fixture.

## Impact

- `mist`: Channel service, response schema, synthetic regression tests,
  snapshot export tooling, and OpenSpec contracts.
- `mist-fe`: Chan API types, live chart selection, test-console snapshot
  normalization, statistics, generated channel fixtures, and documentation.
- Rollout remains compatible because frontend normalization accepts the legacy
  bare-array response while backend deployment converges to the canonical
  two-phase object.
