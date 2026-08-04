## 1. Baseline and contract gates

- [x] 1.1 Record branch/HEAD/dirty/worktree state for `mist`, `mist-datasource`, `mist-deploy` and `mist-monitoring`; confirm the governance commit remains in master and preserve unrelated user work.
- [x] 1.2 Read-only audit production `schema_migrations`, `securities`, `security_source_configs` DDL/index/FK/row distributions, current TDX/QMT env allowlists, QMT journal/checkpoints and installed terminal artifact identities; record the first unused migration number without editing any applied migration.
- [x] 1.3 Reconcile this change against final stable subscription specs, current candle evidence and roadmap dependency gates; update proposal/design/spec before implementation if real schema or terminal behavior differs.
- [x] 1.4 Produce and review exact OpenAPI envelopes, initialization DTO/VO fields, existing Security PUT HTTP-200/`data=null` results, existing single-Security sources lookup result, expected error-code table, pagination examples, `tdx|qmt` source enum, pagination-independent source-capacity summary, active-evidence/convergence/deferred-removal state table and pinned frontend/monitoring fixtures; freeze them before independent frontend work.

## 2. Assignment schema and backend API

- [x] 2.1 Add the forward-only routing-assignment migration, `(id,security_id)` source-config unique, named assignment unique/FK constraints, preflight/postflight/readback audit SQL and repair-forward notes using the production-confirmed migration number; add no desired column.
- [x] 2.2 Add `RealtimeSubscriptionAssignment` entity metadata with explicit physical names and schema safety/constraint tests; keep TypeORM `synchronize=false` and never expose the entity as HTTP output.
- [x] 2.3 Implement short transactional initialization for `mode=new` and `mode=existing`, exact STOCK/source/providerSymbol validation, assignment uniqueness and per-source ACTIVE capacity; map only approved named conflicts to expected business results.
- [x] 2.4 Guard assigned source-config providerSymbol/enabled changes and deletion with `REALTIME_SOURCE_LOCKED`, permit priority-only historical updates, preserve unknown database errors and use the shared HTTP business-error envelope.
- [x] 2.5 Implement `InitializeRealtimeSubscriptionDto`, `RealtimeSubscriptionQueryDto`, `RealtimeSubscriptionVo` and `RealtimeSubscriptionPageVo` with Swagger metadata, computed desired from Security status, exact `tdx|qmt` sources, pagination-independent `sourceCapacities` and explicit entity/domain-to-VO mapping; reject legacy `mqmt` and add no desired-update DTO.
- [x] 2.6 Implement bounded `/v1/realtime-subscriptions` GET/POST controllers with `id ASC` cursor pagination and shared envelopes; integrate existing Security `PUT activate/deactivate` after database commit without exposing raw control.
- [x] 2.7 Add API/OpenAPI/negative tests for both initialization modes, non-STOCK/unknown resource, immutable routing, priority-only update, ACTIVE capacity and concurrent activation, cursor bounds, `active=null`, deferred removal, dependency failures, unknown TypeORM errors and sensitive-data non-disclosure.

## 3. Backend lifecycle coordinator and effective inventory

- [x] 3.1 Add strict `REALTIME_SUBSCRIPTION_LIFECYCLE_MODE=off|on` config defaulting off; fail startup when on conflicts with either non-empty legacy realtime env allowlist and add configuration tests.
- [x] 3.2 Add a provider-neutral accepted-ready observation that identifies a new connection without deriving desired or directly invoking control from either provider client.
- [x] 3.3 Implement the unique `RealtimeSubscriptionLifecycleCoordinator` with one running round plus one dirty rerun per source, fixed overall deadline, source-local serialization and bounded shutdown cleanup.
- [x] 3.4 Implement ACTIVE-assignment desired reads and ready/reconnect `get -> full sync -> get`; never derive desired from provider evidence, replay an ambiguous request payload or queue work while not ready.
- [x] 3.5 Register `apps/mist` weekday `09:15` `Asia/Shanghai` full-reset cron only in lifecycle on mode; add fake-clock tests for weekday, weekend, overlap, disconnect and shutdown without importing or enabling `apps/schedule`.
- [x] 3.6 Integrate ACTIVE transition/ACTIVE assignment initialization: during weekday 09:15–15:00 call only missing-symbol incremental `subscribe` plus readback; outside the window persist only; SUSPENDED/DELISTED transitions never call unsubscribe and remain deferred until reset.
- [x] 3.7 Implement source-local observations and VO mapping for `converged|pending|drifted|blocked|unknown`, computed desired, `active=true|false|null`, deferred-removal reason, TDX native-list evidence, QMT durable-registry evidence and bounded stable failure reasons.
- [x] 3.8 Replace static env business authorization in on mode with immutable assignment plus provider-confirmed effective inventory; atomically apply readback, reject cross-source/unassigned snapshots and preserve off-mode rollback behavior.
- [x] 3.9 Integrate effective listener add/remove with common latest and candle lifecycle: desired alone cannot admit product data, deferred active continues until reset readback, successful removal cleans latest, and already registered candle due still completes its owning terminal path.
- [x] 3.10 Add concurrency/contract tests for activation during reconcile, capacity races, nighttime activation, deactivation deferral, stale connection readback, reconnect after unknown outcome, full-reset failure, effective inventory replacement, latest cleanup and candle listener boundaries.

