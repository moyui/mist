## 1. mist test-code cleanup

- [x] 1.1 Fix the vacuous `east-money-collection.strategy.spec.ts` test: pin
  `getCurrentBeijingTime` to a trading-session moment and assert
  `collectKForSource` is called with resolved boundaries.
- [x] 1.2 Extend `collectCoverageFrom` to exclude `*.module.ts`, `*.dto.ts`,
  `*.interface.ts`, `*.types.ts`, `*.enum.ts`, `*.constants.ts`, `dto/index.ts`
  (preserving existing `*.spec.ts`/`main.ts`/config exclusions).
- [x] 1.3 Enable `clearMocks: true` in the Jest config.
- [x] 1.4 Remove the dead `@app/data-collector` `moduleNameMapper` alias.
- [x] 1.5 Extract `createInsertBuilderMock` into
  `apps/mist/src/sources/testing/typeorm-mock-helpers.ts`; update the three
  source-service specs (`qmt`/`tdx`/`east-money`) to import it.

## 2. mist-datasource test-code cleanup

- [x] 2.1 Remove the dead `live` pytest marker from `pyproject.toml`.
- [x] 2.2 Remove the unused `tdx_client` fixture and the ghost `qmt_bridge_now`
  save/restore branches from `tests/conftest.py`.
- [x] 2.3 Fix the `v1_client` fixture no-op restore in
  `tests/integration/test_tdx_v1.py` (collapse duplicate `previous_*` vars and
  the self-assignment).
- [x] 2.4 Fix the `async_loop` fixture leak in
  `tests/unit/test_tdx_realtime_gateway.py` (`yield` + `loop.close()`).

## 3. Verification (governance guide §11)

- [x] 3.1 mist: `pnpm run lint:check`, `pnpm run typecheck`,
  `env TZ=UTC pnpm run test:ci` — all pass (1178 passed, 3 skipped pre-existing
  MySQL-gated).
- [x] 3.2 mist-datasource: `uv run ruff check .`, `uv run pyright`,
  `uv run pytest` — all pass (488 passed).
- [x] 3.3 Confirm no test lost: gateway file 20 tests (matches HEAD baseline).

## 4. OpenSpec validation

- [x] 4.1 Run `openspec validate clean-up-test-hygiene --strict`.

## Deferred (follow-up change, out of scope here)

- Async-style codemod: convert `run_until_complete`/`asyncio.run` wrappers to
  native async tests; remove ~157 redundant `@pytest.mark.asyncio` decorators.
- Builtin-bridge harness consolidation (3 loading mechanisms → 1); bridges are
  omitted from coverage measurement instead.
- MySQL-gated `describe.skip` → static migration-file assertions (so they run
  in CI).
- Backfill tests for genuinely under-tested modules
  (`qmt/routes/realtime.py` WS lifecycle, `tdx/routes/bridge.py` error paths).
