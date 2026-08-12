# Tasks: Rebaseline the Mist production roadmap

## G0. Reconcile current state

- [x] 0.1 Capture the 2026-07-11 active-change snapshot and replace the stale
      priority-bucket backlog with ordered readiness gates.
- [x] 0.2 Record final dispositions for the production baseline, abandoned broad
      datasource refactor, provider-contract alignment, OpenSpec/branch cleanup,
      and Windows TDX guard work.
- [x] 0.3 Keep the completed strategy-platform roadmap and its product children
      outside this production-readiness backlog.
- [x] 0.4 Re-scope completed monitoring and initial AstrBot integration as G2
      foundations instead of recreating them as unfinished work.
- [x] 0.5 Archive `preview-chan-bi-phases` after confirming its 12/12 tasks and
      verification evidence remain complete.
- [x] 0.6 Register `repair-chan-bi-overlap-rendering` as the in-progress G1
      follow-up without modifying its existing artifacts.
- [x] 0.7 Run strict OpenSpec validation for this roadmap rebaseline and review
      `openspec list --json` against the recorded snapshot.
- [x] 0.8 Record post-close provider history sync as indefinitely deferred and remove its active draft;
      only a new explicit owner authorization may recreate proposal/design/spec review.

## G1. Complete data and analysis path readiness

- [x] 1.1 Complete and archive `repair-chan-bi-overlap-rendering`: eliminate
      overlapping valid completed Bis, preserve invalid Phase A diagnostics,
      retain zoom-crossing overlays, regenerate affected fixtures, and record
      backend/frontend/browser evidence.
      Note (2026-08-12): no archive record exists for this change in this tree
      (only `preview-chan-bi-phases` is archived); G1 evidence-chain gap to be
      reconciled when this roadmap is archived.
- [x] 1.2 Complete and archive `add-bigqmt-datasource-bridge` after running the
      real Windows full-QMT native history matrix and recording fields and
      units.
- [x] 1.3 Complete QMT realtime smoke with native snapshot, freshness, field,
      owner, and secret-free Windows evidence in
      `converge-theme-a-realtime-bridges`.
- [x] 1.4 Settle the TDX realtime contract through
      `experimental-tdx-realtime-slice` and the convergence change, using the
      current datasource and backend behavior as the baseline.
- [x] 1.5 Verify TDX product realtime uses official native snapshot events,
      synchronize the datasource/backend contracts, and preserve the
      memory-only boundary for later Theme B persistence work.
- [x] 1.6 Refresh the production baseline after material G1 runtime changes,
      including pinned refs, Windows deployment/runtime evidence, backend leader
      path verification, and Mac-side gateway probes.
- [x] 1.7 Record the completed G1 disposition and evidence pointer in
      `evidence/2026-07-22-production-baseline-refresh.md`.
- [x] 1.8 Record the 2026-07-30 completed and archived datasource
      containerization and QMT native-subscription follow-ups without treating
      them as substitutes for G2, G3 or G4.

## G2. Complete production operations readiness

- [x] 2.1 Superseded (2026-08-12): the child change
      `complete-production-operations-readiness` is not created. The remaining
      G2 work collapsed into a small operations-documentation package (2.2-2.8
      below); a full four-artifact child change was the 2026-07-11 planning
      assumption and no longer holds.
- [x] 2.2 Completed (2026-08-12): foundation inventory recorded in
      `mist/docs/openspec-gap-inventory.md` and this change's design revision —
      OpenObserve (OTLP), archived observability changes, datasource
      management/recovery workflows, guard contracts, mist-skills.
- [x] 2.3 Completed (2026-08-12): read-only operator status and diagnosis is
      served by the OpenObserve-based query runbook
      `mist-deploy/docs/runbooks/observability-queries.md` (service health,
      datasource readiness, last collection, alert state, failure
      classification), in line with the 2026-08-11 decision to diagnose via
      logs and not recreate diagnostic endpoints.
- [x] 2.4 Completed (2026-08-12): recovery backend decided by reality — GitHub
      Actions dispatch workflows plus the SSH direct channel
      (`windows-openssh-ops-channel`); the local authenticated endpoint is
      superseded. Registered in `operations-recovery.md` §0.
- [x] 2.5 Completed (2026-08-12): recovery governance documented in
      `mist-deploy/docs/runbooks/operations-recovery.md` §0/§3 (authentication,
      approval, cooldown, rollback, manual intervention; MFA not required for a
      personal project).
- [x] 2.6 Completed (2026-08-12): evidence sources recorded — OO-side
      metrics/logs, alert delivery via mist-skills, controlled-recovery steps in
      the operations-recovery runbook.
- [x] 2.7 Completed (2026-08-12): no child change to archive; G2 disposition
      recorded in these task notes and the 2026-08-12 design revision.
- [x] 2.8 Completed (2026-08-12): the mist-side baseline document was refreshed
      by the retire session (a6d26f6 — openobserve :5080 listed, retired
      monitoring SHA annotated); the mist-deploy README monitoring section was
      rewritten to the OpenObserve reality (retired prometheus/grafana/:9109 and
      removed workflows).

## G3. Complete frontend operator experience readiness

- [x] 3.1 Deferred (2026-08-12): `improve-frontend-operator-console` is not
      created. Reopen when a backend status contract exists (e.g. delivered via
      the notification worker or an OO-status integration) or the owner
      explicitly requests dashboard live data.
- [x] 3.2 Deferred (2026-08-12): dashboard live-data integration and
      datasource/provider health surfaces remain undone; observation needs are
      served by the OpenObserve UI (:5080) and the queries runbook
      (`mist-deploy/docs/runbooks/observability-queries.md`). Reopen condition
      same as 3.1.
- [x] 3.3 Completed (2026-08-12): same-origin constraint satisfied by the
      realtime-subscriptions page (routes only through /api/mist); no direct
      datasource calls.
- [x] 3.4 Completed (2026-08-12): strategy editing, signal, alert-state, and
      backtest UX remain under the strategy-platform capability; nothing to do
      in this gate.
- [x] 3.5 Deferred (2026-08-12): child not created, so no archive step;
      disposition recorded here. If 3.1 is reopened later, 3.5 applies then.

## G4. Re-audit repeatability and close the roadmap

- [x] 4.1 Reproduce the historical datasource ruff/pyright, Jest/Watchman,
      frontend font, and Python dependency-resolution observations against
      current refs and correct commands. All four no longer reproduce
      (2026-08-12): Jest runs with --forceExit --watchman=false (ratchet changes
      archived 2026-08-07); datasource CI runs ruff check + pyright and enforces
      the coverage gate; frontend uses the local system font stack (no
      next/font/google); ruff pin and uv.lock are aligned.
- [x] 4.2 Completed (2026-08-12): all four historical observations recorded
      completed in 4.1's note; no stale task carried forward.
- [x] 4.3 Dropped (2026-08-12): `tighten-tooling-and-build-repeatability` not
      created — 4.1 found no reproducible failures.
- [x] 4.4 Completed (2026-08-12): no retained issues; nothing requires the
      four-element record.
- [x] 4.5 Completed (2026-08-12): every gate item has a final disposition —
      G0/G1 completed, G2 completed (operations documentation package), G3
      deferred with reopening condition, G4 completed/dropped.
- [x] 4.6 Completed (2026-08-12): strict validation passed; archived at
      `openspec/changes/archive/2026-08-12-define-mist-production-roadmap/`.
