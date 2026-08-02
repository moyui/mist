## Context

Mist is a multi-repository production system:

- `mist` owns the NestJS backend, Chan APIs and algorithms, MySQL migrations,
  backend image, and the central OpenSpec tree.
- `mist-datasource` owns the host-side TDX and QMT datasource services and their
  provider/runtime contracts.
- `mist-deploy` owns Windows Docker deployment, host service management, TDX
  recovery, monitoring deployment, and Mac watchdog deployment.
- `mist-fe` owns the production frontend and operator-facing views.
- `mist-monitoring` owns exporters, probes, metrics, alerts, and controlled
  action contracts.
- `mist-skills` owns AstrBot-facing Mist API skills.

The first roadmap correctly required a production baseline and independent child
changes, but its status was not rebased after later work completed. The
2026-07-11 rebaseline snapshot and current dispositions are:

| Change | Current state | Roadmap treatment |
| --- | --- | --- |
| `preview-chan-bi-phases` | completed and archived | G0 prerequisite completed; canonical phase-preview spec is synced |
| `repair-chan-bi-overlap-rendering` | completed and archived | G1 analysis-correctness prerequisite completed with backend, frontend, and browser evidence |
| `add-bigqmt-datasource-bridge` | completed and archived | G1 native-history evidence preserved; realtime ownership and HIL completed by `converge-theme-a-realtime-bridges` |
| `experimental-tdx-realtime-slice` | completed and archived | TDX native snapshot transport accepted with Windows HIL evidence |
| `converge-theme-a-realtime-bridges` | completed and archived | TDX and QMT realtime transport HIL accepted; Theme A gate released |
| `define-mist-production-roadmap` | gate-driven rebaseline in progress | Parent roadmap for the remaining G1-G4 work |

## Goals / Non-Goals

**Goals:**

- Expose a single accurate, ordered production-readiness backlog.
- Preserve completed and superseded history without presenting it as active
  engineering work.
- Make data correctness and live datasource evidence the first executable gate.
- Reuse completed monitoring, guard, deployment, and AstrBot foundations when
  defining the remaining operations work.
- Require concrete local and live evidence before a gate is closed.
- Keep every implementation or live-validation body of work in a focused child
  change.

**Non-Goals:**

- Implement any roadmap item in this parent change.
- Duplicate the strategy-platform roadmap or reopen its completed children.
- Treat every feature change in the repository as a production-roadmap blocker.
- Recreate abandoned broad refactors whose remaining work now has a narrower
  owner.
- Mark Windows-, QMT-, TDX-, Docker-, monitoring-, or AstrBot-dependent work
  complete from local tests alone.

## Decisions

### Decision 1: Use ordered readiness gates

The roadmap uses dependency gates rather than priority labels:

```text
G0 Current-state reconciliation
  -> G1 Data and analysis path readiness
    -> G2 Production operations readiness
      -> G3 Frontend operator experience readiness
        -> G4 Engineering repeatability and roadmap closure
```

A later gate may be designed while an earlier gate is active, but it cannot be
declared production-ready until the earlier gate is closed or explicitly
accepted as deferred with its production impact documented.

### Decision 2: Keep a disposition ledger separate from executable tasks

Roadmap items use these states:

- `pending`: accepted future work with no active child change;
- `in-progress`: owned by an active child change;
- `blocked`: temporarily unable to proceed because named evidence or access is
  missing;
- `completed`: exit criteria and required evidence are satisfied;
- `superseded`: a newer, named change or accepted runtime contract owns the
  remaining concern;
- `deferred`: intentionally postponed with a reason and reopening condition;
- `dropped`: intentionally removed with a rationale.

Only `completed`, `superseded`, `deferred`, and `dropped` are final
dispositions. `pending`, `in-progress`, and `blocked` remain executable backlog.

The current historical ledger is:

| Original roadmap area | Disposition | Evidence or replacement |
| --- | --- | --- |
| Production baseline | completed | `verify-mist-production-baseline` archived; refresh remains required after material G1/G2 runtime changes |
| Broad TDX Python datasource refactor | superseded | `refactor-tdx-python-datasource` archived intentionally incomplete; the accepted builtin bridge and provider contracts own the remaining concerns |
| TDX/QMT provider contract alignment | completed | `align-tdx-qmt-datasource-contracts` archived with Windows baseline evidence |
| Separate OpenSpec/branch reconciliation child | superseded | Individual archive notes and branch decisions now record the relevant dispositions |
| Separate Windows TDX guard validation child | superseded | `add-tdx-desktop-guard` archived after the normal-management versus explicit-recovery runner split |
| Monitoring health repair | completed | `repair-monitoring-health-alerts` archived; broader operations readiness remains G2 work |
| Initial NapCat/AstrBot skill integration | completed | `integrate-napcat-astrbot-skills` archived; status, diagnosis, and recovery operations remain G2 work |
| Strategy platform roadmap and children | completed, separate scope | Governed by `strategy-platform-roadmap`; not duplicated here |
| Post-close provider history sync | deferred | No active implementation change remains; only a new explicit owner authorization may recreate and reopen review |
| Chan phase-preview review surface | completed | `preview-chan-bi-phases` archived with canonical phase-preview requirements synced |
| Chan Bi overlap and zoom repair | completed | `repair-chan-bi-overlap-rendering` archived with backend, frontend, and browser evidence |
| Frontend operator console | pending | Remains G3 after G2 contracts stabilize |
| Tooling/build repeatability | pending re-audit | Remains G4 only for failures that still reproduce |

### Decision 3: G0 produces the authoritative current-state snapshot

G0 closes planning ambiguity before more child changes are created. It must:

