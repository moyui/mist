# design: remediate-alert-delivery-integrity

## 1. M1 — O3 独立指标 `mist_oo_alert_total`

**现状**：`OoAlertDeliveryWorker` 复用 `NotificationDeliveryCounters` →
`mist_notification_*` gauge（描述 "strategy alert"），O3 与策略语义混同；spec tasks 2.8
承诺的 `mist_oo_alert_total` 未实现。

**设计**：

- 新 `OoAlertDeliveryCounters`（`apps/notification/src/oo-alert/oo-alert-delivery-counters.ts`），
  结构与 `NotificationDeliveryCounters` 同构（`recordSent/recordFailure` + `snapshot`），
  per-channel label 低基数。**不**复刻 dead-letter（O3 无子表概念，permanent 即 failure）。
- 新注册函数 `registerOoAlertMetrics`（`apps/notification/src/observability/oo-alert-metrics.ts`）：
  `mist_oo_alert_total` observable gauge，`status=sent|failed` + `channel` label。
  `OoAlertDeliveryWorker` 注入计数器并替换 `NotificationDeliveryCounters` 的调用。
- 与策略指标完全隔离；`mist_notification_*` 恢复纯策略语义（描述不变）。
- 配套日志保持（sendChannel 已有 warn/error）。

## 2. M2 — PENDING 恢复 sweep

**现状**：`live-strategy-persistence.service.ts:70` 注释声称 "later reconciliation sweep"
不存在；enqueue 失败（Redis 断）→ 事件永久 PENDING。

**设计**：

- 新 `PendingAlertDeliverySweepService`（`apps/notification/src/delivery/pending-alert-delivery-sweep.service.ts`）：
  - `@Interval(PENDING_SWEEP_INTERVAL_MS = 60_000)` 每 60s 跑一轮 `sweep()`
    —— 用 `@nestjs/schedule`（**依赖已有 ^5.0.1，与 Nest 10 兼容**，Novu 同款方案；
    进程内调度，不依赖 Redis——Redis 断时 sweep 照跑，恢复后下轮补投）。
  - ⚠️ `@Interval` 装饰器不等待异步完成 → sweep 内部加防重入
    `private running = false`（`if (this.running) return; try { ... } finally { this.running = false }`）。
  - 判据（TypeORM 查询）：`status = PENDING` AND `createdAt <= now - 5min` AND
    **无任何 `strategy_alert_deliveries` 行**（LEFT JOIN + IS NULL）。
  - 命中 → `queue.enqueueFanout(alertEventId)`（fanout jobId 确定性去重，天然幂等）。
  - 每轮每事件最多一次入队；下轮该事件已有 delivery 行（fanout 已建）→ 跳过。
  - 排除：`createdAt < 5min`（正常在途）、有 delivery 行（fanout 已处理 / replay
    重置的 PENDING——replay 场景有 FAILED 行，不扫 ✓）。
  - 指标 `mist_notification_sweep_recovered_total`（gauge，无 label）+ 每轮 recovered>0
    时 info 日志（metrics-accompanied-by-logs）。
- `ScheduleModule.forRoot()` 加入 `NotificationAppModule` imports（@nestjs/schedule 启用）。
- 常量 `PENDING_SWEEP_INTERVAL_MS`/`PENDING_SWEEP_STALENESS_MS` 放
  `strategy-alert-delivery.constants`（notification 本地，如 O3 先例）。
- 注册：`NotificationDeliveryModule.providers`。sweep 只读 DB + enqueue，无状态。

**边界**：事件在 5min 内正常投递完成（SENT）→ 不扫；投递链整体挂（worker 死）→
sweep 每轮重复 enqueue 但 jobId 去重 → 无堆积副作用，worker 恢复后一次处理。

## 3. M3 — fanout 精确吞错

**现状**：`alert-fanout.service.ts:73` `catch { // unique-constraint race }` 吞所有错误。

**设计**：

- 共享 util `isUniqueConstraintViolation(error, constraintName)`（
  `libs/shared-data/src/utils/mysql-unique-conflict.util.ts`）——迁移
  `live-strategy-persistence.service.ts` 的 `isNamedAlertDedupeConflict` 逻辑为参数化版本
  （`ER_DUP_ENTRY` + errno 1062 + `for key '...'` 精确匹配）。
- `alert-fanout.service`：`catch (error) { if (!isUniqueConstraintViolation(error, 'uq_strategy_alert_deliveries_event_channel')) { logger.error(...); throw error; } }`
- signal 侧 `isNamedAlertDedupeConflict` 改走共享 util（约束名
  `uq_strategy_alert_events_dedupe_key`），删除本地实现（防双源分叉，指南 §1）。

## 4. L1 — receiver ts 缺失拒绝

`oo-alert-receiver.controller.ts`：`ts` 非 string → `logger.warn('oo alert payload missing ts')`
+ `return { accepted: false }`（与 `alertName` 对称）。不再补当前时间。
（OO 模板 `{alert_start_time}` 恒渲染 ISO；缺失 = 模板契约漂移，应暴露而非掩盖。）

## 5. L2 — StrategyAlertEventVo

- 新 `apps/mist/src/strategy/vo/strategy-alert-event.vo.ts`：
  `StrategyAlertEventVo`（id / strategySignalId / status / dedupeKey / cooldownUntil /
  deliveryResult / acknowledgedAt / createdAt / updatedAt，显式 nullable 声明）+ 静态
  `fromEntity(entity): StrategyAlertEventVo`。
- `StrategyAlertEventService`：findAll / markDelivered / markFailed / acknowledge 返回
  `StrategyAlertEventVo[] | StrategyAlertEventVo`。
- `StrategyAlertEventController`：`@ApiOkResponse({ type: ... })`（Swagger metadata 到
  VO，entity 不进公共契约）。

