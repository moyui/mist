# Frontend live contract validation — 2026-08-05

Scope: `mist-fe` only (`feat/realtime-subscription-operator-ux` @ `7c6a80f`). No
backend/datasource/deploy/monitoring application code touched.

## Automated verification (all green)

| Gate | Result |
| --- | --- |
| `pnpm lint` | 0 errors, 0 warnings |
| `pnpm typecheck` (`tsc --noEmit`) | pass |
| `pnpm test:ci` | 20 suites / 181 tests pass (40 new: 17 client contract, 23 component, 5 digest) |
| `pnpm build` (`next build`) | pass; route `/settings/realtime-subscriptions` emitted |
| `git diff --check` | exit 0 (no whitespace/conflict markers) |
| `openspec validate --all --strict` | 68 passed, 0 failed (mist worktree) |

## Live integration (dev server `pnpm dev` ↔ live backend `192.168.31.182:8001`)

Backend reachability was probed directly through the `/api/mist` Next rewrite on
the dev server (`localhost:3000`), mirroring the exact path the frontend client uses.

### Available (real contract consumed)

`GET /api/mist/v1/securities/600519/sources` → HTTP 200, shared success envelope:

```json
{ "success": true, "statusCode": 200, "data": [
  { "id": 1,  "securityId": 1, "source": "tdx", "formatCode": "600519.SH", "priority": 100, "enabled": true },
  { "id": 12, "securityId": 1, "source": "qmt", "formatCode": "600519.SH", "priority": 80,  "enabled": true }
]}
```

This is the existing single-Security sources lookup consumed by the `existing`
initialization mode. Field shape matches the frozen `SecuritySourceVo`; both rows
are enabled `tdx|qmt` and pass the page's eligible-source filter. The
`formatCode` value is displayed read-only as the provider symbol.

### Page render

Dev server compiled `/settings/realtime-subscriptions` with no error
(`GET /settings/realtime-subscriptions 200 in 2.0s`). Server-rendered HTML
contained every key marker (实时订阅路由 / 容量（与当前页无关） / 初始化 /
新建 ACTIVE STOCK / tdx / qmt / 首页 / 下一页) and **no `mqmt`**.

### Not yet available (deferred — backend not deployed)

`GET /api/mist/v1/realtime-subscriptions` → HTTP 404 `NOT_FOUND`. The backend
controller/service/VO exists in the `release-evolve-strategy-evaluation-contract`
worktree but has **not been deployed** to the running instance
`192.168.31.182:8001`. Consequently the list, `new`-mode POST, and
activate/deactivate PUT cannot be exercised end-to-end against a live response;
the page enters its dependency-error boundary on the initial bounded list load,
which is the spec-mandated fail-closed behavior (Requirement 3, malformed-contract
and dependency-error boundaries).

## What is proven vs deferred

- Proven: frozen-contract consumption (types/paths/query/capacity/nullability),
  `mqmt`→`qmt` replacement with no alias, page render, visible navigation,
  the existing `sources` lookup real integration, and all 40 frontend tests.
- Deferred (task 4.3): matched backend contract/image integration test +
  terminal HIL for `/v1/realtime-subscriptions` GET/POST and the
  activate/deactivate PUT — blocked on backend deployment, not on frontend work.

## Commit references

- `mist-fe` `feat/realtime-subscription-operator-ux` `7c6a80f`
- `mist` `master` `f0b3fcc` (tasks.md tick)
