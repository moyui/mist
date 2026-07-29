## Verification Evidence

Verified on 2026-07-15 before commit.

### Backend (`mist`)

- `pnpm run lint:check`: passed.
- `pnpm run typecheck`: passed.
- `pnpm run test:ci`: passed, 58 suites and 373 tests.
- `pnpm run ci:contracts`: passed.
- `pnpm run build:docker`: passed; both Nest applications compiled.
- `openspec validate add-chan-channel-phase-preview --strict`: passed.
- `openspec validate add-bigqmt-datasource-bridge --strict`: passed.
- Backend test sources contain no reference to the sibling `mist-fe` repository.

The local Node.js runtime reported an engine warning because it is Node 22 while
the repositories declare Node 24 or newer. All commands above still exited 0.

### Frontend (`mist-fe`)

- `pnpm run lint`: passed.
- `pnpm run typecheck`: passed.
- `pnpm run test:ci`: passed, 15 suites and 90 tests.
- `pnpm run build`: passed; Next.js generated all static and dynamic routes.
- Focused API, snapshot loader, and chart conversion tests cover both the legacy
  channel array and canonical `{ phaseA, phaseB }` response.

### Generated Fixtures

The four committed Channel fixtures were regenerated from their local merged-K
inputs. Their metadata counts match the generated arrays and every Phase B item
is Valid:

| Fixture | Phase A | Phase B |
| --- | ---: | ---: |
| chinext-2024-2025 | 11 | 1 |
| csi300-2024-2025 | 18 | 2 |
| maotai-2024-2025 | 20 | 1 |
| shanghai-index-2024-2025 | 10 | 2 |

The backend offline exporter was also exercised against CSI 300 merged-K data
without importing frontend code; it produced 18 Phase A candidates and 2 Phase B
channels.
