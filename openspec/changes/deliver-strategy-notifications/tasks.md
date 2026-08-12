## 1. 后置启动门禁与现状审计

- [x] 1.1 确认 `run-realtime-strategy-evaluation` 已通过 shadow/on 集成门禁并真实产生可消费的 PENDING
  AlertEvent，Signal/context evidence shape 已由 HIL 固定，且项目负责人明确恢复本 change。
  ——2026-08-07 三条件全部满足（on-HIL PASSED，strategy_signals=2，evidence shape 固定，owner 恢复）。
- [x] 1.2 重新审计 AlertEvent/Signal schema、delivery APIs、stable specs、真实 producer evidence、部署状态。
  ——2026-08-12 审计完成：AlertEvent entity/table/producer 均在且 stable；producer 在 apps/signal
  `LiveStrategyPersistenceService`，被 `REALTIME_STRATEGY_MODE=on` 门控；生产盘中实证产出真实 PENDING
  事件（16 条积压）；delivery API 在 apps/mist（delivered/failed/ack，无 FSM guard、无 claim 端点）；
  BullMQ 已铺好（strategy-trigger queue），单 Redis 同时供 market-data+BullMQ；apps/schedule 是
  market-data collector 且未部署；stable capability 已被 `8554702` 改写，schedule-scan-owner 表述已不存在。
- [x] 1.3 建立 AlertEvent → enqueue → BullMQ claim → channel adapter → per-channel result →
  monitoring/deploy 影响链。

## 2. 渠道与消费语义逐项评审门禁

- [x] 2.1 首批渠道评审：企业微信 webhook（V1 启用）+ QQ via NapCat OneBot（adapter 已写，默认不启用，
  待 NapCat 迁 Windows 机后启用）。QQ 官方 bot 排除（2025-04 主动消息能力下线，告警无触发主动推送不兼容）。——owner 2026-08-12 拍板。
- [x] 2.2 消费模型评审：BullMQ sibling queue `strategy-alert-delivery`，复用现有 Redis；outbox 作后续
  可选强化，不在首批。——owner 2026-08-12 拍板（参考 Novu/Svix/outbox OSS 惯例）。
- [x] 2.3 可靠性语义评审：at-least-once + dedupeKey/jobId 幂等 + 5 次指数退避 + dead-letter + 人工
  重放；不承诺 exactly-once。最终数值留实施计划。——owner 2026-08-12 拍板。
- [x] 2.4 schema 评审：拆表——migration 018 + 独立 delivery 记录表承载 per-channel fan-out；AlertEvent
  主状态复用现有枚举表达聚合结果。——owner 2026-08-12 拍板。
- [x] 2.5 部署形态评审：独立 app `apps/notification`，复用 image + command 切换，参照 signal service
  block；per-channel secrets 经部署边界注入。——owner 2026-08-12 拍板。
- [x] 2.6 将全部接受结论写回 design/specs：REMOVED delta 因 `8554702` 已改目标 body 而 drop，仅保留
  ADDED proactive-delivery requirement；astrbot-integration spec 不碰（direct SDK 绕过 AstrBot）。
  ——owner 2026-08-12 拍板。

## 3. Notification Core 与 Adapter

- [x] 3.1 实现 BullMQ `strategy-alert-delivery` queue 注册（producer 在 apps/signal 入队，worker 在
  apps/notification 消费）+ channel-neutral envelope + 模板 contract。
- [x] 3.2 实现 QQ 与微信 channel adapter（直接对接 SDK/协议，不经 AstrBot）、超时、redacted logging、
  contract tests。
- [x] 3.3 实现 migration 018 + delivery 记录表持久化 per-channel 结果；AlertEvent 聚合状态更新；
  operator acknowledgement 保持独立。
- [x] 3.4 实现 at-least-once 幂等（jobId=alertEventId:channel）、有界重试/backoff、dead-letter、人工重放端点
  （`POST /v1/notification/replay/:alertEventId`，reset delivery 行后重入 fresh job）。
- [x] 3.5 实现 duplicate/partial-failure/reconciliation/idempotent 单测（43/43 过）；crash/restart 进程级
  验证留集成/HIL（需真 BullMQ）。

## 4. 部署与监控

- [ ] 4.1 实现 `apps/notification` Compose service（复用 image + command）、queue env、per-channel
  secrets、healthcheck、startup/rollback。
- [x] 4.2 增加 notification per-channel-result/dead-letter/attempt 低基数 monitoring（OTel observable
  gauge：mist_notification_{delivered,failed,dead_letter,attempt}_total{channel}；queue depth/latency 需
  async BullMQ 轮询，留后续）。
- [ ] 4.3 证明 notification failure 不改变 strategy persistence、candle 或 transport health。

## 5. 验证与真实渠道 HIL

- [ ] 5.1 运行受影响仓库完整基线、真实 MySQL/queue、strict OpenSpec validate 和 `git diff --check`；
  检索 active change 与 living spec，确认 schedule-scan-owner 语义不再生效。
- [ ] 5.2 使用受控测试接收端验证 dry-run/shadow、fan-out、duplicate 与 per-channel result writeback。
- [ ] 5.3 在凭据脱敏条件下完成首批真实渠道（QQ/微信）success/failure/restart HIL。
- [ ] 5.4 向项目负责人逐项审阅 HIL、retry/partial-failure、rollback evidence，以及 stable spec 同步
  结果后才归档。
