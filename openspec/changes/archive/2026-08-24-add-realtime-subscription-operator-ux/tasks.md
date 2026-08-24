## 1. Contract handoff gate

- [x] 1.1 Record `mist-fe` branch/HEAD/dirty/worktree state and preserve unrelated work; confirm this implementation is isolated from backend lifecycle branches.
- [x] 1.2 Verify `integrate-production-realtime-subscription-lifecycle` task 1.4 is complete and obtain the approved OpenAPI, success/error examples, state table and SHA-256 values; pause if any required field is still provisional.
- [x] 1.3 Copy the approved artifacts into `__fixtures__/contracts/realtime-subscriptions/` with SHA-256 sidecars and add offline digest tests that fail on one-sided changes.

## 2. Typed API client

- [x] 2.1 Replace legacy realtime source value `mqmt` with exact backend `qmt` in affected frontend types and fixtures; add negative tests proving `mqmt` is not silently accepted or remapped.
- [x] 2.2 Add runtime-checked types/client methods for bounded `GET/POST /v1/realtime-subscriptions` through `/api/mist`, including cursor/nullability, `sourceCapacities`, provider evidence, convergence and expected business rejection codes.
- [x] 2.3 Add one-code `GET /v1/securities/:code/sources` client preserving `formatCode`, filtering only enabled `tdx|qmt` for presentation without all-Security or N+1 discovery.
- [x] 2.4 Add existing Security activate/deactivate PUT clients using the data-returning envelope parser for HTTP 200/`data=null`; distinguish malformed envelope, expected rejection, validation and dependency/network failure.
- [x] 2.5 Add client contract tests for exact paths, encoded canonical code, query bounds, `active=null`, unknown enum/shape rejection, capacity summary, PUT null data, request ID and fixture examples.

## 3. Operator page

- [x] 3.1 Add an operator-visible navigation entry and `/settings/realtime-subscriptions` route with loading, empty, malformed-contract and dependency-error boundaries.
- [x] 3.2 Implement explicit cursor pagination without unbounded fetch, inferred larger limit or stale page response overwrite.
- [x] 3.3 Implement new ACTIVE STOCK initialization with exact `tdx|qmt` source/provider symbol input and read-only routing identity after success.
- [x] 3.4 Implement existing binding as canonical-code input, one-Security sources lookup, read-only `formatCode` provider-symbol display and ID-only POST.
- [x] 3.5 Render Security status/computed desired separately from `active=true|false|null`, convergence, bounded reason and distinct TDX native-list/QMT durable-registry evidence.
- [x] 3.6 Implement per-row pending/conflicting-action guard, stale-response fencing and bounded inventory refresh after successful POST/PUT.
- [x] 3.7 Use pagination-independent `sourceCapacities.activeAssignmentCount` for interaction guard while preserving backend `REALTIME_ACTIVE_CAPACITY_REACHED` as race authority.
- [x] 3.8 Add Chinese guidance for intraday pending, nighttime activation, deferred removal, drifted/unknown and QMT blocked recovery; expose no desired checkbox, raw control, assignment delete, source switch or recovery mutation.

## 4. Frontend validation and handoff

- [x] 4.1 Add API/component tests for both initialization modes, visible navigation, cursor pages, global capacity independent of current page, immutable fields, concurrent PUT prevention, stale response fencing and every convergence/evidence state.
- [x] 4.2 Run `pnpm lint`, `pnpm typecheck`, repository unit tests and production build; report pre-existing failures separately and do not bypass the actual lint-staged contract.
- [x] 4.3 Test against the matched backend contract/image, record frontend/backend SHAs and fixture digests, and verify no request reaches raw datasource control paths. — 2026-08-24 live 联测通过：
  - Web gateway（nginx）port 80 可访问，返回 307 redirect
  - API 直连 `GET /v1/realtime-subscriptions?limit=3` 返回 3 个 assignment（tdx×2 + qmt×1），全部 `converged`
  - API 通过 web-gateway 代理 `/api/mist/v1/realtime-subscriptions` 响应一致
  - `GET /v1/securities/600519/sources` 返回 tdx+qmt 双源
  - Source capacities：tdx 2/5, qmt 1/5
  - 前端代码无 raw datasource path（grep 确认无 `localhost:9001/9002/9003/9004`、`/qmt/`、`/tdx/`）
  - Envelope 格式正确：`success/statusCode/message/data/timestamp/requestId/path`
- [x] 4.4 Reconcile every requirement/task, run `git diff --check` and strict OpenSpec validation, then hand off the isolated `mist-fe` commit/branch without modifying lifecycle OpenSpec or backend repositories.
