## Why

Enabled source configurations can currently omit `formatCode` and silently fall back to canonical `Security.code`, which can route provider requests with the wrong symbol syntax. The K extension `fullCode` column has no business consumer and is populated inconsistently across TDX, QMT, and EastMoney, so it does not provide reliable capture provenance.

## What Changes

- **BREAKING** Require every enabled `SecuritySourceConfig` to have a non-empty provider-specific `formatCode`.
- **BREAKING** Validate enabled TDX and QMT `formatCode` values against their supported provider-symbol grammar and reject invalid configuration writes.
- **BREAKING** Remove the fallback from missing provider `formatCode` to canonical `Security.code`; collection fails closed when no enabled provider symbol exists.
- **BREAKING** Remove `fullCode` from K extension interfaces, entities, save paths, tests, and all three K extension database tables through a new additive migration.
- Preserve `Security.code` as canonical Mist identity and keep the existing `formatCode` code/database name in this change.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `security-code-identity`: Makes enabled provider transport identity mandatory and source-valid, and removes the unsupported third K-line code identity.
- `database-schema-safety`: Removes unused `fullCode` columns through a new forward-only migration without rewriting applied schema history.

## Impact

- Repository: `mist`.
- Runtime boundaries: security source configuration writes and historical K collection routing.
- Persistence: `k_extensions_tdx`, `k_extensions_qmt`, and `k_extensions_ef` lose the unused `fullCode` column in migration `008`.
- Compatibility: callers can no longer enable a source without a valid provider-specific `formatCode`; old application versions that still write `fullCode` are incompatible after migration.
