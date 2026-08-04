# Implementation baseline — 2026-08-04

## Scope

Read-only repository/worktree inventory captured before implementation. No branch was switched and no existing worktree or unrelated file was modified.

| Repository | Main checkout branch | Main checkout HEAD | `master` / `origin/master` | Dirty state to preserve | Lifecycle implementation location |
|---|---|---|---|---|---|
| `mist` | `feat/productize-current-day-realtime-market-data` | `917b646efbc2745c1b922ba59fa5dd72ed30cb70` | `c387bd48d511f37685b514817b97273ba59f11ee` | clean | `.worktrees/release-evolve-strategy-evaluation-contract`, branch `master`, HEAD `c387bd48d511f37685b514817b97273ba59f11ee`; this change and the separated frontend change are untracked artifacts |
| `mist-datasource` | `feat/productize-current-day-realtime-market-data` | `e2094dd5ec527f18487b746549d875795f174520` | `c59eefd3514d587f06f232e7d61be9e2360d4203` | clean | no lifecycle worktree created yet |
| `mist-deploy` | `feat/productize-current-day-realtime-market-data` | `5269b0cd4d64a9cd9ba3a05769e08e7569491795` | `85c541c59d6e39efcbaa84dc9915ebdde3fb00db` | clean | existing `.worktrees/release-current-day-realtime-candles` owns `master`; no lifecycle worktree created yet |
| `mist-monitoring` | `feat/productize-current-day-realtime-market-data` | `4718416f304c407fe9355d3f6dc06439646afa83` | `e5231741dfc3ec97941c2421a3eb1385f2170a5a` | untracked administrative `.worktrees/` entries for existing candle/strategy worktrees; preserve | existing `.worktrees/release-candle-monitoring` owns `master`; no lifecycle worktree created yet |

All four local `master` refs exactly match `origin/master` at capture time. The Mist governance consolidation commit `2a98a86eedf75dde3b6403353df0cfb1501646ec` (`docs: consolidate project governance`) is reachable from Mist `master`; the current lifecycle worktree HEAD is later than that commit.

## Isolation decision

- Backend/OpenSpec work remains in the existing Mist lifecycle worktree.
- Before editing `mist-datasource`, `mist-deploy` or `mist-monitoring`, create dedicated lifecycle branches/worktrees from the recorded clean `master` refs; do not reuse the current candle/strategy feature checkouts.
- `mist-fe` implementation belongs exclusively to `add-realtime-subscription-operator-ux` and is not part of this change.
