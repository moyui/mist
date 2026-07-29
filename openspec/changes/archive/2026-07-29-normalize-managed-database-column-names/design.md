## Context

Migrations 001–009 leave 26 camelCase physical columns in five managed tables.
TypeScript camelCase is correct for application code, and provider payload keys
must remain faithful at adapter boundaries, but physical MySQL columns should
use the same snake_case convention already used by strategy and backtest
tables.

The system has not entered production use, but migration history is still
treated as immutable. Migration 010 therefore renames the current schema
forward instead of rewriting the original CREATE TABLE statements.

## Goals / Non-Goals

**Goals:**

- Eliminate every remaining camelCase physical column in managed application
  tables.
- Preserve TypeScript property, DTO/API, and provider-native names.
- Preserve values, types, nullability, defaults, indexes, FKs, and unique keys.
- Keep migrations 001–009 byte-identical and make fresh 001–010 replay valid.

**Non-Goals:**

- Rename `create_time/update_time` to `created_at/updated_at`; those names are
  already snake_case and lifecycle vocabulary is a separate decision.
- Rename tables, TypeScript properties, JSON keys, HTTP/WS fields, or provider
  payload fields.
- Change previous-close, amount, volume, adjustment, or other field semantics.
- Provide old/new physical-column compatibility.

## Decisions

### Rename exactly 26 physical columns

| Table | TypeScript property | Old physical column | New physical column |
|---|---|---|---|
| `security_source_configs` | `formatCode` | `formatCode` | `format_code` |
| `k` | `securityId` | `securityId` | `security_id` |
| `k_extensions_ef` | `changePct` | `changePct` | `change_pct` |
| `k_extensions_ef` | `changeAmt` | `changeAmt` | `change_amt` |
| `k_extensions_ef` | `turnoverRate` | `turnoverRate` | `turnover_rate` |
| `k_extensions_ef` | `volumeCount` | `volumeCount` | `volume_count` |
| `k_extensions_ef` | `innerVolume` | `innerVolume` | `inner_volume` |
| `k_extensions_ef` | `outerVolume` | `outerVolume` | `outer_volume` |
| `k_extensions_ef` | `prevClose` | `prevClose` | `prev_close` |
| `k_extensions_ef` | `prevOpen` | `prevOpen` | `prev_open` |
| `k_extensions_tdx` | `forwardFactor` | `forwardFactor` | `forward_factor` |
| `k_extensions_tdx` | `volInStock` | `volInStock` | `vol_in_stock` |
| `k_extensions_tdx` | `backwardFactor` | `backwardFactor` | `backward_factor` |
| `k_extensions_tdx` | `volumeRatio` | `volumeRatio` | `volume_ratio` |
| `k_extensions_tdx` | `turnoverRate` | `turnoverRate` | `turnover_rate` |
| `k_extensions_tdx` | `turnoverAmount` | `turnoverAmount` | `turnover_amount` |
| `k_extensions_tdx` | `totalMarketValue` | `totalMarketValue` | `total_market_value` |
| `k_extensions_tdx` | `floatMarketValue` | `floatMarketValue` | `float_market_value` |
| `k_extensions_tdx` | `earningsPerShare` | `earningsPerShare` | `earnings_per_share` |
| `k_extensions_tdx` | `priceEarningsRatio` | `priceEarningsRatio` | `price_earnings_ratio` |
| `k_extensions_tdx` | `priceToBookRatio` | `priceToBookRatio` | `price_to_book_ratio` |
| `k_extensions_qmt` | `preClose` | `preClose` | `pre_close` |
| `k_extensions_qmt` | `suspendFlag` | `suspendFlag` | `suspend_flag` |
| `k_extensions_qmt` | `openInterest` | `openInterest` | `open_interest` |
| `k_extensions_qmt` | `effectiveDividendType` | `effectiveDividendType` | `effective_dividend_type` |
| `k_extensions_qmt` | `nativePeriod` | `nativePeriod` | `native_period` |

Properties whose physical names are already snake_case or single-word remain
unchanged.

### Use MySQL 8 `RENAME COLUMN`

Migration 010 uses `ALTER TABLE ... RENAME COLUMN` so the database preserves
column definitions and updates same-table index/FK references. The migration
does not drop/recreate data or synthesize values.

Alternative considered: rewriting migration 001. Rejected because already
applied migration history must remain immutable and current databases need a
deterministic forward path.

### Explicitly map every renamed property

Entity properties keep camelCase and receive `name: '<snake_case>'`.
QueryBuilder expressions that embed SQL strings use physical snake_case names;
raw result aliases remain camelCase so the in-memory contract is unchanged.

### One atomic application release

There is no alias, view, dual-write, or fallback parsing. Migration 010 and the
matching backend/Chan/schedule images must ship together. The migration runner
finishes before application services become healthy.

## Risks / Trade-offs

- [Raw SQL still references an old physical name] → Workspace scans and focused
  allowlist/audit tests are mandatory.
- [Index or FK metadata changes during rename] → Compare `SHOW CREATE TABLE`
  and information-schema constraints before/after MySQL 8.4 replay.
- [Application rollback targets the old schema] → Restore the pre-migration
  database backup together with prior application SHAs.
- [A previously applied migration is edited] → Hash/contract tests keep
  migrations 001–009 unchanged.

## Migration Plan

1. Run the pre-migration column audit; all expected old columns must exist and
   all target names must be absent.
2. Take and verify a database backup.
3. Apply migration 010 while application services are stopped.
4. Deploy matching backend, Chan, and schedule images.
5. Run the post-migration audit; all old names must be absent and all 26 new
   names present.
6. Verify seeded/real row values plus K unique/FK and extension one-to-one
   constraints.

Rollback restores the database backup and the previous application SHAs as one
unit. Mixed old/new physical-column versions are unsupported.

## Open Questions

None. The user explicitly selected complete physical snake_case normalization
before production use.
