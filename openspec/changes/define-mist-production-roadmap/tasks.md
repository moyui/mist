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

- [ ] 2.1 Create `complete-production-operations-readiness` after G1 has a final
      disposition.
- [ ] 2.2 Inventory and reuse the deployed OpenObserve platform (OTLP
      metrics/traces/logs) and the archived observability changes
      (otel-foundation, otel-observability-gaps, datasource-logs-to-openobserve),
      plus datasource management, explicit TDX recovery, guard, notification,
      and mist-skills/AstrBot query foundations. Prometheus, Grafana, the Go
      exporter, and the Mac watchdog are retired (2026-08) and SHALL NOT be
      inventoried as foundations.
- [ ] 2.3 Define read-only operator status and diagnosis for service health,
      datasource readiness, last collection, alert state, and known failure
      classification.
- [ ] 2.4 Select the first supported controlled-recovery backend: GitHub Actions
      dispatch (existing recovery workflows) or the SSH direct channel
      (`windows-openssh-ops-channel`, archived 2026-08-12), with runbook-only as
      fallback. The local authenticated endpoint option is superseded by the SSH
      channel unless a concrete need reappears.
- [ ] 2.5 Define authentication, approval, cooldown, rollback, captcha/MFA/manual
      intervention, and notification behavior for state-changing recovery.
      Note: realtime allowlist/mode management is already declarative via
      `declarative-realtime-configuration` (archived 2026-08-12); this task
      focuses on recovery-type operations governance.
- [ ] 2.6 Record OpenObserve-side metrics and logs evidence (OTLP), alert
      delivery, mist-skills/AstrBot status, diagnosis, and controlled-recovery
      evidence. The Windows exporter and Mac watchdog are retired.
- [ ] 2.7 Archive the child change and record the G2 disposition.
- [ ] 2.8 Re-freeze the production baseline after the OpenObserve migration
      (evidence refresh; the 2026-07-27 baseline document still lists the
      deleted mist-monitoring SHA) and repair the stale monitoring section in
      mist-deploy README (still describes retired prometheus/grafana/:9109 and
      workflows that no longer exist).

## G3. Complete frontend operator experience readiness

- [ ] 3.1 Create or continue `improve-frontend-operator-console` after G2 status
      and error contracts are stable.
- [ ] 3.2 Add operator surfaces for datasource/provider health, last successful
      collection, freshness, empty-data reasons, and recoverable backend errors.
      Note: the settings/realtime-subscriptions operator page is already
      delivered (`add-realtime-subscription-operator-ux`, 19/20); remaining G3
      scope is dashboard live-data integration plus datasource/provider health
      surfaces, with the observation entry pointed at the OpenObserve UI
      (:5080).
- [ ] 3.3 Keep all frontend requests on same-origin backend/gateway paths and do
      not call TDX or QMT datasource services directly.
      Note: already satisfied by the realtime-subscriptions page (routes only
      through /api/mist); record evidence at archive time.
- [ ] 3.4 Keep strategy editing, signal, alert-state, and backtest UX under the
      separate strategy-platform capability.
- [ ] 3.5 Record focused tests, typecheck, lint, production build, and browser
      evidence, then archive the child and record the G3 disposition.

## G4. Re-audit repeatability and close the roadmap

- [x] 4.1 Reproduce the historical datasource ruff/pyright, Jest/Watchman,
      frontend font, and Python dependency-resolution observations against
      current refs and correct commands. All four no longer reproduce
      (2026-08-12): Jest runs with --forceExit --watchman=false (ratchet changes
      archived 2026-08-07); datasource CI runs ruff check + pyright and enforces
      the coverage gate; frontend uses the local system font stack (no
      next/font/google); ruff pin and uv.lock are aligned.
- [ ] 4.2 Mark fixed or obsolete observations completed/dropped instead of
      carrying them forward as stale tasks.
- [ ] 4.3 Create or continue `tighten-tooling-and-build-repeatability` only for
      failures that still reproduce; split independent repository problems when
      that produces clearer ownership.
      Note: 4.1 found no reproducible failures (2026-08-12), so this child
      change likely needs no creation; proceed to 4.5/4.6 for closure.
- [ ] 4.4 Require every retained issue to name its repository, exact reproduction
      and verification command, expected result, and archive condition.
- [ ] 4.5 Confirm every roadmap item has a final `completed`, `superseded`,
      `deferred`, or `dropped` disposition with evidence or rationale.
- [ ] 4.6 Run strict validation for this roadmap and every remaining child, then
      archive `define-mist-production-roadmap`.
