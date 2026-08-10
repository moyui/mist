# Tasks: instrument-backend-candle-pipeline

## 1. backend 日志 trace_id 注入（已确认：nestjs-pino + OTel 自动注入）

- [x] 1.1 `package.json` 加 `nestjs-pino`（含 pino）依赖。
- [x] 1.2 `apps/mist/src/main.ts`：`app.useLogger(app.get(Logger))` 接入 nestjs-pino
      （业务 `this.logger.log()` 调用不变）。
- [x] 1.3 确认 instrumentation-pino 自动注入（libs/otel 的 getNodeAutoInstrumentations
      已含）——单测验证有 active span 时日志带 trace_id。

## 2. 指标导出（已确认方案 A：现有 counter → OTel observable Gauge）

- [x] 2.1 新建 `apps/mist/src/realtime/observability/candle-metrics.ts`：
      用 `@opentelemetry/api` 的 metrics API 定义 OTel Gauge（observable 读现有 counter）：
      `mist_candle_sealed_total` / `mist_candle_discard_total{reason}` /
      `mist_candle_late_after_grace_total` / `mist_candle_capacity_exceeded_total` /
      `mist_candle_snapshot_overflow_total` / `mist_candle_due_admission_overflow_total` /
      `mist_candle_due_scan_failure_total` / `mist_candle_due_registration_failure_total` /
      `mist_candle_finalization_horizon_exceeded_total`
- [x] 2.2 aggregator 补 4 个 skip 计数（no_event_time/out_of_session/duplicate_or_late/
      not_aggregation_eligible）——新增 counter 或 span event 计数。
- [x] 2.3 单测：指标存在 + reason 有界。

## 3. WS client 拒绝分支 span（TDX/QMT）

- [x] 3.1 `sources/tdx/realtime/realtime.client.ts` handleSnapshot：
      根 span `candle.snapshot.process`（在 `ingress.handleSnapshot` 前开始，
      覆盖整个 snapshot 处理链）。5 个拒绝分支（transportReady/decode/symbol/allowlist/
      converter）→ span event `rejected{reason}` + status ERROR + **warn 日志
      （每分支一行，D2 表）**。
- [x] 3.2 `sources/qmt/realtime/realtime.client.ts`：对称。
- [x] 3.3 单测（InMemorySpanExporter）：拒绝分支 event + 成功路径 OK。

## 4. ingress span（静默点修复）

- [x] 4.1 `realtime-snapshot-ingress.service.ts` handleSnapshot：
      trading-day rollover → span event `trading_day_rollover` + info 日志；
      product.handleSnapshot 抛错吞掉 → span event `product_sink_failed` + **warn 日志
      （不再静默）**。
- [x] 4.2 单测：rollover event + product 抛错 event。

## 5. product service span（orchestrator）

- [x] 5.1 `realtime-market-data-product.service.ts` handleSnapshot：
      early gate（stopping/off/redis 不可用）→ span event `ingest_gated{reason}` + warn 日志；
      queue overflow → event `queue_overflow`（已有 counter）+ warn 日志。
- [x] 5.2 processSnapshot：startup-boundary skip → event `startup_boundary_skip`；
      no-client → event `redis_client_unavailable`；applySnapshot outcome →
      event `aggregated{outcome}`；生命周期日志 `candle aggregated`。
- [x] 5.3 registerDueIfFirst：too-late → event `due_registration_too_late`（静默修复）；
      registration failure → event + ERROR。
- [x] 5.4 scanDue：scan failure → event；malformed member → event + warn（静默修复）。
- [x] 5.5 单测：各 event 断言。

## 6. aggregator span（核心决策引擎）

- [x] 6.1 `open-candle-aggregator.ts` applySnapshot：
      在 product 的根 span 内（同 `candle.snapshot.process`），6 个 skip reason 全部
      → event `skipped{reason}`（含补的 4 个计数）+ **warn 日志每分支**；
      invalidated{reason} → event + ERROR + warn 日志；
      opened/updated/rolled-over → event + info 日志。
- [x] 6.2 单测：每个 skip reason 的 event + status。

## 7. due finalize span

- [x] 7.1 `realtime-market-data-product.service.ts` processDueMember：
      根 span `candle.due.finalize`；isAlreadySealed → event；hard horizon → event + ERROR + warn；
      freezeCandidate null → event `discarded{reason}` + ERROR + **warn 日志**；
      finalizer.seal 结果 → event `sealed` / `discarded{reason}` + **info 日志
      `candle finalize`（每 due member 一行）**。
- [x] 7.2 `candle-finalizer.ts` seal/discardDue：recordLimit/exec fail →
      event + ERROR（复用现有 counter）。
- [x] 7.3 单测：sealed 路径 OK + discard 路径 ERROR + 各 event。

## 8. mock 验证

- [x] 8.1 run-mock.sh 起栈 → mock-drive 注入 → OpenObserve 查询：
      `candle.snapshot.process` span（OK）→ `candle.due.finalize` span（sealed event）。
- [x] 8.2 停注入 → due 到期 → finalize span（no_snapshot discard event）。
- [x] 8.3 mock-verify.sh 加 backend span 断言。

## 9. 验证

- [x] 9.1 `pnpm typecheck` + `pnpm test` 全绿。
- [x] 9.2 `pnpm test:ci --forceExit` 全绿。
- [x] 9.3 `openspec validate instrument-backend-candle-pipeline --strict`。

## 10. 提交（不合并 master）

- [x] 10.1 mist 仓分支 `feat/instrument-backend-pipeline` 提交推送。
- [x] 10.2 不合并 master（等部署验证）。
