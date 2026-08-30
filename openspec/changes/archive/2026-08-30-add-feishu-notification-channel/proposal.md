# Change: Add Feishu notification channel (webhook parity with QQ/WeChat)

## Why
Strategy alerts and OO health alerts currently fan out to `qq` / `wechat` only. With the user's request to handle Feishu webhook capability at parity, the notification delivery lane must add a new `feishu` channel so that both the strategy `deliver.fanout -> deliver.channel` path and the OO `oo-alert-delivery` path can deliver to Feishu without coupling to AstrBot/mist-skills.

## What Changes
- Extend `NotificationChannel` with `FEISHU='feishu'` and align `strategy_alert_deliveries.channel` ENUM.
- Add a Feishu group custom-bot webhook adapter for `https://open.feishu.cn/open-apis/bot/v2/hook/{token}` with optional `*_SECRET` HMAC-SHA256 signing (`timestamp\nsecret` -> base64), `POST {msg_type:'text', content:{text}}` and bounded result mapping (`sent` / `transient_failure` / `permanent_failure`).
- Wire the adapter into both lanes: strategy `CHANNEL_ADAPTERS` fanout (driven by `NOTIFICATION_CHANNELS`) and OO dedicated `OO_ALERT_FEISHU_ADAPTER`; extend pre-market inspection Markdown report to parallel-deliver to Feishu.
- Extend env schemas: `NOTIFICATION_FEISHU_WEBHOOK/SECRET` (notification app) and `OO_ALERT_FEISHU_WEBHOOK/SECRET` (+ schedule `scheduleEnvSchema` for inspection), with empty-default and HTTP timeout reuse.
- Add forward-only migration `023` to extend the `channel` ENUM; keep `(alert_event, channel)` uniqueness and `isUniqueConstraintViolation` convergence unchanged.

## Non-Goals
- Feishu interactive cards / rich blocks (text parity with WeCom only).
- Routing through AstrBot or mist-skills; token-mode Feishu app robot (tenant_access_token) is out of scope.
- Changing BullMQ topology, retry budget, or delivery table shape beyond ENUM extension.
