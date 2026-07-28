# Verification

Date: 2026-07-28

## Automated evidence

### `mist`

- ESLint over `{src,apps,libs,test}/**/*.ts`: passed.
- TypeScript `tsc --noEmit`: passed.
- Jest with `TZ=UTC`, `--runInBand`, and `--watchman=false`: 73 suites and
  463 tests passed.
- Docker-target Nest builds (`mist`, `chan`, `realtime-subscription-hil`):
  passed.
- Focused realtime decoder/ingress tests: 3 suites and 16 tests passed.
- Focused strategy scan transaction tests: 1 suite and 3 tests passed,
  including alert-write rollback.
- `openspec validate --all --strict`: 55 items passed, 0 failed.

### `mist-datasource`

- Full pytest: 430 tests passed.
- Ruff: passed.
- Pyright: 0 errors, 0 warnings.
- Focused TDX normalization tests: 82 tests passed.
- Focused WebSocket manager tests: 6 tests passed.
- OpenAPI artifacts regenerated with `uv run python scripts/export_openapi.py
  --all`; artifact contract tests: 4 passed.

### Cross-repository hygiene

- `git diff --check`: passed in `mist`, `mist-datasource`, `mist-deploy`, and
  `mist-monitoring`.
- `node tools/test-ci-contracts.mjs`: passed after monitoring CI was aligned
  with the required Python contract-test entrypoint.
- Runtime old-name scan found no use of `tdxRealtimeBridgeReady`,
  `collectorReady`, or `datasourceBuildId`. Remaining occurrences are negative
  contract/retired-name tests.

### `mist-monitoring`

- Go tests: passed.
- Go vet: passed.
- Go formatting check: passed.
- Python contract suite through pytest 9.1.1: 8 tests passed.
- CI now installs `pytest==9.1.1` and runs `python -m pytest tests`; the
  previously recorded cross-repository gate failure is resolved.

## Boundaries not claimed

- No database migration or production schema mutation was performed.
- No database unique constraint was added for
  `StrategyAlertEvent.dedupeKey`; application-level pre-check remains.
- No Windows/terminal HIL or production release was performed.
- O-04 schedule production reachability and O-06 QMT command capacity remain
  routed to separate changes.
