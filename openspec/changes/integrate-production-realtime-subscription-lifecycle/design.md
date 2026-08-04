## Context

当前 master 已具备 TDX/QMT schema-v2 realtime transport、四方法 subscription control、QMT durable journal、monitoring 和 candle shadow 产品化。为避免 transport change 偷渡产品行为，stable specs 又明确要求正常 backend 在 `ready`/reconnect 后不发送 control，并把 QMT registry 定义为 non-crash-recoverable。2026-08-04 candle HIL 证明单条 test-only subscribe/finally cleanup 可以产生 canonical/candidate，但同时把 production authoritative reconciliation、desired/active convergence 与 QMT journal startup reconciliation 登记为独立缺口。

本 change 横跨 `mist`、`mist-datasource`、`mist-deploy` 和 `mist-monitoring`，并新增公共 HTTP、MySQL schema、自动 recovery、cron 和发布 mode，因此以 `docs/governance/README.md` 的 HTTP/data/runtime/OpenSpec 门禁设计。`mist` 是唯一业务 desired/effective owner；datasource 只拥有 provider control 与 QMT journal/registry；candle、strategy 和 notification 仍是单向下游。`mist-fe` 由独立 `add-realtime-subscription-operator-ux` change 消费冻结契约，不属于本 change 实现范围。

## Goals / Non-Goals

**Goals:**

- 用持久化 assignment 固定 `securityId -> sourceConfig/providerSymbol`，不在 assignment 复制 desired。
- 以 ACTIVE、已分配的 STOCK Securities 形成 exact desired，并与 provider-specific active evidence 收敛。
- 在 ready/reconnect 和工作日 09:15 使用 read-before-reset full sync；在日内激活时只补单条 subscribe，停用等待 reset 删除。
- 冻结足够让独立 frontend change 初始化、分页查看、激活/停用并准确展示 TDX/QMT 不同 active evidence 的公共契约与 fixtures。
- 让 QMT datasource 从 durable journal 恢复可证明 handle，并对 exact `subId` 做一次有证据的 best-effort cleanup；所有不确定性保持 fail closed for replacement，但不阻塞 transport 或其余 cleanup。
- 保持 capacity、timeout、pending state、diagnostics、metrics、migration、发布和 HIL 有界可验收。

**Non-Goals:**

- 不允许运行时修改 assignment 的 source/providerSymbol，不自动选择或切换 TDX/QMT。
- 不建立公共任意 `subscribe`/`unsubscribe`/`sync` controller、CLI 或 frontend action。
- 不为 realtime subscription 单独增加 desired PATCH；Security status 继续是业务激活状态。
- 不在 Security 停用时立即调用 provider unsubscribe。
- 不恢复 `apps/schedule`、post-close history sync、legacy/experimental realtime transport。
- 不把 QMT registry 描述为 provider-native active list，不从 callback silence/heartbeat 推断退订成功。
- 不修改 candle Redis schema、MySQL `k`、策略、Signal、AlertEvent 或 notification 语义。
- 不新增 A 股节假日日历；09:15 和日内窗口只按 `Asia/Shanghai` 周一至周五判断。

## Decisions

### 1. Assignment 只拥有 immutable realtime routing，Security status 拥有 desired

新增 `realtime_subscription_assignments`，包含 `id/security_id/source_config_id/created_at/updated_at`。`security_id` 与 `source_config_id` 各自唯一；`security_source_configs` 增加 `(id,security_id)` named unique，assignment 用 `(source_config_id,security_id)` named FK 防止跨 Security 绑定，另以 named FK 约束 Security。表不复制 `source`、`providerSymbol` 或 desired，HTTP VO 从 Security 与受保护的 source config 映射。

authoritative desired 固定为：`Security.status=ACTIVE`、`Security.type=STOCK`、存在唯一 assignment、assignment 指向 enabled TDX/QMT source config。provider active list/registry 只证明当前实际订阅，不反向决定 desired。

初始化支持两种事务：创建新 ACTIVE STOCK Security + source config + assignment，或绑定现有 ACTIVE STOCK Security 的 source config。两种都要求 source config enabled、source 为 TDX/QMT、providerSymbol 精确合法、尚无 assignment。assignment 存在后，source/providerSymbol/enabled 与 assignment 删除必须返回 expected business rejection `REALTIME_SOURCE_LOCKED`；historical `priority` 仍可单独修改，direct SQL 不属于产品路径并由 schema audit 检测。

