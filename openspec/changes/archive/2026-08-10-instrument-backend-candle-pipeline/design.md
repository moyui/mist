# Design: instrument-backend-candle-pipeline

## 决策

### D1. 两类根 span（帧处理 + due finalize）

backend 链路有两个天然的处理单元，各一个根 span：

```
candle.snapshot.process（每帧）
  WS client handleSnapshot
    ├─ 5 个拒绝分支 → span event rejected{reason} + status ERROR
    ▼ ingress.handleSnapshot（trading-day rollover → event）
    ▼ product.handleSnapshot（early gate → event; queue overflow → event）
    ▼ processSnapshot（startup-boundary → event; no-client → event）
    ▼ aggregator.applySnapshot
    │   ├─ 6 个 skip reason → event skipped{reason}
    │   ├─ invalidated{reason} → event
    │   └─ opened/updated/rolled-over → event outcome
    ▼ registerDueIfFirst（too-late → event; registration failure → event + ERROR）
  span 结束：outcome 汇总

candle.due.finalize（每 due member，due scanner 触发）
  processDueMember
    ├─ isAlreadySealed → event（silent cleanup）
    ├─ hard horizon → event finalization_horizon_exceeded + ERROR
    ├─ freezeCandidate null → event discard{reason}（no_snapshot/backend_restart_open_state_lost）
    ▼ finalizer.seal
    │   ├─ valid → status OK + sealed event
    │   ├─ invalid → event discarded{reason} + ERROR
    │   └─ exec fail / recordLimit → event + ERROR
  span 结束
```

成功路径 2-3 层，判断点用 event（与 O2a 一致，不建深树）。

### D2. 日志（每个判断点都有日志，与计数同等完整）

日志是**第一等公民**——不只 span event 和 counter，每个判断点都打日志。带 trace_id
（D4 的 nestjs-pino + instrumentation-pino 自动注入）。

**生命周期日志（info，3 点）**：
```
[info] candle ingest start   source=tdx symbol=600519.SH capturedAt=...     ← 帧进入
[info] candle aggregated     source=tdx symbol=... outcome=opened/updated/rolled-over  ← 聚合完成
[info] candle finalize       source=tdx bucket=... result=sealed/discarded reason=...  ← 封存完成
```

**判断点日志（warn，每个拒绝/跳过/丢弃点）**：

| 环节 | 日志 | 触发 |
|---|---|---|
| WS client 5 个拒绝 | `[warn] candle reject reason=transport_not_ready/decode_error/symbol_invalid/not_authorized/converter_error symbol=...` | 对应分支 |
| ingress product 抛错 | `[warn] candle product_sink_failed symbol=... error=...` | try/catch 吞错（原静默） |
| ingress rollover | `[info] candle trading_day_rollover symbol=... day=...` | 跨日清 cache |
| product early gate | `[warn] candle ingest_gated reason=stopping/mode_off/redis_unavailable` | 静默 no-op |
| product queue overflow | `[warn] candle queue_overflow symbol=...` | enqueue false |
| processSnapshot no-client | `[warn] candle redis_client_unavailable` | 静默 return |
| startup-boundary skip | `[warn] candle startup_boundary_skip symbol=... bucket=...` | 静默 return |
| aggregator 6 个 skip | `[warn] candle skipped reason=no_event_time/out_of_session/late_after_grace/not_aggregation_eligible/duplicate_or_late/candidate_capacity_exceeded symbol=...` | 对应分支（4 个原静默） |
| aggregator invalidated | `[warn] candle invalidated reason=invalid_price/counter_reset/... symbol=...` | 无效化 |
| registerDue too-late | `[warn] candle due_registration_too_late symbol=... bucket=...` | 静默 return |
| registerDue failure | `[warn] candle due_registration_failed symbol=... bucket=...` | catch |
| scanDue malformed member | `[warn] candle malformed_due_member member=...` | 静默 continue |
| dueAdmissionOverflow | `[warn] candle due_admission_overflow bucket=...` | enqueue false |
| processDueMember discard | `[warn] candle discarded reason=no_snapshot/backend_restart_open_state_lost bucket=...` | freezeCandidate null |
| finalizer seal 失败 | `[warn] candle finalization_failed reason=record_limit/exec_failed/horizon bucket=...` | 对应失败分支 |

**日志纪律**：`reason` 用有界枚举；symbol/securityId 可进日志（排查用，非 label）；
原始错误文本只进 `error=...` 字段不进 reason。

### D3. 指标范围（已确认：方案 A——导出现有 counters）

