## Why

Historical TDX and QMT bars currently collapse missing `volume`/`amount` into zero and round `volume` into a MySQL `BIGINT`, so persisted rows cannot distinguish an explicit provider zero from missing or invalid data and cannot preserve provider decimal precision.

## What Changes

- **BREAKING** Change normalized historical `volume` and `amount` to nullable exact decimal values: finite provider values, including zero, are preserved; missing, blank, non-numeric, `NaN`, and infinities become `null`.
- **BREAKING** Change `k.volume` and `k.amount` to `DECIMAL(36,8) NULL` through a new forward-only migration; do not rewrite applied migrations.
- Remove TDX `float` coercion and zero filling, QMT missing-value zero filling and row rejection based only on missing volume, backend `Math.round()`, and backend `?? 0`.
- Carry exact decimal strings across HTTP and TypeScript persistence boundaries and keep nullable values nullable at downstream API/calculation boundaries.
- Add datasource, backend, schema, migration, and MySQL round-trip tests, including explicit rejection of legacy zero filling and precision loss.
- Preserve existing stored numeric values during migration. Previously rounded or zero-filled history is not inferentially repaired; authoritative re-fetch is separate operational work.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `datasource-provider-contract`: TDX and QMT historical bar contracts preserve finite decimal `volume`/`amount` and encode absent or non-finite values as explicit `null`.
- `database-schema-safety`: The shared `k` table stores nullable `volume` and `amount` as `DECIMAL(36,8)` through a forward-only, guarded migration with exact round-trip verification.

## Impact

- Repositories: `mist-datasource` and `mist`.
- APIs: normalized TDX `/v1/bars/query` and QMT historical payload consumption change `volume`/`amount` from JSON numbers to decimal strings or `null`.
- Database: new migration after the current latest migration changes two shared `k` columns; TDX, QMT, and existing EastMoney writes use the new schema.
- Backend: shared source DTOs, TypeORM `K`, upsert helpers, Chan/indicator/strategy consumers, and tests must handle `string | null`.
- Deployment: migration must precede application rollout; rollback is application rollback only unless a separately rehearsed reverse data migration is authorized.