`mode=existing` 不增加 discovery API。frontend 要求 operator 输入一只 canonical Security code，只对该 code 调用现有 `GET /v1/securities/:code/sources`，在返回的有界 source-config 列表中展示 enabled `tdx|qmt` 项；lookup 响应沿用现有字段名 `formatCode`，UI 将其只读标注为 provider symbol，不把它重命名后回传。提交时只发送选中项的稳定 `securitySourceConfigId`，不得在 browser 复制或改写 `formatCode/providerSymbol`。frontend 的过滤只改善交互，backend POST 仍在事务内权威校验 Security 为 ACTIVE STOCK、source config enabled 且未绑定，并返回 stable expected rejection。禁止通过无界 `/v1/securities` 再逐只 N+1 扫描 source configs。

每 source 最多 5 个 ACTIVE assignments。创建 ACTIVE assignment 或激活已分配 Security 时，V1 单 backend 通过 source-local serialized owner + 短事务锁/重计数维护容量；停用释放 desired capacity，但不即时删除 provider subscription。没有 assignment 的普通 Security activate/deactivate 不进入 realtime capacity 或 control。

选择独立 assignment 表而不是给 `security_source_configs` 增加 realtime flag，是为了在一只 Security 同时拥有 historical TDX/QMT/EastMoney config 时，明确且不可变地选择唯一 realtime source，而不复用 historical priority 猜测。

### 2. 公共 API 复用 Security PUT，subscription API 只初始化与查询

controller family 固定为 `/v1/realtime-subscriptions`：

- `GET ?afterId=<positive-int>&limit=<1..100>`，默认 20，稳定 `id ASC`，返回 `RealtimeSubscriptionPageVo`。
- `POST` 接收 `InitializeRealtimeSubscriptionDto` 判别联合：`mode=new` 携带 `newSecurity`，或 `mode=existing` 携带 `securitySourceConfigId`；不携带独立 desired。

`RealtimeSubscriptionPageVo` 除当前页 `items/nextAfterId` 外，必须返回与分页无关的 `sourceCapacities`，每项固定包含 `source='tdx'|'qmt'`、`activeAssignmentCount` 与 `limit=5`。这里的计数只表示该 source 上占用 desired capacity 的 ACTIVE assignments，绝不表示 provider active evidence。frontend 不得通过当前页行数猜测全局容量，也不得为容量判断拉取全部分页。公共契约只接受后端枚举值 `qmt`，不得继续暴露或接受 frontend 旧别名 `mqmt`。

激活/停用继续复用既有幂等接口：

- `PUT /v1/securities/:code/activate`
- `PUT /v1/securities/:code/deactivate`

所有成功返回共享 envelope；expected domain rejection 使用真实 HTTP 200、`success=false`、stable code、安全中文 message 与 bounded typed data。validation/permission 仍是真实 4xx；datasource dependency/deadline 为 502/503/504；数据库/unknown 为 500。controller 不返回 entity，repository 不捕获未知 TypeORM error；精确 unique conflict 只按 named constraint 映射 owning domain code。

既有 Security activate/deactivate handler 返回 `void`，因此两个 PUT 的成功契约固定为 HTTP 200、`success=true`、`data=null`；frontend 必须用 data-returning envelope parser 解析，不能误用只接受 204 的 no-content client。

数据库事务先提交，provider I/O 不进入事务。初始化、激活或停用提交后，backend 在返回前只重读一次 assignment/status 以刷新 source-level desired/assigned evidence；该重读不调用 datasource control。激活/初始化成功后 provider add 失败不回滚 ACTIVE 事实；停用成功后不调用 provider unsubscribe。frontend 在 PUT/POST 成功后刷新 bounded subscription inventory，展示最新 active/convergence。

### 3. Coordinator 按 trigger 区分 add-only 与 destructive reset

`apps/mist` 新增 `RealtimeSubscriptionLifecycleCoordinator`；provider client 仍只负责 typed WS request/response，不自行派生 desired。每 source 只有一个 running round 和一个 boolean dirty rerun；额外触发合并，不保存无界 promise/trigger queue。WS 不 ready 时不发送、不排队 mutation；未来 ready 重新读 DB。每轮有固定 overall deadline，单个 control 使用 provider client 的 bounded timeout。

trigger policy：

