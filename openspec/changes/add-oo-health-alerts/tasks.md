# Tasks: add-oo-health-alerts

> 状态约定：三步工作流——spec 确认 → 实施计划（代码级）→ 落地，每步断开。
> 决策记录见 proposal.md（D1-D5 + 渠道配置）。

## 1. libs/timezone session 提取（mist 仓）

- [ ] 1.1 `libs/timezone/src/trading-session.util.ts`：A 股时段判定
      （09:30-11:31 / 13:00-15:01，half-open）+ `isInTradingHours(date)`。
- [ ] 1.2 `candle-bucket.util.ts` 改为引用共享常量（避免双源）。
- [ ] 1.3 单测：09:30/11:30/13:00/15:00 边界、午休、盘后/周末。

## 2. Receiver + queue + worker（apps/notification，mist 仓）

- [ ] 2.1 `oo-alert/oo-alert.constants.ts`：`OO_ALERT_QUEUE_NAME`/`BULLMQ_PREFIX`/
      `JOB_TIMEOUT_MS`/`WORKER_CONCURRENCY`/`OO_ALERT_JOB` + `OoAlertJobV1`
      （本地常量，不进 @app/signal 策略契约）。
- [ ] 2.2 `oo-alert-queue.service.ts`（producer）：`new Queue(OO_ALERT_QUEUE_NAME,
      {connection: parseRedisConnectionUrl(MIST_REALTIME_REDIS_URL), prefix})` +
      OnModuleDestroy + `enqueue(job)`（**jobId=`alertName:windowStart` 去重**，
      attempts 3 指数退避）。
- [ ] 2.3 `oo-alert-receiver.controller.ts`：`POST /internal/oo-alert-receiver`
      token 认证（`X-Oo-Alert-Token`）+ parse + `isTradingSession`
      （TimezoneService + session）→ 非交易丢弃（info）/交易 `queue.add` → 202。
- [ ] 2.4 `oo-alert-delivery.worker.ts`（镜像策略 worker）：job → `buildInfraEnvelope`
      → 独立 WeCom 实例（`OO_ALERT_WECHAT_WEBHOOK`）+ 直接注入 `QqChannelAdapter`
      （读 `NOTIFICATION_CHANNELS` 判断）；throw 走 retry；permanent 计数。
- [ ] 2.5 `infra-alert.envelope.ts`：`buildInfraEnvelope(job): NotificationEnvelope`
      （channel-neutral，复用 notification-envelope 类型）。
- [ ] 2.6 `WeComChannelAdapter` 构造加默认参数 `webhookEnvName =
      'NOTIFICATION_WECHAT_WEBHOOK'`（策略不变；O3 传 `OO_ALERT_WECHAT_WEBHOOK`）。
- [ ] 2.7 module：`BullModule.registerQueue({name: OO_ALERT_QUEUE_NAME})` +
      controller/queue/worker/adapter 注册（notification-app.module 或新
      oo-alert.module）+ `TimezoneModule` import。
- [ ] 2.8 计数：`mist_oo_alert_total`（sent/failed，低基数）。
- [ ] 2.9 单测：receiver（token/过滤/入队/jobId 去重）、worker（envelope/throw/
      permanent/QQ 未启用只发 WeCom）、adapter env 注入。

## 3. 配置（mist 仓）

- [ ] 3.1 `libs/config/src/validation.schema.ts`：`OO_ALERT_RECEIVER_TOKEN`（必填）、
      `OO_ALERT_WECHAT_WEBHOOK`（可选）。
- [ ] 3.2 `.env.example` 占位（git 零凭据，G2 惯例）。

## 4. OO alert 规则 + sync（mist-deploy）

- [ ] 4.1 `oo-alerts/rules.json`：6 项（A1-A6）SQL/窗口/condition（design §2 草案
      对齐 OO scheduled-alert 语法；A1/A4 落地探 OO 能力，备选 age-based）。
- [ ] 4.2 `oo-alerts/destinations.json`：webhook destination（receiver URL +
      `X-Oo-Alert-Token` header）。
- [ ] 4.3 确认 OO alert 创建 API 路径（之前 `/api/default/alerts` 404——per-stream
      或方法差异，落地时核实）。
- [ ] 4.4 `scripts/sync-oo-alerts.ps1`：幂等创建/更新 destination + 6 alert
      （openobserve healthy 后运行；OO API 认证读 .env `OO_ROOT_USER_PASSWORD`）。
- [ ] 4.5 部署接入：deploy workflow 或 compose init 调 sync-oo-alerts.ps1。
- [ ] 4.6 规则文件 + 脚本的 CI 门禁（test-*.ps1 断言）。
- [ ] 4.7 渠道配置：.env 加 `OO_ALERT_WECHAT_WEBHOOK` + `OO_ALERT_RECEIVER_TOKEN`
      （部署脚本/secret 注入）；QQ 复用 `NOTIFICATION_QQ_*`。

## 5. 部署与验证

- [ ] 5.1 部署（mist tag + deploy；**docker_root=F:\MistDocker**）。
- [ ] 5.2 sync-oo-alerts.ps1 灌 OO（6 alert + destination）。
- [ ] 5.3 生产验证：OO alert 列表 6 项；交易时段注入断流（临时停 TDX 推送或 mock）
      → alert 触发 → 微信/QQ 收到；非交易时段触发被静默丢弃。
- [ ] 5.4 OO alert 规则重建验证：删 alert → sync-oo-alerts.ps1 重灌 → 恢复。
- [ ] 5.5 阈值/窗口按实盘误报调优（规则文件一处改 + 重灌）。

## 6. 收尾

- [ ] 6.1 全量验证基线（mist typecheck/lint/test:ci/coverage；deploy gate）。
- [ ] 6.2 勾 tasks + 归档（--skip-specs）。

## 7. 提交（三步工作流）

- [ ] 7.1 spec 确认通过后写实施计划（代码级）——已完成（implementation-plan.md）。
- [ ] 7.2 实施计划确认后落地。
- [ ] 7.3 归档。
