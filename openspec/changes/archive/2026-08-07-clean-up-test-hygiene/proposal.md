## Why

The `mist` and `mist-datasource` repositories carry mature test suites but
contain accumulated test-code debt that distorts coverage measurement and hides
real issues: a vacuous test with no assertions (passing green), pure type/DTO
files dragging down the coverage denominator, dead pytest config and fixtures,
a copy-paste bug in a fixture restore, and an event-loop fixture that leaks on
every use. This change cleans those up so the upcoming coverage ratchet
(`add-test-coverage-ratchets`) anchors to a baseline that reflects real,
healthy test code rather than artifacts of debt.

## What Changes

- mist: fix the vacuous `east-money-collection.strategy.spec.ts` test (no
  assertion → deterministic assertion against a pinned time).
- mist: extend `collectCoverageFrom` exclusions to omit pure type/DTO/module/
  enum/interface/constants files and `dto/index.ts` re-exports, so the
  denominator reflects application logic (preserving the existing
  `*.spec.ts`/`main.ts`/config exclusions unchanged).
- mist: enable `clearMocks: true` in the Jest config to prevent cross-test
  mock-state leakage.
- mist: remove the dead `@app/data-collector` `moduleNameMapper` alias (target
  directory absent, zero imports).
- mist: extract the verbatim-duplicated `createInsertBuilderMock` TypeORM
  InsertBuilder factory from three source-service specs into a shared
  `apps/mist/src/sources/testing/typeorm-mock-helpers.ts`.
- mist-datasource: remove the dead `live` pytest marker (declared, zero
  usages).
- mist-datasource: remove the unused `tdx_client` fixture (zero references) and
  the ghost `qmt_bridge_now` save/restore branches in the `qmt_client` fixture
  (the attribute is never set anywhere).
- mist-datasource: fix the `v1_client` fixture no-op restore (a copy/paste bug
  where `previous_provider` and `previous_state_provider` were identical, plus a
  self-assignment).
- mist-datasource: fix the `async_loop` fixture event-loop leak by adding
  `yield` + `loop.close()` teardown (test-only; no production impact).

## Capabilities

### New Capabilities
- `test-hygiene`: expectations that keep test code honest (no vacuous tests,
  coverage excludes non-logic files, no dead test config/fixtures, no
  resource-leaking fixtures) across the mist and mist-datasource repositories.

### Modified Capabilities
<!-- None. The existing `review-p2-backend-test-hygiene` requirement "Backend
     coverage excludes non-application files" is preserved unchanged; this
     change extends the exclusion list operationally but does not alter that
     requirement's wording. -->

## Impact

- **mist**: `package.json` (jest `collectCoverageFrom`, `clearMocks`,
  `moduleNameMapper`), `apps/mist/src/collector/strategies/east-money-collection.strategy.spec.ts`,
  three source-service specs (`qmt`/`tdx`/`east-money`), new shared helper
  `apps/mist/src/sources/testing/typeorm-mock-helpers.ts`.
- **mist-datasource**: `pyproject.toml` (dead `live` marker removed),
  `tests/conftest.py` (dead `tdx_client` fixture + ghost `qmt_bridge_now`
  removed), `tests/integration/test_tdx_v1.py` (`v1_client` restore fixed),
  `tests/unit/test_tdx_realtime_gateway.py` (`async_loop` leak fixed).
- **No production code changes**; no HIL boundary touched.
- **Deferred to a follow-up change**: the larger async-style codemod
  (converting `run_until_complete`/`asyncio.run` wrappers to native async tests
  and removing redundant `@pytest.mark.asyncio` decorators) and builtin-bridge
  harness consolidation — out of scope here to keep this change low-risk and
  focused on items that affect coverage baseline accuracy or hide real bugs.
