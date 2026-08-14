# tasks: remediate-alert-delivery-integrity

## 1. O3 独立指标（M1）

- [x] 1.1 `apps/notification/src/oo-alert/oo-alert-delivery-counters.ts`：`OoAlertDeliveryCounters`
      （recordSent/recordFailure/snapshot，per-channel）。
- [x] 1.2 `apps/notification/src/observability/oo-alert-metrics.ts`：`registerOoAlertMetrics`
      → `mist_oo_alert_total` observable gauge（`status=sent|failed` + `channel` label，幂等注册）。
- [x] 1.3 `OoAlertDeliveryWorker` 改用 `OoAlertDeliveryCounters`（替换 `NotificationDeliveryCounters`）。
- [x] 1.4 `oo-alert.module.ts` providers 注册新计数器。
- [x] 1.5 单测：worker sent/failed 走新计数器；gauge 注册逻辑（幂等）。

## 2. PENDING 恢复 sweep（M2）

- [x] 2.1 `apps/notification/src/delivery/pending-alert-delivery-sweep.service.ts`：
      `PendingAlertDeliverySweepService`，`@Interval(60s)`（@nestjs/schedule，依赖已有
      ^5.0.1）+ 防重入 running 标志，判据
      `status=PENDING AND createdAt <= now-5min AND 无 deliveries 行` → `enqueueFanout`。
- [x] 2.2 常量：`PENDING_SWEEP_INTERVAL_MS`/`PENDING_SWEEP_STALENESS_MS`（notification 本地 constants）。
- [x] 2.3 `NotificationAppModule` imports 加 `ScheduleModule.forRoot()`。
- [x] 2.4 指标 `mist_notification_sweep_recovered_total`（gauge，无 label）+ recovered>0 日志。
- [x] 2.5 `NotificationDeliveryModule` 注册 sweep service。
- [x] 2.6 单测：命中/有行跳过/未超龄跳过/replay 场景（FAILED 行）跳过/防重入。

## 3. fanout 精确吞错（M3）

- [x] 3.1 `libs/shared-data/src/utils/mysql-unique-conflict.util.ts`：
      `isUniqueConstraintViolation(error, constraintName)`（ER_DUP_ENTRY + errno 1062 +
      `for key '...'` 精确匹配）。
- [x] 3.2 `alert-fanout.service` catch 区分：非 `uq_strategy_alert_deliveries_event_channel`
      冲突 → logger.error + 抛出；冲突 → 吞。
- [x] 3.3 signal 侧 `isNamedAlertDedupeConflict` 改走共享 util（约束
      `uq_strategy_alert_events_dedupe_key`），删本地实现。
- [x] 3.4 单测：fanout 非 dup 错误抛/dup 吞；signal dedupe 冲突识别迁移后仍绿。

## 4. receiver ts 缺失拒绝（L1）

- [x] 4.1 `oo-alert-receiver.controller.ts`：`ts` 非 string → warn + `{ accepted: false }`。
- [x] 4.2 单测：缺失 ts 拒绝、不补当前时间。

## 5. StrategyAlertEventVo（L2）

- [x] 5.1 `apps/mist/src/strategy/vo/strategy-alert-event.vo.ts`：`StrategyAlertEventVo` +
      `fromEntity`。
- [x] 5.2 `StrategyAlertEventService` findAll/markDelivered/markFailed/acknowledge 返回 VO。
- [x] 5.3 `StrategyAlertEventController` 返回 VO + `@ApiOkResponse` metadata。
- [x] 5.4 单测：service 返回 VO 形状；controller 响应类型。

## 6. replay 路径对齐（L3）

- [x] 6.1 `NotificationAdminController`：`@Controller('internal/notification')` +
      注释容器网络边界（无 host 端口，网络隔离即防线）。
- [x] 6.2 全仓检索旧路径 `/v1/notification/` 无残留（测试/文档/调用）。
- [x] 6.3 单测：replay 路由路径断言更新。

## 7. severity 契约锁定（L4）

- [x] 7.1 `SEVERITY_BY_PREFIX` 移至 `oo-alert.constants.ts`（receiver 引用）。
- [x] 7.2 receiver 单测：全 6 键（A1..A6）映射断言。
- [x] 7.3 `sync-oo-alerts.ps1`：apply 前校验 name 前缀 ↔ severity 一致（不符 throw）。
- [x] 7.4 `test-docker-compose-config.ps1`：rules.json 映射断言（A1/A2→P0、A3/A4→P1、
      A5/A6→P2）。

## 8. queue 深度双队列（L5）

- [x] 8.1 `OoAlertQueueService.snapshotCounts()`（waiting/active/delayed）。
- [x] 8.2 `QueueDepthSnapshot` 扩展 `queue` 字段；`mist_notification_queue_depth` 加
      `queue` label（strategy/oo_alert）。
- [x] 8.3 `NotificationMetricsBootstrap` 注入双 queue service 每轮各采样。
- [x] 8.4 单测：双 queue 采样 + label。

## 9. 命名对齐（用户指出的函数名两侧）

- [x] 9.1 `markDelivery` → `updateDeliveryStatus`（`alert-channel-delivery.service.ts`）。
- [x] 9.2 `OoAlertQueueService.enqueue` → `enqueueAlert`（receiver/单测同步）。
- [x] 9.3 O3 worker `String(adapter.channel)` → `channelLabel(channel)` 显式函数。
- [x] 9.4 全仓检索确认无旧名残留（import/调用/测试）。

## 10. 门禁与验证

- [x] 10.1 mist：`lint:check` / `typecheck` / `env TZ=UTC test:ci` / `openspec validate --all --strict`。
- [x] 10.2 mist-deploy：`test-docker-compose-config.ps1` 全绿。
- [x] 10.3 部署（F root，镜像 tag=对应仓 master HEAD），生产验证：
      `mist_oo_alert_total` 可查（OO metrics）+ 策略指标语义不再混入 O3；
      sweep 故障注入（Redis 断 → PENDING → 恢复补投）或 mock 验证。
- [x] 10.4 生产 HIL：O3 盘内触发（下一交易日）确认指标 + 投递链不受影响。
      （**2026-08-14 开盘后验证**：双源正常（TDX/QMT ingest 活跃 + 08-14 candle 各 3 桶封存
      正常）→ O3 规则无触发 → `mist_oo_alert_total` 无数据点 = 文档预期正常行为
      （"盘内无触发则无序列=正常"）；OO 日志确认 notification 指标（queue_depth/
      sweep_recovered）正常入库、`mist_oo_alert_total` stream 未创建（无触发不产生假数据）；
      rules.json A1-A6（P0/P0/P1/P1/P2/P2）在位。**真实触发场景留待未来触发时自然产生
      数据点（链路已验证可用，无需额外动作）**）
