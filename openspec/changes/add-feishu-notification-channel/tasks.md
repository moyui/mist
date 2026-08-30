# Tasks: Add Feishu notification channel

## 1. OpenSpec change and contract alignment — 2/2

- [x] 1.1 Author `proposal.md` / `design.md` / `specs/strategy-notification-delivery/spec.md` delta so Feishu joins `qq/wechat` as a first-class `NotificationChannel` with channel-isolated retry/dead-letter/replay and direct SDK invocation (parity with existing channels).
- [x] 1.2 Run `openspec validate add-feishu-notification-channel --strict` and fix until green before code.

## 2. Domain model and persistence (governance §6.7 / §10.1 DB) — 2/2

- [x] 2.1 Extend `libs/shared-data/src/enums/notification-channel.enum.ts` with `FEISHU='feishu'` and align `StrategyAlertDelivery.channel` TypeORM enum metadata (verify via `notification-entities.spec.ts`).
- [x] 2.2 Add forward-only migration `023_add_feishu_to_notification_channel.sql` to widen `strategy_alert_deliveries.channel` to `ENUM('qq','wechat','feishu')` and extend `notificationEnvSchema` + `scheduleEnvSchema` with `NOTIFICATION_FEISHU_WEBHOOK/SECRET` and `OO_ALERT_FEISHU_WEBHOOK/SECRET` (reuse `NOTIFICATION_HTTP_TIMEOUT_MS`, `allow('').default('')`).

## 3. Adapter and delivery wiring (no layer mixing, failure isolation) — 3/3

- [x] 3.1 Implement `apps/notification/src/channels/feishu.channel-adapter.ts` (`channel=FEISHU`, webhook + optional `timestamp\nsecret` HMAC-SHA256 signing, `msg_type:'text'` body, `AbortSignal.timeout`, `StatusCode/code` mapping to `sent`/`permanent_failure`/`transient_failure`, credential redaction) and `feishu.channel-adapter.spec.ts`.
- [x] 3.2 Wire `NotificationDeliveryModule` `CHANNEL_ADAPTERS` to include the Feishu adapter behind `NOTIFICATION_CHANNELS`, and add `OO_ALERT_FEISHU_ADAPTER` + worker fanout in `OoAlertModule` / `OoAlertDeliveryWorker` (channel-isolated `sendChannel`, countable).
- [x] 3.3 Extend `PreMarketInspectionService` to parallel-deliver the Markdown report to WeCom and Feishu via `OO_ALERT_*_WEBHOOK` (helper reuse, isolated failures, spec-covered).

## 4. Verification and release baseline — 2/2

- [x] 4.1 Run the host-reported verification surface (`lint:check`, `typecheck`, `test:ci`, `ci:contracts`, `build:docker`) and `openspec validate --all --strict` over affected repos; ensure rollback/repair-forward note matches ENUM widening compatibility (旧应用读新 ENUM 需整组发布或 repair-forward).
- [x] 4.2 [deploy HIL 2026-08-30] Proof that strategy `deliver.fanout -> deliver.channel` and OO `oo-alert-delivery` each fan out to `feishu` independently, with `permanent_failure` on missing webhook and `transient_failure` on rate-limit/timeout, and that no `ready`-scope drift or padding-zero regressions exist (governance §6.1/§6.5).
