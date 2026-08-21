# monitoring-health-alerts Specification

## Purpose
TBD - created by archiving change deliver-strategy-notifications. Update Purpose after archive.
## Requirements
### Requirement: Notification Health Shall Be Channel-Aware And Separate
Monitoring SHALL expose notification queue depth, consumption, claim, latency, per-channel delivery results,
and dead-letter count using bounded low-cardinality labels, and SHALL keep notification health separate from
strategy evaluation, candle, and transport health.

#### Scenario: A channel delivery fails
- **WHEN** the strategy event was committed successfully but a channel delivery fails
- **THEN** notification health MUST report the channel failure and any dead-letter growth
- **AND** strategy persistence health MUST remain successful

#### Scenario: Notification backlog grows
- **WHEN** the strategy-alert-delivery queue depth or dead-letter count rises
- **THEN** notification health MUST reflect it independently of realtime strategy evaluation health

### Requirement: Candle Foundation Health Shall Be Observable Separately
Monitoring SHALL expose bounded market Redis, open candle, due, finalizer, discard, lateness, grace, capacity
and recovery outcomes without changing transport readiness semantics.

#### Scenario: Candle finalization degrades
- **WHEN** Redis, due scanning or evidence validation fails
- **THEN** candle health MUST expose a low-cardinality degraded reason
- **AND** transport connectivity and bridge readiness MUST remain separately reported

#### Scenario: Finalization exceeds its hard horizon
- **WHEN** an exact frozen candle candidate cannot commit by `bucketEndMs + 60000ms`
- **THEN** candle health MUST expose `finalization_horizon_exceeded` separately from market-evidence discard
- **AND** bounded diagnostics MAY retain the candle identity while metric labels MUST NOT contain security
  identifiers

#### Scenario: Startup cannot recover a theoretical bucket
- **WHEN** an elapsed bucket has neither recoverable due nor terminal evidence after restart
- **THEN** monitoring MUST expose a bounded recovery-gap outcome without synthesizing a market discard
- **AND** `backend_restart_open_state_lost` MUST remain distinguishable from an unregistered recovery gap

#### Scenario: Current-day Redis retention is observed
- **WHEN** monitoring inspects market-owned candle state
- **THEN** it MUST distinguish current-day keys from expired prior-day state
- **AND** it MUST NOT report BullMQ result retention as candle retention
- **AND** prior-day market keys remaining past their Shanghai D+1 00:00 expiry MUST be reported as candle
  retention degradation

#### Scenario: Quantity profile validation is observed
- **WHEN** a provider value is rejected or candle promotion is blocked by an unproved quantity profile
- **THEN** monitoring MUST expose a low-cardinality source, field and reason outcome
- **AND** raw security identifiers or observed quantity values MUST remain in bounded diagnostics rather than
  metric labels
- **AND** transport readiness MUST remain distinct from quantity-profile readiness

#### Scenario: Candle capacity is observed in shadow mode
- **WHEN** candle productization is running in shadow
- **THEN** monitoring MUST expose low-cardinality global pending, maximum per-series pending, snapshot overflow,
  due/finalizer admission overflow, due lag, candidate count and maximum observed record bytes
- **AND** Redis observation MUST include used memory, AOF size and current-day market key growth separately from
  queue job-state observations
- **AND** any queue overflow, record-limit breach, hard-horizon breach or sustained unbounded growth MUST block
  promotion to `on`

### Requirement: Realtime Strategy Health Shall Be Separately Observable
Monitoring SHALL expose BullMQ trigger, context seam, warmup, window, missing/duplicate/conflict, bounded
unavailable, analysis, episode and persistence outcomes without changing transport, candle or notification health.

#### Scenario: Signal root health is collected
- **WHEN** monitoring queries internal raw `GET http://signal:8010/health`
- **THEN** it MUST strictly validate `status='ok'`, `instance='signal'`, `realtimeMode` and the scoped registry,
  marketData, queue and evaluation objects
