## 1. Baseline confirmation (post clean-up-test-hygiene)

- [x] 1.1 Confirm `clean-up-test-hygiene` has landed on the integration worktree
  (collectCoverageFrom type exclusions, clearMocks, dead-config removal,
  async_loop leak fix).
- [x] 1.2 Measure post-cleanup baselines: mist **82.72%** lines / 67.9% branches
  (148 suites, 1178 passed); datasource **86%** lines with builtin_bridge/main
  omitted (488 passed).
- [x] 1.3 Confirm no existing stable requirement or `test-ci-contracts.mjs`
  assertion is weakened (audit `review-p2-backend-test-hygiene`,
  `release-ci-safety`).

## 2. mist (Jest) coverage tooling

- [ ] 2.1 Add `coverageThreshold.global` (lines 82.72 / statements 81.64 /
  functions 78.47 / branches 67.9 — the measured post-cleanup values) and
  `coverageReporters: ["text-summary", "lcov", "clover"]` to the Jest config in
  `package.json`.
- [ ] 2.2 Add a `test:coverage` script = `jest --coverage --runInBand
  --watchman=false`; leave `test:ci` unchanged.
- [ ] 2.3 Remove the stale on-disk `coverage/` artifacts (gitignored).
- [ ] 2.4 Add an independent `Coverage (ratchet gate)` step to the
  `docker.yml` validate job, after the Test step, emitting `coverage/lcov.info`
  and enforcing `coverageThreshold`.
- [ ] 2.5 Add an `upload-artifact` step for `coverage/lcov.info` (always,
  including on failure).
- [ ] 2.6 Add `tools/coverage-baseline.mjs`: read
  `coverage/coverage-summary.json`, write back the larger of the old
  `coverageThreshold.global.lines` and the measured value.

## 3. mist-datasource (pytest) coverage tooling

- [ ] 3.1 Add `pytest-cov>=5.0.0` to the `dev` dependency group in
  `pyproject.toml`; run `uv lock`.
- [ ] 3.2 Add `[tool.coverage.run]` (`source = ["src","tdx","qmt"]`,
  `branch = true`, `omit` for `builtin_bridge/*` and `main.py`) and
  `[tool.coverage.report]` (`fail_under = 86` baseline, `show_missing`,
  `exclude_lines`) to `pyproject.toml`.
- [ ] 3.3 Add `addopts = "--cov=src --cov=tdx --cov=qmt --cov-branch
  --cov-report=term-missing:skip-covered --cov-fail-under=86"` to
  `[tool.pytest.ini_options]`, preserving `asyncio_mode` and `testpaths`.
- [ ] 3.4 Add an `upload-artifact` step for the coverage data to `ci.yml`
  (always, including on failure).
- [ ] 3.5 Add `scripts/coverage-baseline.sh`: read the measured coverage and
  write back the larger of the old `fail_under` and the measured value.

## 4. Contract runner extension

- [ ] 4.1 Extend `tools/test-ci-contracts.mjs` to assert `mist` declares a
  `coverageThreshold` and `mist-datasource` `addopts` includes
  `--cov-fail-under`.
- [ ] 4.2 Confirm the existing `collectCoverageFrom` exclusion assertions
  (including the type-file exclusions from `clean-up-test-hygiene`) remain
  unchanged and still pass.

## 5. Verification (governance guide §11)

- [ ] 5.1 mist: `pnpm run lint:check`, `pnpm run typecheck`,
  `env TZ=UTC pnpm run test:ci`, `pnpm run test:coverage` (ratchet gate
  passes), `pnpm run ci:contracts`.
- [ ] 5.2 mist-datasource: `uv run ruff check .`, `uv run pyright`,
  `uv run pytest` (addopts carries the ratchet gate).
- [ ] 5.3 Report results separated into pass / skipped / environment-blocked /
  pending-HIL (no HIL is touched by this change).

## 6. OpenSpec validation

- [ ] 6.1 Run `openspec validate add-test-coverage-ratchets --strict`.
