# Verification

## Local automated gates

- `mist-datasource`: OpenAPI regenerated; 455 pytest tests passed; Ruff passed;
  Pyright reported 0 errors.
- `mist-monitoring`: `go test ./...`, `go vet ./...`, and 8 Python metric
  contract tests passed.
- `mist`: ESLint and TypeScript passed; 454 Jest tests passed with one
  environment-gated MySQL test skipped; the same suite passed with coverage.
  CI release contracts and all three Docker build targets passed.
- OpenSpec strict validation passed for all 56 specs/changes.
- `git diff --check` passed in `mist`, `mist-datasource`,
  `mist-monitoring`, and `mist-deploy`.
- Migration `006_strategy_platform_core.sql` remained byte-identical at
  SHA-256
  `654937d497a1072fb7880e797f0a63b24e3da7f720cf2d528009a4c3875897a8`.

## Release gates not claimed locally

- Run `strategy-alert-event.mysql.spec.ts` against an isolated database via
  `MIST_TEST_MYSQL_URL`; it verifies the exact named unique index and never
  falls back to production.
- Run QMT terminal HIL with a registered owner to observe saturation,
  terminal-result retention/expiry, the new health fields, and monitoring
  samples under real payload sizes.
- Preserve the four-repository atomic release/rollback rule for public health
  contract consumers.
