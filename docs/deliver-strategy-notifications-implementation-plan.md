# Implementation Plan — deliver-strategy-notifications

> 三步工作流 step-2（代码级实施计划）。spec 已确认（2026-08-12）。本文件不是 OpenSpec 四件套，是落地蓝图。
> 落地前需用户确认本计划；确认后才建 worktree 写码（step-3）。

## 锁定决策（来自 spec）

1. 渠道：QQ + 微信，直接对接协议/SDK（不经 AstrBot/mist-skills）。
2. 消费：BullMQ sibling queue `strategy-alert-delivery`，复用 `mist-realtime-redis`。
3. 可靠性：at-least-once + 幂等（`jobId` + dedupeKey）+ 有界重试 + dead-letter + 人工 replay。
4. schema：拆表 migration **018**（`strategy_alert_deliveries`，per-channel）。
5. 部署：独立 app `apps/notification`，复用 `MIST_IMAGE` + command 切换。

## ⚠️ 待用户拍的两个点（plan 内悬而未决）

- **P1（协议选型）**：QQ/微信具体协议。推荐 **WeCom 群机器人 webhook（微信侧）+ NapCat OneBot HTTP（QQ 侧）**，两者都是 HTTP adapter，统一、官方/半官方、无需进程内 SDK。个人微信无官方 API（灰协议易封号）。→ 需确认"微信 = 企业微信"。
- **P2（架构 refinement）**：采用 **fan-out-in-worker + per-(event×channel) BullMQ job**，让 BullMQ 原生承载 per-channel retry/DLQ。这 refine 了 design 决策 3 的 `jobId=alertEventId` → `jobId=alertEventId:channel`，spec 的 per-channel requirement 仍满足（更干净）。→ 需确认。

---

## 架构总览（确认 P2 后）

```
apps/signal  LiveStrategyPersistenceService.persist()
   │ AlertEvent commit 后（仅 'created'）
   ▼  StrategyAlertDeliveryHandoff.publish({ alertEventId })        [job: deliver.fanout, attempts=1]
BullMQ queue  strategy-alert-delivery  (prefix: mist-bullmq, Redis=mist-realtime-redis)
   ▼
apps/notification  StrategyAlertDeliveryWorker
   ├─ job.name='deliver.fanout': 查 enabled channels → 每个 channel 建 pending delivery 记录
   │                              + 入队 deliver.channel 子 job
   └─ job.name='deliver.channel': 载入 evidence → 建 envelope → ChannelAdapter.send()
                                   → 写 delivery 记录(attempt++/status/sent_at/last_error/provider_msg_id)
                                   → reconcile AlertEvent 聚合状态；transient 失败 throw→BullMQ 重试
        ├─ QqChannelAdapter        (NapCat OneBot HTTP)
        └─ WeChatChannelAdapter    (WeCom webhook)

apps/mist  StrategyAlertEventController
   └─ POST /v1/strategy-alert-events/:id/replay  → 对 dead-lettered/failed 渠道重入 deliver.channel job
   └─ GET  /v1/strategy-alert-events/:id/deliveries → per-channel 投递记录（operator 查看）
```

---

## Phase 1 — 数据层

### 1.1 Migration `deploy/database/migrations/018_create_strategy_alert_deliveries.sql`
模板镜像 `017_create_runtime_configs.sql`（forward-only, `CREATE TABLE IF NOT EXISTS`, InnoDB/utf8mb4_unicode_ci, DATETIME(6)）。

```sql
-- Per-channel strategy alert delivery records (deliver-strategy-notifications).
-- Forward-only, additive, idempotent. Authorizing preflight: 2026-08-12 spec confirmed.

CREATE TABLE IF NOT EXISTS `strategy_alert_deliveries` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `strategy_alert_event_id` INT NOT NULL,
  `channel` ENUM('qq','wechat') NOT NULL,
  `status` ENUM('pending','sent','failed','dead_lettered') NOT NULL DEFAULT 'pending',
  `attempt_count` INT NOT NULL DEFAULT 0,
  `last_error` VARCHAR(1024) NULL,
  `provider_message_id` VARCHAR(255) NULL,
  `sent_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_strategy_alert_deliveries_event` (`strategy_alert_event_id`),
  KEY `idx_strategy_alert_deliveries_status` (`status`),
  CONSTRAINT `fk_strategy_alert_deliveries_event`
    FOREIGN KEY (`strategy_alert_event_event_id`)  -- 见下 note
    REFERENCES `strategy_alert_events`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- 注：外键列名 = strategy_alert_event_id（上面笔误，落地用 strategy_alert_event_id）
```

