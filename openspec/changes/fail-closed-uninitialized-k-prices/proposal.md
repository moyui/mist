## Why

`K` entities currently initialize required OHLC prices to numeric zero, so an unassigned field is indistinguishable from an explicit provider price of zero and can be persisted as apparently valid market data. Required prices need an unmistakable process-local uninitialized state and a fail-closed persistence boundary.

## What Changes

- Initialize new `K` entity `open`, `high`, `low`, and `close` fields to `Number.NaN`.
- Validate all four required prices immediately before K-line persistence and reject missing, non-number, `NaN`, or infinite values.
- Make QMT historical mapping reject the complete nonempty result when a row has invalid required OHLC instead of silently filtering that row out.
- Continue accepting explicit finite numeric zero as provider data.
- Keep the MySQL OHLC columns `DECIMAL(20,2) NOT NULL`; `NaN` is process-local and is never serialized or stored.
- Add regression tests for the entity defaults and persistence guard.
- Do not migrate or repair existing rows as part of this change.

## Capabilities

### New Capabilities

- `k-line-persistence-integrity`: Defines required OHLC initialization and fail-closed persistence behavior for backend K-line records.

### Modified Capabilities

None.

## Impact

- Affected code: shared `K` entity, backend K-line source persistence helpers/services, and QMT historical row mapping.
- Affected tests: entity defaults and source persistence validation.
- Database: no schema or data migration.
- APIs and datasource wire contracts: unchanged.
