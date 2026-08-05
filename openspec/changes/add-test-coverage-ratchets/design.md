## Context

Both primary repositories carry mature suites but zero coverage measurement:

- **mist** (Jest 29, 150 spec files): no `coverageThreshold`, CI runs
  `jest --runInBand` without `--coverage`. The on-disk `coverage/` directory is
  regenerated each run (gitignored). The existing `tools/test-ci-contracts.mjs`
  meta-gate asserts only the `collectCoverageFrom` *exclusions* (per stable spec
  `review-p2-backend-test-hygiene`); `clean-up-test-hygiene` already extended
  those exclusions to omit type/DTO/module files.
- **mist-datasource** (pytest, 45 files / ~405 tests): no `pytest-cov`, no
  `[tool.coverage]`, no `--cov-fail-under`. CI runs `pytest` (the dead `live`
  marker was removed by `clean-up-test-hygiene`).

Measured post-cleanup baselines (the ratchet anchors): mist **82.72%** lines /
67.9% branches; datasource **85.75%** lines (with `builtin_bridge` and `main.py`
omitted, per the coverage config this change adds). The datasource gate
threshold is 85 (integer, below the measured 85.75%) because coverage.py rounds
the measured percentage to an integer before comparing — setting it to 86 would
let 85.75% (rounds to 86) pass ambiguously.

The governance guide (`mist/docs/project-quality-governance-guide.md` §10–11)
**intentionally defines no numeric coverage thresholds**; its philosophy is
gated baselines + contract tests + HIL separation, and it forbids describing
CI green as terminal/production evidence (§3.4). A blind "80% or fail" gate
would contradict that spirit and incentivize line-padding. The right fit is a
**ratchet**: anchor the threshold to current measured coverage and block only
*regressions*, never forcing arbitrary targets.

Stakeholders: backend & datasource maintainers, reviewers, and the upcoming B1
realtime productization (which needs a regression net for candle/ingress/strategy
handoff code).

## Goals / Non-Goals

**Goals**
- Make coverage **visible** on every CI run (lcov + text summary).
- Enforce a **single hard gate**: overall line coverage ≥ a ratchet baseline
  (0% tolerance), so any drop fails CI.
- Anchor the baseline to the **measured** level, monotonically rising, so
  large additions of untested code (which dilute the denominator) are still
  caught.
- Preserve all existing contract gates unchanged (especially the
  `collectCoverageFrom` exclusions).
- Provide audit evidence: archived lcov/coverage artifacts; optional codecov
  reporting (no gate).

**Non-Goals**
- No arbitrary numeric targets ("must reach X%").
- No per-area/per-package thresholds for non-critical glue (logging, config,
  pure entity fields).
- Coverage pass **never equals** HIL/terminal/trading-session evidence —
  governance guide §3.4 boundary is untouched.
- No Testcontainers / real MySQL+Redis harness — the current mock strategy is
  healthy; an architectural change of that size is out of scope.
- No coverage of non-importable `builtin_bridge` scripts (covered by exec
  harness tests, excluded from source coverage).

## Decisions

### 1. Ratchet over fixed targets
Anchor `coverageThreshold` (mist) and `--cov-fail-under` (datasource) to the
current measured coverage, written back by a baseline tool. The threshold is
the **larger** of the old value and the newly measured value, so it can only
rise. New untested files dilute the overall percentage and will trip the gate
when the overall number drops.

*Alternative considered:* a fixed minimum (e.g. 70%). Rejected — contradicts
the guide's no-numeric-target philosophy and rewards line-padding.

### 2. mist: do NOT add `--coverage` to `test:ci`
`test:ci` is the governance guide §11 baseline command and a deployment gate.
A coverage failure there would block commits that should pass. Instead, add a
**separate `Coverage (ratchet gate)` step** in the `docker.yml` validate job,
running after the existing Test step. This decouples the fast baseline run
from the slightly slower coverage run and gives clear failure attribution.

### 3. Contract compatibility is verified
`tools/test-ci-contracts.mjs` `assertBackendJestHygiene` checks only
`collectCoverageFrom` exclusions, **not** `coverageThreshold`; the stable spec
`review-p2-backend-test-hygiene` Scenario "Coverage contract is checked"
asserts only that `collectCoverageFrom` excludes `*.spec.ts`/`main.ts`/config.
Adding `coverageThreshold` and `coverageReporters` therefore does **not** break
any existing contract. The change additionally extends the meta-gate to assert
the coverage config *exists* in both repos, while keeping the existing
exclusion assertions byte-for-byte (the extended type-file exclusions added by
`clean-up-test-hygiene` are likewise preserved).

### 4. datasource builtin bridges are omitted, not faked
The `mist_tdx_realtime_bridge.py` / `mist_qmt_realtime_bridge.py` scripts are
not importable packages; tests `exec()` them into a fresh namespace with fake
SDK contexts (see `tests/unit/test_qmt_builtin_subscription_bridge.py`). Such
code cannot be measured by standard source coverage. Decision: omit
`builtin_bridge/*` and `main.py` from `[tool.coverage.run]`, with a comment
documenting that exec-harness tests cover them. A future refactor making
bridges importable is explicitly out of scope.

### 5. Baseline tools run locally, never in CI
`tools/coverage-baseline.mjs` (mist) and `scripts/coverage-baseline.sh`
(datasource) read the measured coverage and write the threshold back. They are
run **manually/locally** (or in a one-off baseline job), never as part of CI,
because CI must not mutate the repository. CI only *reads* the committed
threshold to enforce the gate.

### 6. Three-layer measurement model
L1 measure (no gate) → L2 ratchet gate (hard fail) → L3 report/audit (no gate).
Only L2 is a gate; L1/L3 are visibility and audit. This matches the guide's
"baseline signal above the required gate" framing.

## Risks / Trade-offs

- **[Performance] `--coverage` adds ~15–25% to ts-jest runtime** → Mitigation:
  the coverage step is separate from `test:ci`; if it becomes a bottleneck,
  switch to istanbul instrumentation or split the suite.
- **[Flapping gate] A borderline baseline can cause intermittent failures** →
  Mitigation: baseline at 0% tolerance but record the measured value;
  contributors rerun the baseline tool to raise the floor when genuine
  improvements land.
- **[Misleading metric] Coverage ≠ correctness** → Mitigation: Non-Goals and
  spec scenarios explicitly state coverage pass is not HIL evidence; this is a
  regression floor, not a quality proof.
- **[builtin_bridge undercount]** Omitting bridges understates true coverage
  → Mitigation: documented; bridges covered by dedicated exec-harness tests.

## Migration Plan

1. On the integration worktree (both repos), run the full current baseline to
   confirm green before any change.
2. mist: add config/scripts/meta-gate extension; remove stale `coverage/`.
3. mist-datasource: add `pytest-cov`, coverage config, `addopts`, CI artifact.
4. Run each baseline tool once to write the real measured threshold.
5. Re-run the full baseline (guide §11) for both repos; confirm the ratchet
   gate passes.
6. Validate the change: `openspec validate add-test-coverage-ratchets --strict`.
7. Rollback: revert the config commits; no data or schema changes are involved,
   so rollback is trivial and reversible per step.

## Open Questions

- codecov integration (L3): defer until a token secret is configured; the
  artifact upload works without it. Not blocking.
- Whether to lift the ratchet per-area for the realtime/strategy paths (P1
  backfill) is a follow-up, decided after the baseline is measured.