### 1.2 Enums（`libs/shared-data/src/enums/`）
- `strategy-alert-delivery-status.enum.ts`：`PENDING/SENT/FAILED/DEAD_LETTERED`（值 `pending/sent/failed/dead_lettered`）。
- `notification-channel.enum.ts`：`QQ/WECHAT`（值 `qq/wechat`）。

### 1.3 Entity `libs/shared-data/src/entities/strategy-alert-delivery.entity.ts`
镜像 `strategy-alert-event.entity.ts` 装饰器风格（`@Entity({name:'strategy_alert_deliveries'})`、snake_case `name:`、`@CreateDateColumn/@UpdateDateColumn`、字段默认值赋值）。字段对应 1.1 列；`@ManyToOne(StrategyAlertEvent, onDelete:'CASCADE')` + `@JoinColumn({name:'strategy_alert_event_id'})`。

### 1.4 注册
- 加到 `libs/shared-data/src/entities/index.ts` 导出。
- **无全局 entity registry**：每 app `forRootAsync` 自列。加到 `apps/notification` 的 forRootAsync entity 数组、`apps/mist/src/app.module.ts:133-148` entity 数组（replay/list 要读）。apps/signal **不需要**（只按 alertEventId 入队，不碰 delivery 表）。

**验证**：`node tools/run-migrations.mjs`（本地 docker mysql）+ TypeORM 启动无 schema drift。

---

## Phase 2 — Queue 契约 + producer（apps/signal 侧）

### 2.1 契约 `libs/signal/src/contracts/strategy-alert-delivery.contract.ts`
镜像 `candle-finalized-trigger.contract.ts`：
```ts
export const STRATEGY_ALERT_DELIVERY_BULLMQ_PREFIX = 'mist-bullmq';   // 复用既有 prefix
export const STRATEGY_ALERT_DELIVERY_QUEUE_NAME = 'strategy-alert-delivery';
export const STRATEGY_ALERT_DELIVERY_FANOUT_JOB = 'deliver.fanout';
export const STRATEGY_ALERT_DELIVERY_CHANNEL_JOB = 'deliver.channel';
export const STRATEGY_ALERT_DELIVERY_WORKER_CONCURRENCY = 4;

export const STRATEGY_ALERT_DELIVERY_CHANNEL_JOB_OPTIONS = Object.freeze({
  attempts: 5,
  backoff: Object.freeze({ type: 'exponential', delay: 5_000 }),       // 5s→30s→2m→10m→30m 近似
  removeOnComplete: Object.freeze({ age: 86_400 }),
  removeOnFail: Object.freeze({ age: 604_800 }),                        // 失败留 7d 供 DLQ 查看
});
export const STRATEGY_ALERT_DELIVERY_FANOUT_JOB_OPTIONS = Object.freeze({
  attempts: 1, removeOnComplete: Object.freeze({ age: 86_400 }),
});

// envelope + decode + jobId builder（镜像 V1 模式）
export interface AlertDeliveryFanoutJobV1 { readonly version: 1; readonly alertEventId: number; }
export interface AlertDeliveryChannelJobV1 { readonly version: 1; readonly alertEventId: number; readonly channel: NotificationChannel; }
// decodeAlertDeliveryFanoutJobV1 / decodeAlertDeliveryChannelJobV1 / alertDeliveryChannelJobId(id,channel) = `${id}:${channel}`
```

### 2.2 Handoff port（apps/signal 侧 producer）
镜像 `apps/mist/.../strategy-trigger/`：port token（Symbol）+ 窄接口 + BullMq 实现。
- `apps/signal/src/realtime/notification/strategy-alert-delivery-handoff.port.ts`：
  ```ts
  export const STRATEGY_ALERT_DELIVERY_HANDOFF_PORT = Symbol('STRATEGY_ALERT_DELIVERY_HANDOFF_PORT');
  export interface StrategyAlertDeliveryHandoffPort { publish(alertEventId: number): Promise<void>; }
  ```
- `apps/signal/src/realtime/notification/bullmq-strategy-alert-delivery-handoff.service.ts`：
  `@InjectQueue(STRATEGY_ALERT_DELIVERY_QUEUE_NAME) queue`；`publish(id)` → `queue.add(FANOUT_JOB, decode..., { ...FANOUT_JOB_OPTIONS, jobId: \`fanout:${id}\` })`。
