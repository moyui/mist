# Change: Rebaseline the Mist production roadmap

## Why

The original production roadmap was written on 2026-07-01, before the current
production baseline, TDX provider boundary, Windows recovery split, monitoring
repairs, API standardization, and strategy-platform work were completed. Its
unchecked task count now mixes real future work with changes that have already
been completed, archived, or intentionally superseded.

The current work is narrower and more concrete:

- `preview-chan-bi-phases` and `repair-chan-bi-overlap-rendering` are completed
  and archived correctness prerequisites.
- `add-bigqmt-datasource-bridge` supplied the full-QMT native history evidence;
  the later convergence change completed the QMT realtime evidence.
- TDX realtime behavior is now explicitly owned by the archived builtin bridge
  and convergence contracts instead of the abandoned broad datasource
  refactor.

The roadmap therefore needs a current-state reset that preserves historical
decisions while exposing only the work that can still affect production
readiness.

## What Changes

- Replace the old P0/P1/P2/P3 bucket list with ordered production readiness
  gates:
  - G0 current-state reconciliation;
  - G1 data and analysis path readiness;
  - G2 production operations readiness;
  - G3 frontend operator experience readiness;
  - G4 engineering repeatability and roadmap closure.
- Add a disposition ledger that separates `completed`, `superseded`, `deferred`,
  and `dropped` work from the executable backlog.
- Record post-close provider history sync as indefinitely deferred with no active
  implementation change; a future explicit owner must recreate and review it.
- Record the completed Chan, QMT, and TDX realtime children as G1 evidence and
  leave only baseline refresh and final disposition as executable G1 work.
- Re-scope monitoring, guard, and AstrBot work around the remaining production
  operations control plane instead of recreating already completed foundations.
- Keep the strategy-platform roadmap and other product feature roadmaps outside
  this production-readiness change; reference their disposition without
  duplicating their tasks.
- Require every gate and child change to name owners, exact verification,
  external dependencies, and an exit disposition.

## Capabilities

### New Capabilities

- `mist-production-roadmap`: Gate-driven cross-repository production readiness,
  current-state disposition, child-change sequencing, evidence requirements,
  and archive criteria.

### Modified Capabilities

None. Runtime and product capabilities remain governed by their focused specs.

## Impact

- Updates planning artifacts only under
  `openspec/changes/define-mist-production-roadmap/`.
- Coordinates future work across `mist`, `mist-datasource`, `mist-deploy`,
  `mist-fe`, `mist-monitoring`, and `mist-skills`.
- Does not modify runtime code, database schemas, deployment configuration, or
  production state.
- Child changes remain independently implementable, verifiable, and archivable.
