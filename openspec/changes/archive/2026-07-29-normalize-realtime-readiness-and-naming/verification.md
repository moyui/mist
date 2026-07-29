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

## Resolved baseline gate

The initial rerun found that `mist-monitoring` CI did not contain the required
`python -m pytest tests` entrypoint. The follow-up
`harden-audited-quality-first-batch` change aligned the workflow and installed a
pinned pytest dependency. `node tools/test-ci-contracts.mjs` now passes.

## Production gate

Production HIL is intentionally not fabricated from local tests. Before promotion, pin all four repository artifacts, suspend TDX/QMT recovery, switch producer and consumers together, prove both sources' `transportReady`, `bridge.ready`, subscription/freshness evidence and metrics, then re-enable recovery. Rollback restores all four prior revisions as a set.

## A-contract completion rerun

- Datasource root and scoped bridge health now use strict typed OpenAPI response models. All mode-specific OpenAPI JSON/summary artifacts were regenerated; tests prove the root models expose nested `bridge`, scoped endpoints expose top-level `ready`, and retired fields are absent from those schemas.
- Ready frames retain lowercase outer `provider=tdx|qmt` and use domain `data.source=TDX|QMT`. Backend clients require exact provider-specific ready-data keys and exact bridge keys, so retired or unknown shapes cannot set `transportReady`.
- Monitoring validates strict root/bridge allowlists and reports `unexpected_field` fail-closed without retaining retired contract identifiers in active parser code. Deploy TDX smoke asserts the source label, `transportReady`, and `bridge.ready`; restart-isolation has a dedicated scoped-health contract test.
- Current rerun: Mist ESLint/typecheck, 73 suites / 449 tests, three Docker-target builds; datasource Ruff/Pyright, 418 tests; deploy readiness, restart-isolation, manager, appliance health, QMT smoke, TDX/dual-source soak and both recovery suites; monitoring `go test ./...`; OpenSpec strict 54/54.
- Active runtime scans contain none of the retired readiness identifiers. QMT terminal owner request OpenAPI still contains `generation` by design because the terminal registration protocol is an explicit non-goal and was not changed.

## B naming and layout completion rerun

- Mist provider sources now use `tdx-source.service.ts`, `qmt-source.service.ts`, and `tdx-source-fetcher.interface.ts`; all imports, colocated specs, collector wiring, naming guards, and CI contract path checks were updated without compatibility files.
- The previously completed realtime utility/type/decoder and singular Chan entity paths remain guarded. Entity metadata tests continue to require the existing `chan_bis`, `chan_fenxings`, and `chan_states` table names.
- Datasource gateway implementations now share `src/datasource/<source>/realtime/gateway.py`. QMT subscription collector orchestration remains separately named `realtime/runtime.py`; TDX has no compatibility runtime module and QMT has no compatibility `src/datasource/qmt/bridge.py`.
- The stable `datasource-provider-contract` delta now distinguishes gateway, runtime orchestration, and frame-contract responsibilities, removing the prior spec conflict.
- Current rerun: Mist ESLint/typecheck, 73 suites / 456 tests, three Docker-target builds; datasource 418 tests, Ruff, Pyright; OpenSpec strict 54/54. Focused rename suites additionally passed 76 Mist tests and 58 datasource tests.
- `node tools/test-ci-contracts.mjs` now passes after the monitoring workflow
  follow-up; the renamed TDX source paths and monitoring Python test entrypoint
  are both covered by the same cross-repository guard.