**决策（用户确认 2026-08-09）**：选 A，从现有 counter 读值导出为 OTel observable Gauge。

依据（OTel 官方规范）：
> "If the pre-calculated value is already available ... use Asynchronous UpDownCounter
> instead."（值已预先算好 → 用异步 instrument 读）

排除 B（双写：两套计数器同步反模式）；C（替换：业务 counter 直接改 OTel Counter）
风险高（计数器是业务状态，未来可能被读）。

导出清单（observable Gauge 读现有 counter）：
- sealedTotal / discardTotals{reason} / lateAfterGraceCount /
  candidateCapacityExceededCount / snapshotOverflowTotal / dueAdmissionOverflowTotal /
  scanFailureTotal / registrationFailureTotal / finalizationHorizonExceededTotal
- **skip 未计的 4 个 reason**（no_event_time/out_of_session/duplicate_or_late/
  not_aggregation_eligible）：O1 在 aggregator 补计数（span event 已覆盖细节，
  counter 让告警可聚合）

### D4. backend 日志 trace_id 注入（已确认：nestjs-pino + OTel 自动注入）

**决策（用户确认 2026-08-09）**：换 `nestjs-pino`，利用 `instrumentation-pino`
（auto-instrumentations-node 内置）自动注入 trace_id/span_id。

依据（开源调研）：
- `@opentelemetry/auto-instrumentations-node` 内置 `instrumentation-pino@^0.67`——
  通过 logHook 自动在每条 pino 日志加 trace_id/span_id（默认开启）
- NestJS 社区主流 Logger = nestjs-pino（`app.useLogger(app.get(Logger))` 一行接入）
- 业务代码 `this.logger.log()` 调用不变（NestJS Logger 接口兼容）
- 额外：pino 结构化 JSON 日志（OpenObserve 未来接日志直接可用）

**注意**：`getNodeAutoInstrumentations()` 已在 libs/otel 使用——pino instrumentation
随之自动启用，无需额外配置。需要装 `nestjs-pino`（含 pino）依赖。

### D5. 与 O2a 的对称性

- 同模式：根 span + 判断点 event + 生命周期日志 + 指标
- 不同点：backend 是 NestJS/TS（`@opentelemetry/api` 直接拿 tracer，libs/otel 已提供
  `initTelemetry`）；finalize 是异步任务（due scanner 1s 间隔），无父 span 时根 span 独立

### D6. mock 验证闭环

```
run-mock.sh 起栈（openobserve + datasource + backend）
  → mock-drive.py 注入 tdx 帧
  → OpenObserve 查询 candle.snapshot.process span（OK）
  → 交易时段/clock 偏移触发 due → candle.due.finalize span（sealed event）
  → 停注入 → due 到期 → finalize span（no_snapshot discard event）
  → mock-verify.sh 加 backend span 断言
```

## 影响链

```
mist 仓（backend app）
  ├── libs/otel：无改动（initTelemetry 已有）
  ├── 新建 observability/backend-metrics.ts（现有 counter → OTel gauge，D3 方案 A）
  ├── apps/mist/src/observability/（或实时目录内）tracer 工具：getTracer helper
  ├── apps/mist/src/realtime/realtime-snapshot-ingress.service.ts（span + 日志）
  ├── apps/mist/src/realtime/candle/realtime-market-data-product.service.ts（span + 日志 + metrics）
  ├── apps/mist/src/realtime/candle/open-candle-aggregator.ts（span event + 补 4 个 skip 计数）
  ├── apps/mist/src/realtime/candle/candle-finalizer.ts（span event + metrics）
  ├── apps/mist/src/realtime/candle/candle-due-scanner.ts（若独立文件）或 product 内
  ├── apps/mist/src/sources/{tdx,qmt}/realtime/realtime.client.ts（5 个拒绝分支 event）
  └── 日志：NestJS Logger trace_id 注入（D4）
```

## 边界

- 不改任何判断点**行为**（拒绝逻辑/错误码/返回结构全不变）
- 指标低基数：reason 有界枚举（InvalidReason 12 个 + skip 6 个），不携带 symbol/securityId
- span attribute 可带 symbol/securityId（排查用），metric label 不带
- `runtimeObservation()` / `diagnostics()`（无消费者死代码）——O1 若导出指标可复用，
  否则保留（不删，避免超范围）
- due finalize 是后台任务（无父 span），trace 独立——跨帧关联（同一 securityId 的
  snapshot→finalize）靠 attribute 查询，不靠 trace 父子