| Trigger | Policy |
|---|---|
| datasource ready / reconnect | `getSubscriptions -> syncSubscriptions(exact ACTIVE set) -> getSubscriptions`；允许 datasource 内部 destructive reset |
| weekday 09:15 Asia/Shanghai | 同上，即使之前 converged 也执行 daily reset |
| ACTIVE transition/ACTIVE assignment initialization，且为周一至周五 09:15–15:00 | 只对 fresh readback 缺少的目标调用一次 incremental `subscribe`，随后 `getSubscriptions` |
| ACTIVE transition/initialization 在上述窗口外 | 只提交数据库，等待下一次 ready/reconnect 或 09:15 reset |
| SUSPENDED/DELISTED transition | 不调用 unsubscribe；记录 deferred removal，等待下一次 reset |

ready/reconnect 先执行 readback，但其目的只是建立当前 evidence 和处理前一次 outcome unknown；随后仍以 ACTIVE assignments 执行 full reset。provider active evidence 绝不成为 desired authority。public HTTP、frontend、CLI 与 diagnostics 不得调用 `unsubscribe` 或 `syncSubscriptions`。

### 4. Active/effective 保持 provider-specific evidence

TDX `getSubscriptions()` 的 fresh terminal-native list 产生 `activeEvidence=tdx_native_list`。QMT `getSubscriptions()` 的 journal-backed whole/single registry 产生 `activeEvidence=qmt_durable_registry`，只证明 datasource 已接受的 durable handle ownership，不声明 QMT 提供 native inventory。

assignment VO 的 `desired` 是 `Security.status=ACTIVE` 的计算结果，不是 assignment 持久列；`active` 只允许 `true|false|null`。`convergence`：

- `pending`：source reconciliation 正在运行；
- `converged`：fresh active 与 ACTIVE desired 相等；
- `drifted`：fresh active 与 desired 不等且未被 recovery block，包括 deferred removal；
- `blocked`：QMT reconciliation、journal、capacity 或已知 control state 阻止 mutation；
- `unknown`：没有 fresh readback 或 outcome unknown。

成功 readback 原子替换 source-local effective inventory。snapshot 只有同时满足 immutable assignment、当前 source、当前 provider-confirmed effective active 才能进入 canonical ingress/product sinks。ACTIVE 但尚未 active 不提前注册 candle listener；Security 已停用但 provider 仍 active 时，snapshot 在 reset 证明移除前继续按旧 effective inventory 接受。成功移除后清理 common latest，并通知 candle listener removal；candle 已登记 due 继续按 candle spec 形成终态。

### 5. QMT startup recovery 在 ready 前尽量 cleanup，失败不阻塞 transport

QMT datasource 在发送 `realtime.ready` 前从最新 verified checkpoint/manifest 起重放 bounded journal tail，验证 hash chain，并分类：

1. durable subscribe result + registry transition 且没有 terminal transition：recoverable open handle；
2. durable native result 返回 exact integer ID 但 registry transition 缺失：recoverable unresolved ID；
3. retained-recovery 带 exact ID：recoverable unresolved ID，但不宣称 physical live；
4. durable unsubscribe/operator observation：resolved；
5. intent 后无 accepted result、ID 缺失、hash/maintenance ambiguity：unrecoverable unknown。

只要存在 1–3，datasource 在 ready 前进入 bounded private startup cleanup phase，等待 current QMT owner lease，然后按 whole-first、single providerSymbol、subId 的确定顺序各暴露一次 `unsubscribe_quote(subId)`。每个 attempt 在 native call 前写 durable recovery intent，result 后写 durable recovery result/terminal transition；同一 lifecycle 的已持久化 attempt 在后续 restart 不再自动执行。

单项 false、timeout、exception 或 durability failure 不阻止其余可取消 ID 的 cleanup，也不永久阻止 datasource 进程、health 或 WebSocket transport；cleanup phase 到达有界终态后可发送 transport `realtime.ready`。但任一未确认 lifecycle 或第 5 类存在时必须保持 `reconciliationRequired=true`，拒绝 replacement，coordinator 将 source 标记 blocked；只有 durable operator context-rebuild observation 可解除，并由 source-scoped recovery 触发一次 QMT reconnect 重新进入统一 ready 流程。

### 6. 09:15 destructive barrier 属于 realtime lifecycle

`apps/mist` 使用已有 `@nestjs/schedule` dependency，在 realtime lifecycle module 注册 cron `0 15 9 * * 1-5`、`timeZone=Asia/Shanghai`。它只触发 coordinator，不读取/写入 historical K，不调用 `apps/schedule`。节假日仍可能触发；transport 未 ready 时记录 unknown，不启动 timer retry，后续 ready/reconnect 将执行同一 reset。