- archive active changes whose tasks and verification are already complete;
- record every old roadmap item with a final or executable disposition;
- register newly discovered active work without overwriting its artifacts;
- keep product feature roadmaps separate from production-readiness gates; and
- ensure `openspec list --json` reflects only real active work.

`preview-chan-bi-phases` is archived at
`openspec/changes/archive/2026-07-10-preview-chan-bi-phases/`.
Its follow-up `repair-chan-bi-overlap-rendering` is archived at
`openspec/changes/archive/2026-07-10-repair-chan-bi-overlap-rendering/` with its
verification evidence preserved in the archive.

### Decision 4: G1 covers end-to-end data and analysis correctness

G1 combines datasource availability with the correctness of analysis rendered
from that data. Its Chan correctness prerequisite is complete through
`repair-chan-bi-overlap-rendering`, and the real full-QMT native history matrix
is complete with evidence in `add-bigqmt-datasource-bridge`.

The TDX and QMT realtime transport concerns were settled by
`experimental-tdx-realtime-slice` and `converge-theme-a-realtime-bridges`.
Windows HIL accepted both native snapshot paths, captured runtime identities,
and preserved protected database digests. Realtime remains memory-only; database
snapshot persistence, candle aggregation, and notification context belong to
the separately gated Theme B strategy work.

The archived evidence is preserved under
`openspec/changes/archive/2026-07-22-experimental-tdx-realtime-slice/`,
`openspec/changes/archive/2026-07-22-converge-theme-a-realtime-bridges/`, and
`openspec/changes/archive/2026-07-22-add-bigqmt-datasource-bridge/`.

G1 is complete. The refreshed production baseline is recorded at
`evidence/2026-07-22-production-baseline-refresh.md` with pinned repository and
bridge identities, Windows deployment and restore runs, TDX/QMT runtime smoke,
database protection digests, backend leader state, and Mac gateway probes.
Realtime transport remains memory-only; persistence and notification work stays
under separately gated feature work and is not an unresolved G1 item.
Post-close provider history sync has no active implementation change and is not an executable G1, G2, G3, or
G4 blocker.

### Decision 5: G2 consolidates the remaining operations control plane

With G1 accepted, G2 creates one focused child change, provisionally named
`complete-production-operations-readiness`. It reuses, rather than reimplements:

- deployed monitoring and watchdog foundations;
- completed health and alert-delivery repairs;
- normal datasource management workflows;
- explicit TDX recovery workflows and guard contracts; and
- the initial query-style AstrBot/Mist integration.

The child change owns the remaining status, diagnosis, alert classification,
notification, and controlled-recovery experience. It must choose the first
supported recovery backend—runbook-only, GitHub Actions dispatch, or a local
authenticated endpoint—and must keep read-only diagnosis separate from
state-changing recovery.

### Decision 6: G3 consumes stable operations contracts

G3 retains the child name `improve-frontend-operator-console`. It starts only
after G2 defines stable status and error contracts. Its scope is limited to:

- datasource health and provider readiness;
- last successful collection and freshness information;
- empty-data and recoverable-error explanations;
- same-origin backend/gateway calls rather than direct datasource access; and
- focused tests, production build evidence, and browser verification.

Strategy editing and signal/backtest UX remain owned by the separate strategy
platform capability.

### Decision 7: G4 re-audits repeatability before creating work

The old roadmap named ruff, pyright, Watchman/Jest, network-fetched fonts, and
Python dependency resolution. Those observations may have changed. G4 must
reproduce each issue against current repository refs before creating or
continuing `tighten-tooling-and-build-repeatability`.

Fixed observations are recorded as completed or dropped. Reproducible issues
become explicit tasks with exact commands and repository ownership. Independent
issues may be split into smaller child changes instead of being forced into one
tooling omnibus.

### Decision 8: Child changes own implementation and evidence

Every child change must state:

- owning repositories and runtime components;
- entry dependency and gate;
- exact local validation commands;
- required Windows, Mac, QMT, TDX, Docker, monitoring, or AstrBot evidence;
- behavior when an external dependency is unavailable;
- expected clean-worktree or commit/ref evidence; and
- the condition that permits archive.

If required live access is unavailable, the child remains `blocked` or is
explicitly `deferred`; local tests alone do not silently satisfy a live gate.

## Risks / Trade-offs

- A parent roadmap can become stale again -> update the disposition ledger when
  a child is created, split, archived, deferred, or replaced.
- G1 combines datasource and analysis correctness -> keep implementation in the
  named independent children; the gate only expresses the production dependency.
- Operations scope can become an omnibus -> G2 defines one contract change first
  and permits implementation splits when status, notification, and recovery have
  independent owners.
- External Windows/QMT evidence can block closure -> record the exact missing
  evidence and keep affected runtime paths disabled or explicitly constrained.
- Tooling observations can become cargo-cult backlog -> require reproduction on
  current refs before creating tasks.

## Verification

This roadmap-only rebaseline requires:

- `openspec validate define-mist-production-roadmap --strict`;
- `openspec list --json` to confirm the active change snapshot; and
- review of the disposition ledger against active and archived change
  directories.

Application tests are not required for the roadmap document itself. Each child
change owns the commands and live evidence needed for its runtime scope.

## Archive Plan

1. Close G0 and establish the authoritative active backlog.
2. Complete or record a final disposition for every G1 item, then refresh the
   production baseline when runtime changes require it.
3. Complete and archive the G2 operations-readiness child.
4. Complete, defer, or drop the G3 operator-console child with rationale.
5. Re-audit and dispose every G4 repeatability observation.
6. Run strict OpenSpec validation and archive this roadmap only when every item
   has a final disposition.
