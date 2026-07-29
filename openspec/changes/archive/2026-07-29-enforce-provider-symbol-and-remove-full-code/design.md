## Context

Mist has two valid security identities: canonical `Security.code` and the provider-specific transport value stored as `SecuritySourceConfig.formatCode`. The configuration write path currently converts an omitted value to `''`, and `getSecurityFormatCode()` plus TDX/QMT save paths fall back to canonical `Security.code`. This can send a pure code to an API that requires a market-qualified provider symbol.

The three K extension schemas also contain `fullCode`, but it has no runtime reader. TDX derives it from the current source config during save, QMT copies the fetch argument, and EastMoney generally writes an empty value. It therefore neither identifies a third code domain nor proves collection provenance.

Migration `007` is already allocated to exact K decimal storage in the current working tree. Applied migrations remain immutable, so this change uses migration `008`.

## Goals / Non-Goals

**Goals:**

- Make `formatCode` the mandatory provider transport value whenever a source config is enabled.
- Reject malformed enabled TDX/QMT symbols before persistence.
- Make provider routing fail closed instead of substituting canonical `Security.code`.
- Remove the unused `fullCode` model and columns without rewriting migration history.

**Non-Goals:**

- Rename the TypeScript property or database column `formatCode`.
- Rename `Security.code`.
- Introduce per-K capture provenance.
- Change provider-native response fields.
- Validate or redesign EastMoney symbol grammar in this change.

## Decisions

### Validate source configuration at the write boundary

`SecurityService.addSecuritySource()` trims `formatCode`, computes the effective `enabled` value, and rejects an enabled config when the symbol is empty. Enabled TDX/QMT configs additionally require the exact market-qualified form `dddddd.SH`, `dddddd.SZ`, or `dddddd.BJ`.

Disabled configs may retain an empty symbol so callers can stage an inactive source before configuring it. EastMoney is subject to the non-empty enabled invariant but its provider grammar remains outside this change.

Alternative considered: accept lowercase or silently normalize symbols. Rejected because `formatCode` is a provider transport identifier and hidden normalization can conceal a configuration error.

### Provider-symbol lookup fails closed

`getSecurityFormatCode()` returns the enabled source config's trimmed `formatCode` and throws a stable configuration error if the config or value is absent. TDX and QMT save paths stop re-deriving a provider symbol because K persistence is keyed by `securityId`, not `fullCode`.

Alternative considered: retain the fallback for non-TDX/QMT callers. Rejected because a canonical code is not a valid generic replacement for a provider transport symbol.

### Remove `fullCode` instead of renaming it

The field is removed from source extension interfaces, TypeORM entities, upsert payloads, and tests. Migration `008_remove_k_extension_full_code.sql` drops it from `k_extensions_tdx`, `k_extensions_qmt`, and `k_extensions_ef`.

Alternative considered: rename it to `providerSymbolAtCapture`. Rejected because the existing producers do not establish that semantic and no consumer needs it.

### Migration remains forward-only

Migration `001` is not edited. Application code and migration `008` deploy atomically; old binaries are not supported after the columns are dropped. Rollback restores both the prior application SHA and database backup rather than pretending the removed, semantically unreliable values can be reconstructed.

## Risks / Trade-offs

- **Existing enabled rows may have empty or malformed values** → Run a pre-deployment audit query and correct configuration before deploying the fail-closed application.
- **Dropping columns is destructive** → Confirm zero consumers, back up the database, and deploy migration plus application in one maintenance window.
- **Strict uppercase grammar may reject previously tolerated input** → Return a clear validation error with accepted examples instead of silently changing the value.
- **A disabled empty config can later be enabled outside the service** → TypeORM synchronization remains disabled and supported writes must use the validated service boundary; operational audit checks direct database drift.

## Migration Plan

1. Audit active code for `fullCode` readers and enabled source configs with empty or invalid `formatCode`.
2. Deploy application validation and `fullCode`-free entities together with migration `008`.
3. Run the migration after a database backup; verify the three columns are absent and K row counts are unchanged.
4. Run collection contract tests proving missing/invalid provider symbols fail before any provider request.
5. Roll back as a coordinated database restore and application rollback if required.

## Open Questions

None. EastMoney-specific symbol grammar remains explicitly deferred.