- `apps/signal/src/realtime/notification/strategy-alert-delivery-handoff.module.ts`：`BullModule.forRootAsync({prefix, connection: parseRedisConnectionUrl(MIST_REALTIME_REDIS_URL)+ enableOfflineQueue:false + maxRetriesPerRequest:1})` + `registerQueue`（**不加 manualRegistration**，producer 侧）。把 port token 绑到实现并 export。

### 2.3 注入 producer（`apps/signal/src/realtime/live-strategy-persistence.service.ts`）
- 构造加 `@Inject(STRATEGY_ALERT_DELIVERY_HANDOFF_PORT) private readonly deliveryHandoff: StrategyAlertDeliveryHandoffPort | null`（可选注入，mock/测试可 null）。
- 在 `persist()` 事务内 **捕获** `savedAlert.id`（当前 `manager.save(StrategyAlertEvent, alert)` 后 alert.id 已回填，但未暴露）——把 savedAlert.id 暂存到 tx 外层变量。
- **commit 后、仅 `return 'created'` 前**调 `await this.deliveryHandoff?.publish(savedAlertId)`；enqueue 失败 **catch + log warn + metric**，**不影响** persist 返回（Signal 已提交；dual-write 窗口按 design 接受）。
- `duplicate_skipped` 分支 **不 enqueue**。

**验证**：单测覆盖 created→publish 调用一次、duplicate_skipped→不调用、publish throw→persist 仍返回 created。

---

## Phase 3 — apps/notification worker

### 3.1 App 脚手架（镜像 `apps/signal`）
- `apps/notification/src/main.ts`：`NestFactory.create(NotificationAppModule)` + `app.useLogger(app.get(Logger))` + `app.enableShutdownHooks()` + `app.listen(process.env.PORT ?? 8006)`。**不要** connectMicroservice（无 RPC）。**不要** 在 main.ts 碰 OTel（preload 负责）。**不要** ValidationPipe/CORS（无此惯例）。
- `apps/notification/src/notification-app.module.ts`：`LoggerModule.forRoot(pino)`、`ConfigModule.forRoot({isGlobal, validationSchema: notificationEnvSchema})`、`TypeOrmModule.forRootAsync({mysql... entities:[StrategyAlertEvent, StrategySignal, StrategyAlertDelivery, StrategyDefinition, StrategyVersion]})`、`BullModule.forRootAsync({prefix, connection: redisConnectionOptions(MIST_REALTIME_REDIS_URL) + maxRetriesPerRequest:null, extraOptions:{manualRegistration:true}})` + `registerQueue(QUEUE)`、`NotificationDeliveryModule`、`NotificationHealthController`。
- `libs/config/src/validation.schema.ts`：新增 `notificationEnvSchema = commonEnvSchema.append({ PORT, MIST_REALTIME_REDIS_URL, NOTIFICATION_CHANNELS: 'qq,wechat', NOTIFICATION_QQ_*, NOTIFICATION_WECHAT_*, OTEL_* })`。

### 3.2 Worker `apps/notification/src/delivery/strategy-alert-delivery.worker.ts`
镜像 `candle-finalized-bullmq.worker.ts`：
```ts
@Processor(STRATEGY_ALERT_DELIVERY_QUEUE_NAME, {
  concurrency: STRATEGY_ALERT_DELIVERY_WORKER_CONCURRENCY,
  maxStalledCount: 0,
  prefix: STRATEGY_ALERT_DELIVERY_BULLMQ_PREFIX,   // ⚠️ 必须显式，不继承 forRootAsync
})
export class StrategyAlertDeliveryWorker extends WorkerHost {
  async process(job): Promise<unknown> {
    switch (job.name) {
      case FANOUT_JOB:  return await this.fanoutService.run(job.data);
      case CHANNEL_JOB: return await this.channelDeliveryService.run(job.data);
    }
  }
}
```

### 3.3 Fanout service（`deliver.fanout`）
- 载入 AlertEvent（若已非 PENDING/已 processed 则幂等跳过）。
- 读 `NOTIFICATION_CHANNELS` → 每个 channel：`upsert` pending `strategy_alert_deliveries` 记录（`jobId`/unique 防重）+ `queue.add(CHANNEL_JOB, {alertEventId, channel}, {...CHANNEL_JOB_OPTIONS, jobId: alertDeliveryChannelJobId(id,channel)})`。
- 幂等：同 alertEventId 重入 fanout 不重复入队（jobId 去重 + 记录 unique）。

