## Context

The shared `k` table currently stores `volume` as non-null `BIGINT` and `amount` as non-null `DECIMAL(20,2)`. TDX normalization converts native values to Python `float`, maps missing values to `0.0`, and the backend rounds volume before persistence. QMT rejects a row whose volume is missing and maps missing amount to zero. These behaviors destroy provider precision and missing-value provenance before MySQL.

The table is shared by TDX, QMT, and EastMoney. Applied migrations are immutable. Historical rows that were already rounded or zero-filled cannot be repaired without a provider re-fetch.

## Goals / Non-Goals

**Goals:**

- Preserve finite `volume` and `amount` values, including explicit zero, without binary-float or integer-rounding loss.
- Represent missing, blank, non-numeric, `NaN`, and infinite values as explicit `null` through the normalized wire contract and SQL `NULL`.
- Store both columns as nullable `DECIMAL(36,8)` through a new forward-only migration.
- Make nullable semantics visible to downstream consumers rather than silently coercing unknown values to zero.
- Prove schema compatibility and exact decimal/null round trips with automated tests.

**Non-Goals:**

- Repair or infer the provenance of existing zero or rounded rows.
- Rename database columns, `timestamp`, provider-native fields, or source-extension fields.
- Change OHLC validation; nonempty rows with missing or invalid OHLC remain invalid.
- Preserve lexical formatting such as the difference between `100.0` and `100.00`.
- Change realtime cumulative counters or Redis candle arithmetic.

## Decisions

### Use `null`, not `NaN`, as the cross-boundary missing representation

Python and JavaScript can hold IEEE `NaN`, but standard JSON and MySQL `DECIMAL` cannot reliably preserve it. Datasource normalization therefore maps missing, blank, non-numeric, and non-finite values to `None`; JSON emits explicit `null`; TypeScript and TypeORM use `null`; MySQL stores `NULL`. A provider numeric zero remains zero.

Alternative considered: encode `"NaN"` as a string. Rejected because it mixes numeric and sentinel strings, weakens schema validation, and complicates every consumer.

### Carry exact finite decimals as strings

Datasource normalization uses `Decimal(str(value))` for finite native values and serializes normalized `volume`/`amount` as JSON decimal strings. The backend validates canonical decimal strings and carries them to TypeORM without conversion to JavaScript `number` or `bigint`.

Alternative considered: continue using JSON numbers. Rejected because Python `float` and JavaScript `number` can lose decimal or large-integer precision before persistence.

### Store both columns as `DECIMAL(36,8) NULL`

`DECIMAL(36,8)` provides 28 integer digits and eight fractional digits, exceeding observed TDX/QMT samples while avoiding maximum-width `DECIMAL(65,30)` storage overhead. Both columns use the same exact-decimal representation because volume may be fractional and must not be rounded.

Values with more than eight fractional digits or more than 28 integer digits are rejected before persistence and surfaced as provider-contract errors; they are never silently rounded by MySQL.

### Keep OHLC strict and make only volume/amount nullable

Missing or invalid OHLC still invalidates a nonempty historical result. Missing `volume` or `amount` does not discard an otherwise valid bar. This preserves price-bar integrity while retaining provider absence rather than manufacturing a zero.

### Apply the migration before the new applications

The new migration changes existing numeric values losslessly into wider decimals and permits null. Old application builds can continue writing integer volume and two-decimal amount into the widened schema, so application rollback does not require a reverse migration. The new application must not deploy before the migration succeeds.

## Risks / Trade-offs

- [Existing zero provenance is unrecoverable] → Preserve existing values and schedule any authoritative re-fetch separately.
- [Nullable values reach algorithms that assumed numbers] → Update types and choose explicit behavior at every consumer; presentation may emit `null`, while calculations that require volume/amount must skip or mark the metric unavailable rather than coerce zero.
- [Decimal strings are a breaking HTTP shape] → Update TDX/QMT producers and Mist consumers atomically and add contract tests that reject legacy numeric coercion.
- [Out-of-range provider values could be truncated by MySQL] → Validate precision and scale before insert and fail the work item instead of relying on database coercion.
- [Migration can lock a large `k` table] → Measure production row count/table size, run the migration in a maintenance window, and capture duration and free-space evidence before application rollout.
- [EastMoney shares the table] → Keep its provider-specific missing-value semantics out of scope and adapt its existing numeric persistence values to decimal strings without changing its zero-filled behavior.

## Migration Plan

1. Add a new migration after the current latest migration. Do not edit migrations `001` through `006`.
2. Before production, record `k` row count, table size, current column definitions, and a digest/count grouped by source.
3. Alter `volume` and `amount` to `DECIMAL(36,8) NULL`.
4. Verify all preexisting rows retain the same numeric values and row counts.
5. Deploy datasource and backend builds that emit/consume decimal strings and explicit nulls.
6. Run TDX/QMT target-day HIL and MySQL readback for explicit zero, fractional volume, missing values, and large amount.
7. Roll back application images together if needed; leave the backward-compatible widened schema in place. A reverse schema migration is not part of ordinary rollback.

## Open Questions

None. The user confirmed nullable missing semantics and `DECIMAL(36,8)` for both columns.
