## Why

The `mist` (Jest) and `mist-datasource` (pytest) repositories both have mature
test suites but **no coverage measurement of any kind**: mist has no
`coverageThreshold` and CI never runs `--coverage`; mist-datasource has no
`pytest-cov` dependency and no `[tool.coverage]` config. Regressions in
untested code therefore go undetected, there is no audit trail of coverage
trends, and the upcoming realtime productization (B1) and cross-repo refactors
have no safety net. The governance guide intentionally sets *no numeric
thresholds* — so the right fit is a **ratchet**: anchor coverage to the current
measured level and block any drop, without inventing arbitrary targets.

This change builds on `clean-up-test-hygiene`, which removed coverage-distorting
debt (vacuous tests, type-file denominator pollution, dead config) so the
ratchet baseline anchors to healthy code. The measured post-cleanup baselines
are: mist **82.72%** lines, datasource **86%** lines (with `builtin_bridge` and
`main.py` omitted).

## What Changes

- mist: add `coverageThreshold` (anchored to the measured baseline via a
  baseline-tool) and `coverageReporters` to the Jest config in `package.json`;
  add a `test:coverage` script; add an independent `Coverage (ratchet gate)`
  step to the `docker.yml` validate job that emits `lcov` and enforces the
  threshold; remove the stale on-disk `coverage/` artifacts.
- mist-datasource: add `pytest-cov` to the dev dependency group; add
  `[tool.coverage.run]` / `[tool.coverage.report]` to `pyproject.toml`
  (omitting non-importable builtin bridges and ASGI entrypoints); add `--cov`
  flags to the pytest `addopts`; upload the coverage artifact in `ci.yml`.
- Both repos: introduce a one-shot **ratchet baseline tool** that reads the
  measured coverage and writes back the threshold, taking the larger of the old
  threshold and the measured value so the floor only ever rises.
- Extend the cross-repo `tools/test-ci-contracts.mjs` to assert the coverage
  configuration exists in both repos, while **preserving unchanged** the
  existing `collectCoverageFrom` exclusion contract.
- CI uploads `lcov` / coverage artifacts on every run for audit, with an
  optional codecov upload (L3 reporting, no gate).

## Capabilities

### New Capabilities
- `test-coverage-gates`: ratchet-style coverage measurement, non-regression
  floors, baseline anchoring, contract enforcement, and audit reporting across
  the mist and mist-datasource repositories.

### Modified Capabilities
<!-- None. The existing `review-p2-backend-test-hygiene` collectCoverageFrom
     exclusion requirement is preserved, not changed. -->

## Impact

- **mist**: `package.json` (jest block + scripts), `.github/workflows/docker.yml`,
  `tools/test-ci-contracts.mjs`, new `tools/coverage-baseline.mjs`, removal of
  stale `coverage/` artifacts.
- **mist-datasource**: `pyproject.toml` (dev deps, coverage config, pytest
  addopts), `.github/workflows/ci.yml`, new `scripts/coverage-baseline.sh`.
- **No business code changes**; no HIL boundary touched (coverage pass never
  equals terminal/production evidence, per governance guide §3.4).
- **Additive only**: no existing stable requirement is weakened or removed.