### 3.4 Channel delivery service（`deliver.channel`）+ adapter
- 载入 AlertEvent + Signal evidence（contextSnapshot/ruleSnapshot/signalKind/signalTime）。
- 建 `NotificationEnvelope`（channel-neutral：alertEventId、dedupeKey、signalKind、symbol、triggerTime/price、context 摘要）。
- 选 adapter（`@Inject(CHANNEL_ADAPTERS)` Map<channel, ChannelAdapter>）。
- `result = await adapter.send(envelope)` → 写 delivery 记录（attempt_count++、status、sent_at、provider_message_id、last_error 截断 1024）。
- reconcile 聚合：查该 alertEventId 所有 delivery 记录；全 `sent`→AlertEvent.status=DELIVERED；任一 `dead_lettered`→FAILED；否则保持 PENDING。
- **重试语义**：`result.status==='transient_failure'` → `throw`（BullMQ 按 attempts/backoff 重试）；`permanent_failure` → 不 throw（直接标 failed，不浪费重试）。attempt 耗尽（BullMQ failed）→ 记录标 `dead_lettered`（worker 监听 failed 或在 catch 内据 attempt_count 判定）。

### 3.5 Channel adapter（P1 协议落地）
```ts
export const CHANNEL_ADAPTERS = Symbol('CHANNEL_ADAPTERS');
export interface ChannelAdapter { readonly channel: NotificationChannel; send(e: NotificationEnvelope): Promise<ChannelSendResult>; }
export interface ChannelSendResult { status: 'sent'|'transient_failure'|'permanent_failure'; providerMessageId?: string; error?: string; }
```
- `qq.adapter.ts`（NapCat OneBot HTTP `POST /send_msg`，读 `NOTIFICATION_QQ_BASE_URL` + token）。
- `wechat.adapter.ts`（WeCom webhook `POST <webhook>`，读 `NOTIFICATION_WECHAT_WEBHOOK`）。
- 凭据只从 env 注入；日志/evidence 脱敏（redact webhook URL/token）。
- HTTP timeout 10s（`UNREF` + AbortController）。

### 3.6 Replay + deliveries 查询（apps/mist 侧，operator 面）
- `apps/mist/src/strategy/.../strategy-alert-event.controller.ts` 加：
  - `POST :id/replay` → service 查 failed/dead_lettered delivery 记录 → 对每个重入 `deliver.channel` job（需 apps/mist 也 `registerQueue` 该 queue 作 producer）。
  - `GET :id/deliveries` → 返回 per-channel 投递记录列表。
- service/controller 镜像现有 `strategy-alert-event.service.ts` 两层（core module providers + outer module controllers）。

**验证**：worker 单测（fanout 幂等、channel delivery happy/transient/permanent、aggregate reconcile）、adapter contract test（mock HTTP）。

---

## Phase 4 — Deploy（mist-deploy）

镜像 AGENTS.md「加新 service 改动模式」6 处：
1. `docker/compose.yaml`：加 `mist-notification` service，镜像 `signal` 服务块——`command: ["node","-r","@opentelemetry/auto-instrumentations-node/register","dist/apps/notification/main.js"]`，env（`PORT:8006`、`OTEL_SERVICE_NAME:notification`、mysql_*、`MIST_REALTIME_REDIS_URL`、`NOTIFICATION_*` secrets、OTLP），`depends_on: mysql + mist-realtime-redis`，healthcheck 打 `GET /health`，`mist-network`。
2. `docker/.env.example`：`NOTIFICATION_QQ_BASE_URL/TOKEN`、`NOTIFICATION_WECHAT_WEBHOOK`、`NOTIFICATION_CHANNELS`。
3. `scripts/common/deploy-defaults.ps1`：默认值。
4. `scripts/deploy-docker-appliance.ps1`：`Get-DockerAppliancePaths` + `Initialize-DockerApplianceRoot`（建目录+Set-DockerEnvValue）+ 启动序列（`up -d` + `Wait-DockerComposeServiceHealthy`）。
5. `scripts/test-docker-compose-config.ps1`：`Assert-Contains` 断言（**CI 门禁**）。
6. `scripts/health-check-docker-appliance.ps1`：`Assert-DockerComposeServiceRunning`。
- `mist` 仓：`nest-cli.json` 加 `notification` project；`package.json` `build:docker` 末尾追加 `&& nest build notification`，加 `start:dev:notification`。

