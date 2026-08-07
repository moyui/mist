## ADDED Requirements

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