- **AND** HTTP 200 MUST mean the Signal process is responsive rather than every realtime capability being ready
- **AND** monitoring MUST derive separate bounded capability metrics and alerts from nested state/outcome fields
- **AND** it MUST fail closed on invalid JSON, missing required fields, invalid enums, negative counts or retired
  unscoped readiness fields

#### Scenario: Signal is unavailable when monitoring starts
- **WHEN** the Signal container is absent, bootstrapping or unhealthy while the monitoring service starts
- **THEN** monitoring MUST still start without a Compose healthy dependency on Signal
- **AND** it MUST expose Signal unavailability separately from backend market and candle health
- **AND** it MUST NOT require Signal recovery before observing the rest of the appliance

#### Scenario: Signal health exposes process-local aggregates
- **WHEN** monitoring reads registry generation/counts, window/bar counts, Worker counters or active episode count
- **THEN** it MUST treat them as current-process values that reset on restart
- **AND** it MUST NOT label metrics by generation, definition, strategy, security, trigger time or failure detail
- **AND** it MUST NOT interpret process-local Worker counters as BullMQ waiting or retained-result depth

#### Scenario: Queue and Redis capacity are collected
- **WHEN** monitoring needs waiting/active/retained job depth, Redis used memory or AOF growth
- **THEN** it MUST use its separately bounded queue/Redis probe rather than require Signal `/health` to query them
- **AND** a failure of that probe MUST remain distinguishable from Signal root HTTP failure
- **AND** the probe MUST use only fixed queue keys plus bounded `INFO`/`CONFIG GET maxmemory-policy` reads
- **AND** it MUST NOT use `KEYS`, `SCAN`, wildcard keys or Redis write commands

#### Scenario: Signal window capacity evidence is collected
- **WHEN** shadow evidence is gathered for promotion
- **THEN** monitoring MUST correlate listener and group counts with raw/derived bar counts, heap high-water mark,
  growth and GC behavior without high-cardinality strategy or security labels
- **AND** evidence MUST distinguish stable listener-bound growth from continued unbounded growth
- **AND** it MUST expose consumer-removal and trading-day cleanup outcomes plus memory-pressure process restarts
- **AND** it MUST NOT claim a configured aggregate memory budget, numeric bar cap or automatic capacity recovery
- **AND** process start time MAY be used to correlate restarts but MUST NOT infer memory pressure as the cause without
  matching runtime evidence

#### Scenario: Strategy evaluation is degraded
- **WHEN** market transport and candle sealing remain healthy
- **THEN** strategy health MUST report its own bounded reason
- **AND** upstream health MUST remain unchanged

#### Scenario: Evaluation is unavailable
- **WHEN** realtime evaluation returns `status='unavailable'` with `insufficient_history` or `field_unavailable`
- **THEN** monitoring MUST aggregate the bounded reason
- **AND** security, field path, bar counts, timestamps and provenance MUST NOT become metric labels

#### Scenario: BullMQ trigger handoff is observed
- **WHEN** realtime queue integration is enabled
- **THEN** monitoring MUST expose waiting, active, completed and failed job-state outcomes with bounded metric
  dimensions
- **AND** it MUST expose the latest startup-compensation outcome separately from live enqueue failures
- **AND** logical queue health MUST remain separate from candle sealing health
- **AND** dependency health MUST identify that both owners share one Redis failure domain
- **AND** it MUST NOT describe best-effort same-day compensation as complete reconciliation or delivery
  consistency

#### Scenario: Waiting backlog grows
- **WHEN** the signal worker drains more slowly than the producer submits
- **THEN** monitoring MUST separately expose market key/record counts, waiting count, Redis used memory, AOF growth
  and drain throughput
- **AND** it MUST NOT claim a configured hard backlog limit, automatic rate limit, batch mitigation or automatic
  waiting-job cleanup in V1
- **AND** it MUST NOT claim a numeric Redis maxmemory limit or market/queue memory quota
- **AND** deployment evidence MUST verify `maxmemory-policy=noeviction`

#### Scenario: A cross-day trigger expires
- **WHEN** a worker completes a job with `expired_trading_day`
- **THEN** monitoring MUST aggregate that bounded queue outcome separately from evaluation unavailable and failure
- **AND** securityId, source and triggerTime MUST NOT become metric labels

