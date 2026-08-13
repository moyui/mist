# Notification Delivery — Runbook

`apps/notification` — 策略告警主动投递 worker（deliver-strategy-notifications）。从 BullMQ
`strategy-alert-delivery` 队列消费 PENDING AlertEvent，fan-out 到 WeCom（企业微信群机器人 webhook）
+ QQ（NapCat OneBot HTTP 私聊），per-channel 记录结果，聚合回写 AlertEvent 状态。

## 链路

```
apps/signal LiveStrategyPersistenceService.persist()  -- commit 后入队
  → deliver.fanout job (mist-bullmq:strategy-alert-delivery)
  → apps/notification worker
      ├ deliver.fanout  : 每渠道建 pending delivery 行 + 入 deliver.channel 子 job
      └ deliver.channel : 载入 Signal evidence → envelope → ChannelAdapter.send()
                           → 写 delivery 行 → reconcile AlertEvent 聚合态
```

## 健康 / 状态检查（在 mist-box 上）

```bash
# 容器健康
docker ps --filter name=mist-notification --format '{{.Status}}'   # 期望 (healthy)
docker exec mist-notification sh -lc 'wget -qO- http://127.0.0.1:8006/health'
#   → {"status":"ok","instance":"notification"}

# 配置（只看长度，不打印 secret）
docker exec mist-notification sh -lc 'printenv NOTIFICATION_CHANNELS NOTIFICATION_QQ_MESSAGE_TYPE; \
  echo webhook=$(printenv NOTIFICATION_WECHAT_WEBHOOK|wc -c) qqbase=$(printenv NOTIFICATION_QQ_BASE_URL|wc -c)'

# 队列深度（waiting/delayed 增长 = 积压）
docker exec mist-realtime-redis redis-cli LLEN mist-bullmq:strategy-alert-delivery:wait

# 投递结果分布
mysql ... -e "SELECT channel,status,COUNT(*) FROM strategy_alert_deliveries GROUP BY channel,status;"
```

## 指标（OpenObserve，meter=mist-notification）

- `mist_notification_delivered_total{channel}` — 成功投递（process-local）
- `mist_notification_failed_total{channel}` — 失败尝试
- `mist_notification_dead_letter_total{channel}` — 进死信（重试耗尽 / permanent）
- `mist_notification_attempt_total{channel}` — 总尝试数
- `mist_notification_queue_depth{state}` — 队列 waiting/active/delayed 深度

dead_letter 持续增长 = 渠道故障（webhook 失效 / NapCat 掉线）。

## Replay（重投失败/死信）

```bash
# 重投某 AlertEvent 的 failed/dead_lettered 渠道（不重跑策略）
docker exec mist-notification sh -lc \
  'wget -qO- --post-data="" http://127.0.0.1:8006/internal/notification/replay/<alertEventId>'
# endpoint 在 notification 容器内（V1 未挂 nginx 外部路由）；docker exec 可达。
```

## 渠道配置

- **WeCom**：GitHub secret `NOTIFICATION_WECHAT_WEBHOOK`（企业微信群机器人 webhook URL）→ deploy 写 .env。
- **QQ via NapCat**：secrets `NOTIFICATION_QQ_BASE_URL`（`http://napcat:<port>`，NapCat 容器须
  `docker network connect mist-docker-appliance_mist-network napcat`）、`NOTIFICATION_QQ_ACCESS_TOKEN`、
  `NOTIFICATION_QQ_TARGET`；deploy 输入 `notification_qq_message_type=private`。
- `NOTIFICATION_CHANNELS`（deploy 输入，默认 `wechat`）控制启用渠道；加 `qq` 即启用 QQ。
- **NapCat 注意**：用 `mlikiowa/napcat-docker`，OneBot **HTTP 服务器**（非 WebUI 6099），host `0.0.0.0`，
  消息格式 **array**；`:latest` 应 pin digest（防漂移）。

## 常见问题

| 症状 | 排查 |
|---|---|
| 容器 restart loop | `docker logs mist-notification` → 多为装配/boot bug（DI/migration/entity）；检查镜像 tag 是否正确（`git rev-parse origin/master` 取，别手抄）|
| 告警没到 | 先看 `strategy_alert_deliveries.status`（dead_lettered?）；dead_letter 看 `last_error`；WeCom errcode 93000/93001=webhook 失效，45009=限流；QQ retcode 非 0 看 NapCat 日志 |
| 队列积压 | `REALTIME_STRATEGY_MODE` 是否 on（producer 在 apps/signal）；notification worker 是否 healthy；Redis 是否通 |
| job 永远 wait 不消费 | worker 没注册——确认 `BullModule.forRootAsync` **没**用 `manualRegistration:true`（或手动 `registrar.register()`）；无 manualRegistration 则 onModuleInit 自动注册 |

## 关键约束（见 governance guide）

- AlertEvent 主表枚举不变（PENDING/DELIVERED/ACKED/FAILED）；per-channel 状态在 delivery 子表。
- at-least-once（不承诺 exactly-once）；幂等靠 `jobId=alertEventId:channel` + dedupeKey + unique(event×channel)。
- 不经 AstrBot/mist-skills；channel adapter 直连协议。
