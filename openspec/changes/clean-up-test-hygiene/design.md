## Context

A pre-ratchet audit of both repositories' test code surfaced a mix of issues:
coverage-distorting config, a vacuous test, dead config/fixtures, a copy/paste
bug, and a resource leak. None affect production code, but several either
distort the coverage baseline (type-file denominator, vacuous green) or hide
real behavior (the leak, the broken restore). This change fixes the subset that
matters for baseline accuracy or correctness, and explicitly defers the larger
mechanical refactors.

## Goals / Non-Goals

**Goals**
- Remove the single vacuous test (false green).
- Stop pure type/DTO/module files from diluting the coverage denominator.
- Eliminate cross-test mock leakage via `clearMocks`.
- Remove dead test config and fixtures (zero-risk deletions).
- Fix the two real test-code bugs (`v1_client` restore, `async_loop` leak).

**Non-Goals**
- No production code changes.
- No coverage ratchet/threshold (that is `add-test-coverage-ratchets`).
- No async-style codemod (`run_until_complete`→async, redundant `@pytest.mark.asyncio`
  removal) — deferred to a separate change to keep risk low.
- No builtin-bridge harness consolidation — deferred (bridges are omitted from
  coverage measurement instead).
- No new tests for genuinely under-tested modules (e.g. `qmt/routes/realtime.py`
  WS lifecycle) — that is backfill work, not hygiene.

## Decisions

### 1. Fix the vacuous test with a pinned time, not fake timers
`east-money-collection.strategy.spec.ts` "should use current time when
triggerTime not provided" had no `expect`. Rather than introduce
`jest.useFakeTimers()` (a heavier change touching the shared `mockTimezoneService`),
pin `getCurrentBeijingTime` to a fixed trading-session moment and assert
`collectKForSource` is called with the resolved boundary. Deterministic, minimal.

### 2. Extend coverage exclusions rather than re-baseline after
Pure type declarations (`*.dto.ts`, `*.module.ts`, `*.enum.ts`, `*.types.ts`,
`*.interface.ts`, `*.constants.ts`) and `dto/index.ts` re-exports are not logic;
measuring them punishes the project with a depressed denominator and incentivizes
trivial "tests" for field declarations. Excluding them raises the baseline to
reflect real logic. The existing `*.spec.ts`/`main.ts`/config exclusions
(required by `review-p2-backend-test-hygiene`) are preserved.

### 3. `clearMocks: true` over per-spec `afterEach`
41 specs use `jest.fn()` without resetting; only 9 call `clearAllMocks`
explicitly. A single global `clearMocks: true` resets `mock.calls`/`results`/
implementation between tests with no behavioral change for the majority, closing
the leak vector without auditing every spec.

### 4. Fix `async_loop` leak with `yield`+`close` (方案 A), not full async conversion
The fixture created a new event loop per test and never closed it. Converting
all 20 dependent methods to native `async def` (方案 C) is the stylistically
correct end state but is a large mechanical refactor with bracket-matching risk
(a scripted attempt corrupted the file and was reverted). The 2-line
`yield`+`close` fix eliminates the leak with zero logic change, verified by
running the suite with `-W error::ResourceWarning`. The full async conversion is
deferred.

### 5. Delete dead config/fixtures rather than document them
The `live` marker (0 usages), `tdx_client` fixture (0 references), and
`qmt_bridge_now` ghost attribute (never set) carry no value and only confuse.
The `v1_client` no-op restore was a copy/paste bug masking nothing (the two
"previous" variables were identical); collapsing it makes teardown honest.

## Risks / Trade-offs

- **[Exclusions hide a real gap]** Excluding `*.module.ts` could mask an
  untested module → Mitigation: NestJS module wiring is indirectly exercised by
  module-level specs; pure assembly files are not logic.
- **[clearMocks changes behavior for specs relying on sticky mock state]** →
  Mitigation: full suite passed (1178 tests); the ~9 specs with intentional
  sticky state were not affected because `clearMocks` resets calls/results, not
  the mock object identity.
- **[Deferred async codemod leaves inconsistency]** The gateway file keeps the
  `run_until_complete` style → Mitigation: the leak is fixed; the style
  inconsistency is cosmetic and tracked as a follow-up.

## Migration Plan

No migration: all changes are test-only or config-only, applied directly on the
integration worktree. Rollback is `git checkout` per file. Both full baselines
(guide §11) pass.

## Open Questions

- Whether the MySQL-gated `describe.skip` suites (`k-decimal.mysql.spec.ts`,
  `strategy-alert-event.mysql.spec.ts`) should be converted to static
  migration-file assertions so they run in CI without a MySQL service. Deferred
  — not a regression, pre-existing behavior (the "3 skipped" in CI output).