#### Scenario: An older same-day trigger is discarded
- **WHEN** a worker completes a job with `out_of_order_trigger_discarded`
- **THEN** monitoring MUST aggregate that bounded queue outcome separately from duplicate, unavailable and failure
- **AND** it MUST NOT claim that the old signal was replayed or repaired
- **AND** securityId, source and triggerTime MUST remain diagnostics rather than metric labels

#### Scenario: A job fails or stalls
- **WHEN** a processor exception or first stalled detection moves a job to failed
- **THEN** monitoring MUST distinguish failed and stalled-triggered failure outcomes
- **AND** it MUST NOT report an automatic retry, backoff, dead-letter or repair capability
- **AND** job identity and exception detail MUST remain in bounded diagnostics rather than metric labels

#### Scenario: Retained results are observed
- **WHEN** completed, expired or failed jobs remain under the 24-hour lazy retention policy
- **THEN** monitoring MUST expose their state counts separately from waiting backlog
- **AND** it MUST NOT report lazy over-retention as a retry or unprocessed job

#### Scenario: Signal registry refresh is observed
- **WHEN** a registry generation is published or a refresh fails
- **THEN** diagnostics MAY expose the process-local generation, definition id, action and correlation
- **AND** metrics MUST aggregate only bounded refresh success/failure outcomes
- **AND** registryGeneration, strategyDefinitionId and correlationId MUST NOT become metric labels
- **AND** monitoring MUST NOT claim automatic reconciliation after a committed-but-unconfirmed refresh

#### Scenario: Intraday episode membership is observed
- **WHEN** active membership changes or a trading-day rollover clears the store
- **THEN** monitoring MUST expose bounded activate, suppress, clear and day-rollover outcomes
- **AND** it MAY expose only the process-level active-key count as a gauge
- **AND** tradingDay, definitionId, versionId, securityId and episode identity MUST NOT become metric labels
- **AND** monitoring MUST NOT claim cross-restart or cross-day episode continuity

### Requirement: Realtime subscription stall alerts are source-aware

告警规则 SHALL 区分数据源（tdx / qmt）检测订阅数据流动停滞：既有
snapshot 断流规则（A1）MUST NOT 因另一源正常流动而掩盖本源的单独断流
（count 聚合需按 source 拆分或 label 过滤）；新增订阅 stall 规则
（`mist_datasource_subscription_stall_active ≥ 1`，datasource 侧状态机
检出：活动窗口内静默超 grace 进入 PUSHING，连续恢复失败升级 escalated）
MUST 按 source label 区分。活动窗口（`MIST_ACTIVITY_WINDOWS`，默认
`09:15-11:30,13:00-15:00` UTC+8）是 datasource 状态机与告警时段的单一
边界：窗口外 datasource 已 IDLE（stall_active 恒 0），规则在收盘/午休/夜间
自然无样本，无需 receiver 另做时段推断（datasource 窗口即告警时段）。

#### Scenario: 单源断流不被掩盖

- **WHEN** QMT 侧静默断流而 TDX 正常流动（同 stream 名 count 聚合）
- **THEN** 告警规则 MUST 按 source 维度检出 QMT 断流（拆分规则或
      label 过滤）
- **AND** TDX 的正常流动 MUST NOT 抑制 QMT 的告警

#### Scenario: stall 检出触发告警

- **WHEN** datasource 导出 `mist_datasource_subscription_stall_active{source}`
      值为 1（PUSHING 态：活动窗口内静默超 grace，连续恢复失败升级 escalated）
- **THEN** 告警规则 MUST 触发 P1 告警并投递
- **AND** 规则评估 MUST 尊重时间窗口（不采用 value 谓词绕过窗口的写法）

#### Scenario: 窗口外不误报

- **WHEN** 处于活动窗口外（午休/收盘/夜间）
- **THEN** datasource MUST 为 IDLE（stall_active 恒 0），规则评估 MUST 无
      样本而不触发
- **AND** 无需 receiver 增加单独的时段判定（窗口是单一边界，双源一致）

