# Local cross-repository validation — 2026-08-05

Scope: automated and real-MySQL gates for task 6.1 only. This evidence does not satisfy deployment,
Windows terminal, trading-session, 09:15, promotion or rollback HIL tasks 6.2–6.8.

## mist

- `pnpm run lint:check`: passed.
- `pnpm run typecheck`: passed.
- `TZ=UTC pnpm run test:ci`: 142 suites passed, 2 suites skipped; 1148 tests passed,
  3 tests skipped. The sandbox run first exposed expected `listen EPERM` failures for tests that
  bind a local HTTP port; the authoritative rerun outside the sandbox passed.
- `pnpm run ci:contracts`: passed.
- `pnpm run build:docker`: `mist`, `chan`, `signal` and `realtime-subscription-hil` passed.
- `openspec validate --all --strict`: 68 items passed, 0 failed.
- `git diff --check`: passed.
- retired ready-allowlist search for `TDX_SUBSCRIBE_ALLOWLIST_ON_READY` and
  `QMT_SUBSCRIBE_ALLOWLIST_ON_READY`: no implementation match.

## Real MySQL 8.4 migration

An isolated `mysql:8.4` container bound only to `127.0.0.1:33316` ran
`tools/test-realtime-subscription-assignment-migration.mjs`. Migration 015 passed:

- clean full migration 001 through 015;
- repair-forward from a known partial index state;
- fail-closed rejection for an unknown pre-existing assignment table without recording 015;
- exact columns, named indexes, restrictive foreign keys and migration-ledger assertions.

The temporary container used `--rm` and was stopped after the test.

## mist-datasource

- `uv run pytest`: 468 passed, 1 deprecation warning.
- `uv run ruff check .`: passed.
- `uv run pyright`: 0 errors, warnings or information diagnostics.
- `git diff --check`: passed.

The first sandbox attempt stopped before tests because `uv` could not access its user cache; the
authoritative rerun outside the sandbox passed.

## mist-monitoring

- `go test ./...`: passed, including datasource, exporter, metrics and probe packages.
- `python3 -m unittest tests/test_metrics_contract.py`: 8 passed.
- `git diff --check`: passed.

## mist-deploy

Using `pwsh-preview`, the lifecycle mode, deploy appliance, Compose, lifecycle audit, QMT recovery,
health-check and workflow-config contract suites all passed. `git diff --check` passed. The audit
contract also proves preflight can record `assignmentReadback.tsv=table_absent` before migration 015
instead of querying a table that does not exist.

## Remaining evidence gates

No production deployment, terminal bridge replacement, live datasource restart, supported trading
session, weekday 09:15 execution, QMT native cleanup, lifecycle-on promotion or rollback was run.
Those remain explicit tasks 6.2–6.8 and must not be inferred from local automation.