## 6. L3 — replay 路径对齐 `/internal/`（不加 token，用户拍板）

**现状**：`POST /v1/notification/replay/:alertEventId` 用对外路径风格（`v1/`），
但该接口只在容器网络内可达（notification 无 host 端口映射），与项目内部写接口惯例
（`/internal/*`，如 `/internal/oo-alert-receiver`、退役诊断端点）不一致。

**设计**：

- 路径改为 `POST /internal/notification/replay/:alertEventId`（`NotificationAdminController`
  `@Controller('internal/notification')`）。
- 无消费者（mist-fe 无调用、无外部调用方），纯内部契约改名安全。
- 注释明确边界：容器网络内访问，网络隔离即防线（与退役诊断端点同模式）。
- **不加** `NOTIFICATION_ADMIN_TOKEN`/guard——用户拍板：为一个内网运维接口引入
  secret 生命周期管理性价比低。

## 7. L4 — severity 契约锁定

**结论**：`{alert_level}` 模板变量对单层 alert（无 warning_threshold）渲染为空
（alert.rs T-5 注释），payload 无法可靠携带 severity → **severity 映射保留 receiver
侧**，改为契约锁定：

- `sync-oo-alerts.ps1` apply 前校验：每条 rule `name` 匹配 `^A[1-6]_(?:\w+)$` 且
  `severity` 与 `SEVERITY_BY_PREFIX` 映射（A1/A2→P0、A3/A4→P1、A5/A6→P2）一致，不符
  throw（CI 与手动运行都拦截）。
- `test-docker-compose-config.ps1`：断言 rules.json 每条的映射（PS 侧读 JSON 校验）。
- receiver 单测：`SEVERITY_BY_PREFIX` 全 6 键覆盖断言（防新增规则忘映射）。
- `SEVERITY_BY_PREFIX` 提取到 `oo-alert.constants.ts`（与 receiver 同目录共享测试）。

## 8. L5 — queue 深度双队列

- `OoAlertQueueService` 加 `snapshotCounts()`（getJobCounts waiting/active/delayed，同
  策略实现）。
- `QueueDepthSnapshot` 扩展 `queue: 'strategy' | 'oo_alert'`；`registerDeliveryMetrics`
  gauge 加 `queue` label；`NotificationMetricsBootstrap` 注入两个 queue service，每轮
  各采样一次。
- `mist_notification_queue_depth{queue=...,state=...}` —— 向下兼容（新增 label 维度，
  旧查询按 queue 过滤）。

## 9. 函数名两侧对齐（用户指出的问题）

自查结论（2026-08-13）：两侧结构总体对齐（worker `process→dispatch→run`、
`enqueue*` 系列、`build*Envelope`、`record*` 计数、`markDelivered/markFailed/acknowledge`
公共动词）；以下 4 处不对称，本 change 统一：

| 现名 | 对齐后 | 理由 |
|------|--------|------|
| `AlertChannelDeliveryService.markDelivery`（私有） | `updateDeliveryStatus` | 与公共 `markDelivered/markFailed` 的"具体结果动词"区分，消除现在时/过去时混淆 |
| `OoAlertQueueService.enqueue` | `enqueueAlert` | 与策略 `enqueueFanout/enqueueChannel/enqueueChannelReplay` 对齐 `enqueue + 宾语` 动词模式 |
| O3 worker `String(adapter.channel)` | `channelLabel(channel)` | 与策略侧显式桥 `toNotificationChannel` 对称（类型安全、可测） |
| `isNamedAlertDedupeConflict`（signal 本地） | 共享 `isUniqueConstraintViolation(error, constraint)` | 消除双源实现（指南 §1） |

保留（有理由）：port `publish`（跨 app 抽象语义，非 queue 层动词）、receiver `receive`、
`sweep()`（周期任务动词，与 job 处理器 `run()` 区分）、`buildInfraEnvelope` 返回
`ChannelMessage`（O3 信封语义，spec 批准）。

## 10. 测试与验证

| 项 | 用例 |
|----|------|
| M1 | `oo-alert-delivery.worker.spec`：计数器替换后 sent/failed 记录到新计数器；`mist_oo_alert_total` 注册（gauge 存在性 mock） |
| M2 | `pending-alert-delivery-sweep.service.spec`：PENDING+超龄+无行→enqueue；有行→跳过；<5min→跳过；replay 场景（有 FAILED 行）→跳过 |
| M3 | fanout：非 dup 错误抛 + 记日志；dup 错误吞；signal 侧 dedupe 冲突识别仍绿（迁移 util 后） |
| L1 | receiver spec：ts 缺失 → accepted:false + 不补时间 |
| L2 | service/controller spec：返回 Vo 形状 |
| L3 | guard spec：无 token 401；带 token 200；未配置 env 401 |
| L4 | receiver spec：SEVERITY_BY_PREFIX 全表断言；deploy 侧 test-*.ps1 断言 |
| L5 | bootstrap/mock 断言双 queue 采样 |

门禁：`lint:check` / `typecheck` / `env TZ=UTC test:ci` / `openspec validate --all --strict`
/ mist-deploy `test-docker-compose-config.ps1`。生产验证：部署后 OO 查询
`mist_oo_alert_total` 有值（或 O3 触发时）；sweep 行为用 mock/故障注入验证（Redis 断
→ 事件 PENDING → 恢复后 sweep 补投）。

## 11. 发布与回滚

- 原子发布：mist（backend/notification/signal 镜像）+ mist-deploy（compose env）同批。
- 无 migration；指标为新增；`mist_notification_*` 语义不变（旧查询兼容）。
- 回滚：镜像级（replay 路径改为 `/internal/`，无消费者，纯内部契约）。
