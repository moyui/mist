## Context

The shared `K` entity declares OHLC columns as required `DECIMAL(20,2)` values but initializes each TypeScript property to `0`. Source services for TDX, QMT, and EastMoney all persist base rows through `saveBaseK`, which is therefore the common write boundary. A default zero hides incomplete object construction, while JavaScript `NaN` cannot be represented safely in JSON or MySQL and must remain process-local.

## Goals / Non-Goals

**Goals:**

- Make an uninitialized required price visibly invalid in memory.
- Reject non-finite OHLC values before a query builder or database driver receives them.
- Preserve explicit numeric zero and all finite prices.
- Cover every current TDX, QMT, and EastMoney base-K write through one shared guard.
- Prevent QMT historical mapping from hiding malformed provider rows before they reach the shared guard.

**Non-Goals:**

- Changing MySQL column names, nullability, precision, or scale.
- Persisting `NaN` or converting it to SQL `NULL`.
- Repairing existing test data.
- Changing provider normalization or wire contracts.

## Decisions

### Use `Number.NaN` only as the entity construction sentinel

All four required OHLC properties initialize to `Number.NaN`. This makes an omitted assignment fail numeric validity checks instead of silently becoming a valid-looking zero.

An alternative was nullable TypeScript properties and nullable database columns. That would weaken the required-price invariant and require a migration, so it is rejected.

### Validate at the shared base-K persistence boundary

`saveBaseK` validates each row before creating entities or starting an insert query. `Number.isFinite` is applied to `open`, `high`, `low`, and `close`; invalid fields produce an error that identifies the row index, timestamp, and field names.

Validating only in individual provider mappers would leave future or direct writers unprotected. TypeORM entity hooks are also not sufficient because the current bulk query-builder insert path does not provide a reliable single enforcement point for all hook behavior.

### Preserve numeric zero

The guard checks finiteness, not truthiness or positivity. Zero is therefore accepted as explicit provider data.

### QMT historical mapping rejects malformed rows instead of filtering them

QMT column mapping derives candidate row keys from required prices plus bar-level
time, volume, and amount columns. For each candidate row it parses all required
OHLC values, collects the invalid field names, and throws a bad-gateway error
containing the provider symbol and row key if any required value is missing,
blank, non-numeric, `NaN`, or infinite.

The previous alternative of returning `null` from `mapRow` and filtering that row
out is rejected because the caller cannot distinguish a genuinely empty provider
result from a nonempty incomplete result.

## Risks / Trade-offs

- [A previously hidden malformed row now fails the whole save batch] → This is intentional fail-closed behavior; the error includes row context so the collection item can be retried or diagnosed.
- [A malformed QMT row now fails the fetch instead of returning remaining rows] → This preserves authoritative result completeness and exposes symbol, row key, and invalid fields for diagnosis.
- [`NaN` can serialize to `null` in JSON] → The sentinel never crosses a wire boundary; the shared write guard rejects it before persistence, and tests cover this invariant.
- [A future writer bypasses `saveBaseK`] → Keep base-K writes centralized and retain repository-wide tests/search checks for direct K inserts.

## Migration Plan

1. Deploy the backend code with the entity sentinel and shared guard together.
2. Run source persistence tests and the standard backend gates.
3. No database migration or data backfill is required.
4. Rollback consists only of reverting the backend code.

## Open Questions

None.
