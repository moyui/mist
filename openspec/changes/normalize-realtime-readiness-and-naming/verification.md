# Verification Record

## Baseline revisions

- `mist`: `cc964cd67d5f`
- `mist-datasource`: `332fff958435`
- `mist-deploy`: `49ad9663a2c9`
- `mist-monitoring`: `9136ba4aa742`

All four repositories were clean on `master` before implementation. Worktrees were excluded.

## Passed

- Mist: ESLint, TypeScript typecheck, 73 Jest suites / 446 tests, `mist`, `chan`, and `realtime-subscription-hil` builds.
- OpenSpec: `openspec validate --all --strict`, 54 items passed.
- Datasource: Ruff, Pyright, 413 pytest tests; OpenAPI artifacts regenerated with `scripts/export_openapi.py --all`.
- Deploy: datasource manager, appliance health, TDX bridge soak, dual-source soak, and TDX/QMT recovery PowerShell contract tests.
- Monitoring: `go test ./...`, including loopback `httptest` cases outside the restricted sandbox.
- Active-source scans: retired readiness identifiers are absent from runtime code; retired file paths are absent.

## Unrelated baseline gate

`node tools/test-ci-contracts.mjs` fails because the current `mist-monitoring` CI workflow does not contain the pre-existing required literal `python -m pytest tests`. No file in that workflow was changed by this change. This gate remains external to the readiness/naming implementation and must not be reported as a regression introduced here.

## Production gate

Production HIL is intentionally not fabricated from local tests. Before promotion, pin all four repository artifacts, suspend TDX/QMT recovery, switch producer and consumers together, prove both sources' `transportReady`, `bridge.ready`, subscription/freshness evidence and metrics, then re-enable recovery. Rollback restores all four prior revisions as a set.