### 7. Health、metrics 和下游 consumer 只使用直接观察事实

backend source lifecycle state 暴露 ACTIVE desired/active counts、convergence enum、deferred-removal count、last attempt/success instant/age、trigger/result/reason 与 mode。QMT 继续暴露 journal/reconciliation/recovery aggregate。Prometheus labels 只允许 source、trigger、result、stable reason/evidence enum；providerSymbol、securityId、subId、ownerId、generation、journal path、digest 和自由文本不进入 label。

本 change 负责产出并冻结 frontend/monitoring 可消费的 OpenAPI、examples、state table 与 SHA-256 sidecars，但不修改 `mist-fe`。独立 `add-realtime-subscription-operator-ux` change 负责 `/settings/realtime-subscriptions`、API client、pinned copy、navigation 和 UI tests；任何 owning backend 字段变化必须先回写本 change，frontend 不得自行建立兼容别名或 raw control。

## Risks / Trade-offs

- [QMT journal 能证明 ID 但不能证明当前 physical handle] → 每个 startup ID 只尝试一次；false/unknown 不当成功，保持 reconciliationRequired 并走 context rebuild。
- [ACTIVE desired 与 provider mutation 无法原子提交] → MySQL Security/assignment 是 desired authority，active 是 provider-specific observation；失败保留 drift/blocked，不回滚 Security status。
- [同一进程并发激活可能突破每源 5 个] → source-local owner + 短事务锁/重计数；V1 明确单 backend instance，多实例需 focused change。
- [停用后 provider 仍发送 snapshot] → 不在日内破坏 whole；以 deferred-removal reason 展示，继续按 active evidence 接受，下一次 reset 后清理 latest/listener。
- [ready/reconnect full reset 会产生 provider churn] → 这是明确接受的简单恢复策略；所有取消由 datasource 顺序执行，未确认时不创建 replacement。
- [旧 source mutation API 可破坏 immutable assignment] → application service 只允许 priority-only update，拒绝 providerSymbol/enabled/delete；FK/audit 阻止或发现越界写。
- [journal replay 增加 startup latency] → bounded cleanup 完成或失败终态后再发送 ready，受现有 timeout/journal cap 约束；不扫描 callback payload。
- [跨仓 contract 不匹配] → backend 先固定 OpenAPI/fixtures/sidecars，frontend/monitoring/deploy 使用 pinned copy，按匹配版本组发布。

## Migration Plan

1. 从已包含 governance commit 的最新 master 创建独立 change/worktree；只读审计生产 `schema_migrations`、`securities`、`security_source_configs` DDL/rows/index/FK、现有 env allowlist 与 terminal/journal state，确认首个未使用 migration 编号。
2. 在 lifecycle mode=off 下发布 forward-only migration、entity/API、datasource journal replay、monitoring 和 deploy contract；运行 preflight/backup/apply/postflight/readback。frontend 由独立 change 使用匹配 contract 发布。
3. operator 先通过 API 初始化 assignments，核对 ACTIVE STOCK、source/providerSymbol 与每源 ACTIVE capacity；旧 env allowlist 不自动导入。独立 frontend change 完成后可使用匹配 contract 的 UI 执行同一操作。
4. 使用 deterministic journal fixtures 完成 local/CI，随后在 Windows 支持交易时段完成 backend restart、ready/reconnect、日内 single add、deferred removal、09:15 reset、QMT datasource restart、exact true/false、context rebuild、candle effective listener 和 protected-table digest HIL。
5. 清空旧 `TDX_REALTIME_ALLOWLIST` / `QMT_REALTIME_ALLOWLIST`，将 mode 切为 on，recreate backend 并验证两源 ACTIVE desired/active/converged、freshness 和 metrics；frontend 验证属于独立 change。
6. 回滚只把 mode 切回 off 并恢复 last-known-good matched images；保留 migration、assignment、journal、Redis 和业务表。QMT unknown handle 先执行现有 source-scoped recovery，不以镜像回滚宣称 handle 已释放。

## Open Questions

- 无待产品决策。`mode=existing` 固定为 operator 输入 canonical Security code 后复用现有 `/v1/securities/:code/sources` 的单证券有界 lookup，不新增 discovery API，也不允许全库 N+1 扫描。日内窗口为 `Asia/Shanghai` 周一至周五 09:15（含）至 15:00（不含），不引入节假日日历；若真实 provider/production HIL 证明该窗口或 QMT cleanup 行为不成立，必须暂停并更新 change，不能由实现自行猜测。
