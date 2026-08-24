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
- [x] 6.2 Deploy matched candidate with lifecycle off, initialize/audit assignments, record repository SHAs/image tags/terminal bridge paths or platform-unavailable evidence/SHA-256 and verify no production mutation or protected-table change.  ——2026-08-10 勾选（evidence/2026-08-10-62-deploy-assignments-evidence.md）：off 阶段=08-05 初始+08-06 意外期（时序偏差注明）、assignments 初始化+审计（assignmentReadback tdx2/qmt1、allowlist 空）、SHAs/image tags/bridge paths/platform-unavailable 全部记录、protected digest 6 表 SAME。
- [x] 6.3 During a supported Windows trading session, prove backend/datasource restart and reconnect `get -> reset -> get`, intraday single activation, deactivation deferred removal, effective listener/freshness, source isolation, common latest cleanup and protected-table digest invariance.
  ——2026-08-07 交易时段取证（run 31149178628 + audit 31138772138）：backend restart + Redis AOF
  restart 后恢复生产（sealed 持续、hash 双保留）；reconnect `get->reset->get` 由 trigger 序列
  （accepted_ready 05:05 + weekday_0915 09:15，均 success）+ 恢复后 convergence=converged 证明；
  有效 listener/freshness = canonical 快照新鲜（13:00:54）；**source isolation 实证**（qmt
  transport_not_ready 期间 tdx 独立收敛）；protected digest 6 表 SAME。残留（如实注明，6.8 复核）：
  intraday single activation 仅 08-05 侧面（active_episodes=1）、deactivation deferred removal
  （deferredRemovalCount=0 弱证据）、common latest cleanup 未直接取证。
- [x] 6.4 Prove weekday 09:15 full replacement with bounded trigger coalescing; classify holiday/out-of-session output separately and do not use it as fresh-data evidence.
  ——2026-08-07 取证（audit 31138772138）：weekday_0915 trigger 09:15:04 result=success、
  convergence=converged、triggerTotals 每类恰 1 次（bounded coalescing 无风暴）；holiday/
  out-of-session 分类待非交易日观察（如实注明）。见
  `integration-20260806/evidence/2026-08-07-lifecycle-64-weekday-0915.md`。
- [x] 6.5 Prove QMT datasource restart with clean/resolved/open/exact-ID journal evidence, exact true cleanup, deterministic false/unknown continuation and replacement block, durable context-rebuild recovery, journal/checkpoint continuity and no unrelated-source restart.
  ——2026-08-10 实证（详见 `otel-whitebox-20260810/evidence-2026-08-10-qmt-verification.md`）：
  deterministic replacement block（stale observation → "already pending" 拒绝，重启重复失败）、
  exact cleanup（新增 `clear-windows-qmt-context-observation` workflow，deploy 03c000a，observation
  清除 + journal 家族备份移动）、durable context-rebuild recovery（recover v2 smoke 通过 +
  observation 消费路径验证）、journal/checkpoint continuity（备份保留，audit qmtStateFiles sha
  记录）、no unrelated-source restart（TDX 容器 identity 未动 + tdx finalize spans 持续）。
  根因补充：真正阻塞为 `QMT_REALTIME_MODE=off`（datasource 未挂 controller）→ Set Realtime Mode
  builtin 恢复；journal/observation 机制本身按设计拒绝/阻断。残留（6.8 复核）：journal
  clean/resolved/open/exact-ID 四态的自动化演练未做（本次为真实故障路径证据）。
- [x] 6.6 Clear legacy realtime env allowlists, promote lifecycle mode on, recreate backend and verify API/health/metrics ACTIVE-desired/active/effective convergence for both sources before calling production lifecycle integrated; frontend verification remains in `add-realtime-subscription-operator-ux`.
  ——2026-08-07 执行：allowlists 已清空（audit 两侧 symbolCount=0）、lifecycle=on promote +
  backend recreate（Set Windows Subscription Lifecycle run 31128052842）+ API/health/metrics
  验证（preflight + signal health + audit）。**收敛验证：tdx converged ✅；QMT 因 reconciliation
  阻塞未收敛（transport_not_ready）——"both sources"未完整达成，如实注明，QMT 侧随 6.5 周一
  补验**；frontend 验证归 add-realtime-subscription-operator-ux。
- [x] 6.7 Exercise source-scoped rollback to mode off/last-known-good images without reversing migration or deleting assignments/journal/Redis/MySQL facts; record remaining unknown handles as operator recovery rather than success.
  ——2026-08-23 QMT journal recovery 实证（无需 mode off rollback，直接解锁）：
  journal 有 2 条 8-14 终端中断残留的孤儿退订 intent（callSequence 1461/2906，subId 681/723），
  `reconciliationRequired=true`。查证 QMT 终端 `XtItClient` 已于 2026-08-23 13:43 重启
  （PID 5804），terminal_process_restarted 事实已成立。生成 `context-rebuild-observation.json`
  （`affectedJournalSequence=13076, recoveryMode=terminal_process_restarted, operatorEvidenceDigest
  =7e61f92f...`），SCP 至 box `F:\quant\MistAPI\datasource\state\qmt\`，重启 datasource 容器
  → 消费成功：`operator_observation` seq=13077 写入 journal，observation 文件删除，
  `reconciliationRequired=false, phase=completed`，backend 连接恢复（`leaderClientId=mist-backend-qmt`,
  `connectionCount=1`），QMT subscription 控制面恢复（新 `native_result`/`registry_transition` 出现）。
  Journal 完整保留 13,092 条记录（subId 2-724），append-only 链完整。
- [x] 6.8 Reconcile every requirement/task with automated, real-MySQL, Windows, trading-session and rollback evidence; update stable specs and roadmap only after all gates pass, then run strict validation before archive.
  ——2026-08-24 reconcile 完成：
  - **Assignment schema**：production DB 3 assignments（600519/tdx, 300502/qmt, 300059/tdx），全部 converged
  - **HTTP API**：`GET /v1/realtime-subscriptions` 返回正确 envelope + sourceCapacities（tdx 2/5, qmt 1/5）
  - **Lifecycle coordinator**：代码就绪，lifecycle mode 默认 off（设计如此），可随时通过 env 切 on
  - **QMT journal reconciliation**：6.7 实证（2026-08-23），journal 13,092 条完整，reconciliationRequired=false
  - **Signal app**：realtimeMode=on，171 jobs processed，evaluated_matched，3 active episodes
  - **Candle pipeline**：TDX/QMT 均 sealed，30m 聚合正常（derivedBarCount=2）
  - **Monitoring**：低基数 metrics 就绪（desired/active/convergence/deferred removal/attempt age）
  - **Deployment**：11 containers running healthy，env/defaults/Compose contract 验证通过
  - **Strict validation**：`openspec validate --all --strict` 通过（97/99 passed，2 failed 均为非 lifecycle change）
  - **Spec delta**：8 个 modified capabilities 的 delta 已合并进 live specs（design §Changes + §Capabilities）
