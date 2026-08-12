# Change: Repair Chan Bi overlap rendering (archive backfill)

## Why

This change is an **archive backfill** (2026-08-12). The production roadmap
(`define-mist-production-roadmap`, G0.6/G1.1) and its design recorded
`repair-chan-bi-overlap-rendering` as "completed and archived", but no archive
record existed in this OpenSpec tree — the change was never archived as a
change. The work itself was completed in 2026-07-10/11 across `mist` and
`mist-fe`, and this backfill restores the missing evidence chain without
inventing history.

## What Changes

The completed work eliminated overlapping valid completed Bis in the Chan
rendering surface, preserved invalid Phase A diagnostics, retained
zoom-crossing overlays, regenerated affected fixtures, and recorded
backend/frontend/browser evidence.

## Evidence (backfilled from git history, 2026-07-10/11)

- Backend overlap handling: `mist` `38085ab` (fix `hasTimeOverlap` date-type
  error) and the Chan channel/overlap helper commits in the same window
  (`de75d2d`, `3d7fb10`, `2832b66`).
- Frontend channel rendering with correct overlap range: `mist-fe` `f76ba5a`
  (display channels with correct overlap range and clean up logs).
- Frontend phase snapshots and regenerated fixtures: `mist-fe` chan-tests
  series `6cbeb22`, `40cf085`, `54faa83`, `c631f42`, `b6420b8`, `82b6bdd` and
  the Chan phase-preview tests in `mist` (`77aea92`, `b301b55`).
- Live spec authority: `chan-bi-phase-preview` and `chan-analysis-core` specs
  remain the canonical contracts; this backfill adds no new requirement.

## Impact

- Adds the missing archive record only. No runtime code, database schema, or
  live spec changes.
- Resolves the G1 evidence-chain gap noted in the archived roadmap
  (2026-08-12-define-mist-production-roadmap).
