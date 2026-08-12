# Tasks: Repair Chan Bi overlap rendering (archive backfill)

> Backfill (2026-08-12): tasks reflect the completed 2026-07-10/11 work with
> evidence pointers; nothing in this backfill is executable work.

- [x] 1.1 Eliminate overlapping valid completed Bis in the Chan rendering
      surface — evidence: `mist` Chan overlap helpers (`de75d2d`, `3d7fb10`,
      `2832b66`) and `hasTimeOverlap` fix (`38085ab`).
- [x] 1.2 Preserve invalid Phase A diagnostics while removing overlapping
      completed Bis — evidence: `mist` `refactor(chan)` phase A/B inline
      commits (`62b7e82`, `54940ba`) and regression baselines (`669710f`,
      `77aea92`).
- [x] 1.3 Retain zoom-crossing overlays — evidence: `mist-fe` `f76ba5a`
      (channels display with correct overlap range).
- [x] 1.4 Regenerate affected fixtures and snapshots — evidence: `mist-fe`
      chan-tests series (`54faa83`, `c631f42`, `b6420b8`, `82b6bdd`).
- [x] 1.5 Record backend/frontend/browser evidence — evidence: `mist`
      `ec67c77` (phase A evidence), `c7bf83a` (consolidation evidence),
      `b301b55`/`77aea92` (frontend phase snapshot verification); `mist-fe`
      `76f8823`, `023ba6c` (chan preview verification).
- [x] 1.6 Archive record restored (2026-08-12 backfill) — the roadmap G0.6/G1.1
      claimed archive; the missing record is recreated here with git-history
      evidence, resolving the G1 evidence-chain gap.
