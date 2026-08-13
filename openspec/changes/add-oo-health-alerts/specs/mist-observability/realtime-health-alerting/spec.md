## ADDED Requirements

### Requirement: Realtime health alerts detect link anomalies

OpenObserve SHALL run scheduled SQL alerts covering the realtime health
signals — data flow (snapshot accepted / candle sealed), connection (WS
clients / lifecycle events), subscription convergence, datasource liveness,
and reject/skip growth. Every alert SHALL fire via the OpenObserve webhook
destination into the backend alert receiver.

#### Scenario: Data flow stalls during a trading session

- **WHEN** `mist_datasource_snapshot_accepted_total` does not grow within the
  alert window during trading hours
- **THEN** an OpenObserve scheduled alert MUST fire
- **AND** the webhook MUST deliver the alert payload to the receiver endpoint

#### Scenario: WS connection drops

- **WHEN** `mist_datasource_ws_clients` drops to zero or a
  `realtime ws event=disconnected` log appears within the window
- **THEN** an alert MUST fire and be delivered via the webhook

### Requirement: Alert delivery uses a dedicated queue and channel adapters

The alert receiver SHALL enqueue accepted trading-session alerts to a
dedicated BullMQ queue (`oo-alert-delivery`, separate from the strategy
`strategy-alert-delivery` queue) so bursts are buffered and duplicate alerts
within the same window are de-duplicated. A worker SHALL consume the queue,
build a channel-neutral infra envelope, and send it through the channel
adapters: a dedicated WeCom adapter instance (own bot webhook) and the shared
QqChannelAdapter (enabled only when `NOTIFICATION_CHANNELS` includes qq).
Strategy-alert delivery internals (`AlertChannelDeliveryService`, per-channel
AlertEvent reconciliation) SHALL NOT be reused for infra alerts.

#### Scenario: Trading-session alert is enqueued and fanned out

- **WHEN** the receiver accepts a trading-session alert and the session check
  passes
- **THEN** it MUST enqueue a job to the `oo-alert-delivery` queue with a
  de-duplication job id and return accepted
- **AND** the worker MUST call the WeCom adapter and, when QQ is enabled,
  the QqChannelAdapter
- **AND** a send failure MUST go through BullMQ retry; a permanent failure
  MUST be logged and counted

### Requirement: Non-trading-session alerts are silenced

The receiver SHALL drop alerts that fire outside trading sessions (based on
`TimezoneService.isTradingDay` plus A-share session hours), so "no growth"
signals do not alarm after close.

#### Scenario: Alert fires after close

- **WHEN** an alert arrives while the current time is not within a trading
  session
- **THEN** the receiver MUST discard it silently (info log)

### Requirement: Alert rules are reproducible

Alert rule definitions SHALL live in a configuration file in mist-deploy and
be applied to OpenObserve via an idempotent sync script after OpenObserve is
healthy, so rules survive OpenObserve container recreation.

#### Scenario: OpenObserve is recreated

- **WHEN** OpenObserve is recreated and loses its alert configuration
- **THEN** the sync script MUST recreate the destination and all six alert
  rules idempotently