## 4. QMT journal startup reconciliation

- [x] 4.1 Implement bounded startup replay from verified journal manifests/checkpoints through the tail, classifying resolved, complete-open, exact-ID unresolved, retained-recovery and ID/hash unknown lifecycles without reading callback payloads.
- [x] 4.2 Reconstruct only journal-proven whole/single registry buckets and keep unproven lifecycles private/blocked; update `get_subscriptions` and health without claiming a provider-native active list.
- [x] 4.3 Before sending realtime ready, run a bounded current-owner-fenced startup cleanup using the existing single native slot and deterministic whole-first/single-symbol/subId order; persist recovery intent before each exact-ID unsubscribe.
- [x] 4.4 Persist recovery result/terminal transition, accept only exact bool true as resolved, continue remaining cleanup after false/timeout/exception, and preserve `reconciliationRequired` for false/timeout/exception/durability/unknown outcomes without blocking process health or WebSocket startup.
- [x] 4.5 Prevent the same lifecycle from receiving another automatic startup attempt across process restarts; preserve durable operator context-rebuild observation as the only unlock for an unconfirmed attempt or ID-less ambiguity, and make source-scoped recovery trigger one QMT reconnect after unlock.
- [x] 4.6 Extend QMT health and bounded diagnostics with replay/cleanup phase/duration, recoverable/unknown counts and attempt result totals while excluding ID, symbol, owner, lease, path, digest and free-form errors from labels/public output.
- [x] 4.7 Add deterministic tests for clean/empty journal, resolved archives, complete-open handle cleanup, native-result-without-transition, retained-recovery, exact true/false, timeout, late result, durability failure, missing ID, hash/checkpoint damage, interrupted maintenance, remaining-ID continuation, ready-after-terminal-cleanup and restart non-repetition.
- [x] 4.8 Regenerate/check datasource OpenAPI and run complete `uv run pytest`, `uv run ruff check .` and `uv run pyright` baseline.

## 5. Monitoring, deployment and operator recovery

- [x] 5.1 Add backend/datasource lifecycle health fields and low-cardinality metrics for mode, ACTIVE desired/active/converged counts, deferred removals, convergence, trigger/result/reason, attempt/success age and QMT startup cleanup; add negative label-cardinality tests.
- [x] 5.2 Update `mist-monitoring` parsers/exporter/docs/alerts for exact new fields, preserving unknown instead of fabricated zero and keeping TDX/QMT evidence semantics distinct; run all Go/Python/metric contract tests.
- [x] 5.3 Update `mist-deploy` env example/defaults/Compose contract and backend recreation flow for lifecycle mode; keep default off and reject on-mode legacy allowlist conflicts without silently importing or clearing them.
- [x] 5.4 Add `pwsh-preview` preflight/postflight/readback tests for assignment migration, lifecycle off/on health, ACTIVE desired/active convergence, ready reset, 09:15 barrier evidence and unrelated-source/container identity.
- [x] 5.5 Extend QMT source-scoped recovery workflow/runbook to report startup attempt evidence, retain context-rebuild after false/unknown and reconnect only QMT after durable unlock; prove it never automatically restarts TDX or the whole stack.
- [x] 5.6 Add rollback and diagnostics tests proving mode-off/image rollback preserves assignment rows, migration history, QMT journal/checkpoints, Redis volumes and protected business tables even when diagnostics collection fails.

## 6. Cross-repository validation and production promotion

- [x] 6.1 Run `mist` lint/typecheck/full UTC tests/contracts/docker build, real-MySQL migration/schema tests, `git diff --check`, retired path/dual-authority searches and `openspec validate --all --strict`; report pre-existing failures separately.
- [ ] 6.2 Deploy matched candidate with lifecycle off, initialize/audit assignments, record repository SHAs/image tags/terminal bridge paths or platform-unavailable evidence/SHA-256 and verify no production mutation or protected-table change.
- [ ] 6.3 During a supported Windows trading session, prove backend/datasource restart and reconnect `get -> reset -> get`, intraday single activation, deactivation deferred removal, effective listener/freshness, source isolation, common latest cleanup and protected-table digest invariance.
- [ ] 6.4 Prove weekday 09:15 full replacement with bounded trigger coalescing; classify holiday/out-of-session output separately and do not use it as fresh-data evidence.
- [ ] 6.5 Prove QMT datasource restart with clean/resolved/open/exact-ID journal evidence, exact true cleanup, deterministic false/unknown continuation and replacement block, durable context-rebuild recovery, journal/checkpoint continuity and no unrelated-source restart.
- [ ] 6.6 Clear legacy realtime env allowlists, promote lifecycle mode on, recreate backend and verify API/health/metrics ACTIVE-desired/active/effective convergence for both sources before calling production lifecycle integrated; frontend verification remains in `add-realtime-subscription-operator-ux`.
- [ ] 6.7 Exercise source-scoped rollback to mode off/last-known-good images without reversing migration or deleting assignments/journal/Redis/MySQL facts; record remaining unknown handles as operator recovery rather than success.
- [ ] 6.8 Reconcile every requirement/task with automated, real-MySQL, Windows, trading-session and rollback evidence; update stable specs and roadmap only after all gates pass, then run strict validation before archive.