---

## Phase 5 — Monitoring（OTel，镜像 O1/O2a）

- `apps/notification/src/observability/delivery-metrics.ts`：`registerDeliveryMetrics(svc)`，`metrics.getMeter('mist-notification','0.1.0')`，observable gauges（pull 模式读 process-local 计数）：
  `mist_notification_delivered_total{channel}`、`mist_notification_failed_total{channel,reason}`、`mist_notification_attempt_total{channel}`、`mist_notification_dead_letter_total{channel}`、`mist_notification_queue_depth`。低基数 label，per-channel 不加 symbol。
- 从 notification module `onModuleInit()` 调用。
- 配判断点日志（info 生命周期 + warn 判断点，pinoTraceMixin trace_id，见 [[metrics-accompanied-by-logs]]）。

---

## Phase 6 — 测试矩阵

- **单元**：persist enqueue（created/duplicate/publish-throw）；fanout 幂等 + 不重复入队；channel delivery happy/transient-throw/permanent-nothrow；aggregate reconcile（全 sent/部分/全 dead-letter）；adapter contract（mock fetch，timeout，redact）；replay 只重入 failed。
- **集成**（testcontainers mysql + ioredis-mock 或真 redis）：端到端 AlertEvent→queue→worker→2 channel→2 delivery 记录→aggregate DELIVERED；duplicate job 幂等；transient 5 次后 dead_lettered→FAILED。
- **contract**：受控 HTTP receiver（替身 NapCat/WeCom）验证 envelope shape + redact。

---

## Phase 7 — 验证 + HIL

- 基线：`pnpm typecheck`、`pnpm test:ci`（带 `--forceExit`）、`openspec validate deliver-strategy-notifications`、`git diff --check`。
- 受影响仓：mist（build+test）、mist-deploy（`test-docker-compose-config.ps1`）、mist-monitoring（指标）。
- Shadow/dry-run：`NOTIFICATION_CHANNELS=` 空或接受控 receiver，验证 fan-out/幂等/writeback，**不触真渠道**。
- HIL（5.3）：凭据脱敏，真 WeCom webhook + NapCat，验证 success/failure/restart；失败关 notifier 不回滚策略。
- 归档前：核对 living spec 无 schedule-scan-owner 残留；stable Purpose 已对齐。

---

## 顺序建议（worktree）

1. Phase 1（migration+entity+enum）→ 2. 2（contract+producer 注入）→ 这两步可先合，producer 入队后队列空跑（无 consumer）。
2. Phase 3（worker+adapter，先接受控 receiver）。
3. Phase 5（metrics）+ Phase 6 测试。
4. Phase 4 deploy（最后，连同 HIL）。

---

## 来自代码审计的 11 个 mirror 陷阱（落地必看）

1. BullMQ `prefix` **必须**在 `@Processor` 显式重复，不继承 forRootAsync（错→静默路由到 `bull` 默认 prefix）。
2. consumer 端 `extraOptions:{manualRegistration:true}` + `maxRetriesPerRequest:null`（BullMQ 强制）；producer 端 `maxRetriesPerRequest:1` + 不加 manualRegistration。
3. `parseRedisConnectionUrl` 复用 `libs/realtime`，别重写。
4. OTel 全靠 `-r .../register` preload + `OTEL_*` env，main.ts 不碰 SDK。
5. webpack externals（`@opentelemetry/api`/`pino`/`talib`）repo 级生效，别覆盖。
6. 无全局 entity registry——每 app forRootAsync 自列，新 entity 加到 index.ts + 各消费 app。
7. `nest-cli.json` 的 `libs/otel` 项目是**过期残留**（磁盘不存在），别依赖。
8. persist() 当前只返回 outcome 字符串，**需捕获 savedAlert.id** 才能入队。
9. 无 ValidationPipe/CORS 惯例，别引入全局 pipe。
10. migration 要求 idempotent + 文档化 preflight + audit SQL（README 约定）。
11. healthcheck 解析 JSON 验 `instance`+mode 字段，notification health 要同 shape `{status:'ok',instance:'notification'}` @ `GET /health`。
