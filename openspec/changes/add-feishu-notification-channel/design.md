# Design: Feishu webhook channel parity with QQ/WeChat

## Context
Notification delivery is `AlertEvent(dev) -> strategy_alert_delivery(BullMQ + MySQL)` for strategy alerts, and `OO alert -> oo_alert_delivery(BullMQ)` for infra alerts. WeCom (`wechat`) and QQ each expose a `ChannelAdapter { channel, send(ChannelMessage)->ChannelSendResult }` that fans out via BullMQ. Requirement scales to Feishu while preserving bounded failure, idempotency, and open-spec gate discipline (project-quality-governance-guide §4-§6).

## Decisions

### D1 Feishu access shape: group custom-bot webhook, not app token
- Webhook: `https://open.feishu.cn/open-apis/bot/v2/hook/{token}` with optional `*_SECRET` signature (`timestamp` + `"\n" + secret` -> HMAC-SHA256 -> base64, sent as `timestamp` + `sign` fields).
- Rationale: parity with WeCom webhook, minimal permission surface, no tenant token lifecycle. App robot (app_id/app_secret) deferred.

### D2 Single adapter, two env bindings
- One class `FeishuChannelAdapter(channel=FEISHU)` parameterized by `webhookEnvName`/`secretEnvName` (like `WeComChannelAdapter(webhookEnvName)`).
- Strategy lane binds `NOTIFICATION_FEISHU_WEBHOOK/_SECRET`; OO lane binds `OO_ALERT_FEISHU_WEBHOOK/_SECRET` via `OO_ALERT_FEISHU_ADAPTER` symbol.

### D3 Wire contract and failure taxonomy
- Request body: `{ msg_type: 'text', content: { text } }` plus `timestamp`/`sign` when secret is configured.
- Response: `{ StatusCode, code, msg, data? }` where `StatusCode===0` or `code===0` means `sent`; `19024/19021/230002` (invalid token/timestamp/signature) => `permanent_failure`; others including `19030` rate-limit => `transient_failure` (BullMQ retries -> dead-letter). Network/timeout => `transient_failure`. Credentials never logged.

### D4 Persistence and concurrency
- Extend TypeScript `NotificationChannel.FEISHU='feishu'` and align MySQL `strategy_alert_deliveries.channel` ENUM to `('qq','wechat','feishu')` via forward-only `023` migration. Keep `uq_strategy_alert_deliveries_event_channel` and `isUniqueConstraintViolation` fanout convergence; no FK/index change.
- `NOTIFICATION_CHANNELS` comma set continues to drive strategy fanout; unconfigured channel is silently excluded (not dead-lettered). Missing webhook at send time => `permanent_failure`.

### D5 OO lane and pre-market inspection
- OO `OoAlertDeliveryWorker` adds optional Feishu fanout alongside WeCom+QQ (each `sendChannel` failure isolated, counted, not blocking other channels).
- `PreMarketInspectionService` parallel-delivers Markdown report to WeCom **and** Feishu (separate `OO_ALERT_*_WEBHOOK` lookups, shared helper, no cross-channel fallback).

## Data flow

```
producer -> wire -> decoder -> state/persistence -> consumer -> deploy/monitoring
strategy: SignalRuntime -> BullMQ fanout(AlertEvent) -> fanout service -> strategy_alert_deliveries(event×feishu)+deliver.channel job -> AlertChannelDeliveryService -> FeishuChannelAdapter -> open.feishu.cn
OO:       OO rule -> Receiver(Token) -> BullMQ oo-alert-delivery -> OoAlertDeliveryWorker -> WeCom+QQ+Feishu adapters (isolated)
inspect:  schedule 09:05 runInspection -> buildMarkdownReport -> deliverWechatReport + deliverFeishuReport (parallel)
```

## Risks / Trade-offs
- Feishu signature clock skew (<1h) may cause permanent-looking failures; treated as retryable category only if service returns transient code, otherwise surfaced via `last_error`.
- No card rendering: first iteration stays `text` to keep envelope parity and avoid template drift.

## Alternatives considered
- Unified webhook secret store / card builder: rejected for iteration 1 to keep adapter parity and bounded scope.
- Token-mode Feishu app: more powerful but requires token refresh lifecycle; deferred.

## Open Questions
- None for iteration 1; card/interactive support and app-token mode tracked as follow-ups.
