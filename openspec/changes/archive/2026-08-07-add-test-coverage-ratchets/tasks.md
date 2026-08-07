## 1. Baseline confirmation (post clean-up-test-hygiene)

- [x] 1.1 Confirm `clean-up-test-hygiene` has landed on the integration worktree
  (collectCoverageFrom type exclusions, clearMocks, dead-config removal,
  async_loop leak fix).
- [x] 1.2 Measure post-cleanup baselines: mist **82.72%** lines / 67.9% branches
  (148 suites, 1178 passed); datasource **85.75%** lines with builtin_bridge/main
  omitted (488 passed). Datasource gate threshold set to 85 (integer, below
  measured 85.75%, avoids coverage.py round ambiguity).
- [x] 1.3 Confirm no existing stable requirement or `test-ci-contracts.mjs`
  assertion is weakened (audit `review-p2-backend-test-hygiene`,
  `release-ci-safety`).

## 2. mist (Jest) coverage tooling

- [x] 2.1 Add `coverageThreshold.global` (lines 82.72 / statements 81.64 /
  functions 78.47 / branches 67.9 — the measured post-cleanup values) and
  `coverageReporters: ["text-summary", "lcov", "clover"]` to the Jest config in
  `package.json`.
- [x] 2.2 Add a `test:coverage` script = `jest --coverage --runInBand
  --watchman=false`; leave `test:ci` unchanged.
- [x] 2.3 Remove the stale on-disk `coverage/` artifacts (gitignored).
- [x] 2.4 Add an independent `Coverage (ratchet gate)` step to the
  `docker.yml` validate job, after the Test step, emitting `coverage/lcov.info`
  and enforcing `coverageThreshold`.
- [x] 2.5 Add an `upload-artifact` step for `coverage/lcov.info` (always,
  including on failure).
- [x] 2.6 Add `tools/coverage-baseline.mjs`: read
  `coverage/coverage-summary.json`, write back the larger of the old
  `coverageThreshold.global.lines` and the measured value.

## 3. mist-datasource (pytest) coverage tooling

- [x] 3.1 Add `pytest-cov>=5.0.0` to the `dev` dependency group in
  `pyproject.toml`; run `uv lock`.
- [x] 3.2 Add `[tool.coverage.run]` (`source = ["src","tdx","qmt"]`,
  `branch = true`, `omit` for `builtin_bridge/*` and `main.py`) and
  `[tool.coverage.report]` (`fail_under = 85` baseline, `show_missing`,
  `exclude_lines`) to `pyproject.toml`.
- [x] 3.3 Add `addopts = "--cov=src --cov=tdx --cov=qmt --cov-branch
  --cov-report=term-missing:skip-covered --cov-fail-under=85"` to
  `[tool.pytest.ini_options]`, preserving `asyncio_mode` and `testpaths`.
- [x] 3.4 Add an `upload-artifact` step for the coverage data to `ci.yml`
  (always, including on failure).
- [x] 3.5 Add `scripts/coverage-baseline.sh`: read the measured coverage and
  write back the larger of the old `fail_under` and the measured value.

## 4. Contract runner extension

- [x] 4.1 Extend `tools/test-ci-contracts.mjs` to assert `mist` declares a
  `coverageThreshold` and `mist-datasource` `addopts` includes
  `--cov-fail-under`.
- [x] 4.2 Confirm the existing `collectCoverageFrom` exclusion assertions
  (including the type-file exclusions from `clean-up-test-hygiene`) remain
  unchanged and still pass.

## 5. Verification (governance guide §11)

- [x] 5.1 mist: `pnpm run lint:check`, `pnpm run typecheck`,
  `env TZ=UTC pnpm run test:ci`, `pnpm run test:coverage` (ratchet gate
  passes), `pnpm run ci:contracts`.
- [x] 5.2 mist-datasource: `uv run ruff check .`, `uv run pyright`,
  `uv run pytest` (addopts carries the ratchet gate).
- [x] 5.3 Report results separated into pass / skipped / environment-blocked /
  pending-HIL (no HIL is touched by this change).

## 6. OpenSpec validation

- [x] 6.1 Run `openspec validate add-test-coverage-ratchets --strict`.
