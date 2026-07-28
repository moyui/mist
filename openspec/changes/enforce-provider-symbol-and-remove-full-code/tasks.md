## 1. Provider symbol configuration

- [x] 1.1 Require a trimmed, non-empty `formatCode` for enabled source configs and validate enabled TDX/QMT provider-symbol grammar.
- [x] 1.2 Remove canonical `Security.code` fallback from provider-symbol resolution and add fail-closed unit/collection tests.

## 2. Remove unused K extension identity

- [x] 2.1 Remove `fullCode` from extension interfaces, entities, TDX/QMT/EastMoney save payloads, and affected tests.
- [x] 2.2 Add migration `008` and schema guards that remove and reject all three legacy `fullCode` columns without editing historical migrations.
- [x] 2.3 Document the pre-deployment source-config audit, destructive migration backup, atomic deployment, and rollback requirements.

## 3. Verification

- [x] 3.1 Run focused security, source, extension-schema, and migration tests plus typecheck and lint.
- [x] 3.2 Run strict OpenSpec validation and active-code scans proving no `fullCode` or provider-symbol fallback remains.
