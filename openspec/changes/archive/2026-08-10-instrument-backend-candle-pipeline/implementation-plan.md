# O1 实施计划：instrument-backend-candle-pipeline

> 代码级实施计划（三步流程第二步）。spec 已确认（D3=方案 A 读现有 counter、
> D4=nestjs-pino 自动注入、日志全覆盖），本计划细化到文件/函数/测试/验证命令。

---

## 1. nestjs-pino 接入（D4，日志 trace_id 自动注入）

### 1.1 依赖

```bash
pnpm add -w nestjs-pino@^4.6.1
```

`nestjs-pino@4.6.1` peer 支持 `@nestjs/common@^10` + `pino@^10`——兼容 NestJS 10。

### 1.2 各 app 接入（5 个 main.ts）

**apps/mist/src/app.module.ts**（及 signal/backtest/chan/schedule 的 module）：
```typescript
import { LoggerModule } from 'nestjs-pino';
// AppModule imports 加：
LoggerModule.forRoot({
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',
    // instrumentation-pino 自动注入 trace_id/span_id（logHook 默认开启），无需手动
  },
})
```

**main.ts**（5 个 app）：
```typescript
const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));   // nestjs-pino 的 Logger，业务 new Logger() 委托到 pino
```

**关键**：业务代码 `new Logger(CandleFinalizer.name)` + `this.logger.error(...)` **零改动**
（16 个文件）——`app.useLogger` 后 NestJS Logger 实例方法委托给 pino。

### 1.3 验证

- `instrumentation-pino` 在 libs/otel 的 `getNodeAutoInstrumentations()` 内（已验证
  auto-instrumentations-node 内置 pino/winston）
- 单测：有 active span 时 pino 日志带 trace_id/span_id（见测试 9.x）

---

## 2. 指标导出（D3 方案 A：现有 counter → observable Gauge）

### 2.1 新建 `apps/mist/src/realtime/observability/candle-metrics.ts`

```typescript
import { metrics } from '@opentelemetry/api';
import { CandleFinalizer } from '../candle/candle-finalizer';
import { OpenCandleAggregator } from '../candle/open-candle-aggregator';
import { RealtimeMarketDataProductService } from '../candle/realtime-market-data-product.service';

let _registered = false;

/** 注册现有 counter → OTel observable Gauge。init_otel 后调用一次（幂等）。 */
export function registerCandleMetrics(
  finalizer: CandleFinalizer,
  aggregator: OpenCandleAggregator,
  product: RealtimeMarketDataProductService,
): void {
  if (_registered) return;
  const meter = metrics.getMeter('mist-backend', '0.1.0');

  // ⚠️ 修正（review 发现）：回调必须在 options.callbacks 里，不是第三参数
  // （createObservableGauge(name, options?) 签名，已验证类型定义）
  meter.createObservableGauge('mist_candle_sealed_total', {
    description: 'Sealed realtime candles (process-local)',
    callbacks: [(result) => {
      result.observe(finalizer.diagnostics().sealedTotal);
    }],
  });

  meter.createObservableGauge('mist_candle_discard_total', {
    description: 'Discarded candles by reason',
    callbacks: [(result) => {
      for (const { reason, total } of finalizer.diagnostics().discardTotals) {
        result.observe(total, { reason });
      }
    }],
  });

  // late_after_grace / candidate_capacity_exceeded / snapshot_overflow /
  // due_admission_overflow / due_scan_failure / due_registration_failure /
  // finalization_horizon_exceeded —— 从 product.runtimeObservation() 读（见 2.2）
  ...
}
```

**注意**：`runtimeObservation()` 是死代码（无消费者）——O1 复用它作为指标来源，
它的返回字段已有全部 counter。或直接读 product 的私有 counter（需要加 getter）。

### 2.2 来源决策

`RealtimeMarketDataProductService.runtimeObservation()`（630-673）聚合了
aggregator.diagnostics + finalizer.diagnostics + product counters——**直接复用它**
（它是唯一完整聚合点）。observable 回调：
```typescript
const obs = product.runtimeObservation();
result.observe(obs.candle.sealedTotal);              // sealed
for (const d of obs.candle.discardTotals) ...        // discard{reason}
result.observe(obs.candle.lateAfterGraceTotal);      // late_after_grace
result.observe(obs.candle.candidateCapacityExceededTotal);
result.observe(obs.queue.snapshotOverflowTotal);     // snapshot_overflow
result.observe(obs.queue.dueAdmissionOverflowTotal); // due_admission_overflow
result.observe(obs.due.scanFailureTotal);            // due_scan_failure
result.observe(obs.due.registrationFailureTotal);    // due_registration_failure
result.observe(obs.candle.finalizationHorizonExceededTotal);
```

### 2.3 注册时机

`apps/mist/src/main.ts`：`initTelemetry` 后（app 创建后拿实例）：
```typescript
const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
registerCandleMetrics(
  app.get(CandleFinalizer),
  app.get(OpenCandleAggregator),
  app.get(RealtimeMarketDataProductService),
);
```

### 2.4 aggregator 补 skip 计数（⚠️ 修正：只补 4 个，避免双份）

`open-candle-aggregator.ts` applySnapshot 的 skip 分支（68-82, 132-142）加计数器。
**只补 4 个未计的**（no_event_time/out_of_session/duplicate_or_late/
not_aggregation_eligible）——另外 2 个（late_after_grace/candidate_capacity_exceeded）
**沿用 product 层**的 lateAfterGraceCount/candidateCapacityExceededCount（已存在，
aggregator 再计会双份）。
```typescript
// aggregator 新增：skipCounts: Partial<Record<SkipReason, number>>（只含 4 个）
// 4 个 skip 分支：this.skipCounts['no_event_time']++ 等
// diagnostics() 返回值加 skipCounts（供 product.runtimeObservation 聚合）
```
product.runtimeObservation 的 candle 块加 `skipTotals`（4 个 reason，其余 2 个已有）。

---

## 3. WS client 拒绝分支 span + 日志（TDX/QMT）

### 3.1 新建 tracer helper：`apps/mist/src/realtime/observability/tracer.ts`

```typescript
import { trace } from '@opentelemetry/api';
export const candleTracer = () => trace.getTracer('mist-backend');
```

### 3.2 `apps/mist/src/sources/tdx/realtime/realtime.client.ts` handleSnapshot（293-349）

```typescript
// 在 handleSnapshot 开头（transportReady 检查前）：
return candleTracer().startActiveSpan('candle.snapshot.process', (span) => {
  span.setAttribute('source', 'tdx');
  span.setAttribute('symbol', providerSymbol);
  span.setAttribute('capturedAt', decoded?.data?.capturedAt ?? '');
  // 5 个拒绝分支：分支处
  //   span.addEvent('rejected', { reason: 'transport_not_ready' });
  //   span.setStatus({ code: SpanStatusCode.ERROR });
  //   this.logger.warn(`candle reject reason=transport_not_ready symbol=${providerSymbol}`);
  // 成功路径（recordAccepted 后）：
  //   span.setStatus({ code: SpanStatusCode.OK });
  //   this.logger.info(`candle ingest start source=tdx symbol=${providerSymbol} capturedAt=...`);
});
```

**注意**：handleSnapshot 现为同步方法（返回 void）——startActiveSpan 同步回调即可。
拒绝 reason 映射：
`transport_not_ready | decode_error | contract_mismatch | symbol_invalid |
not_authorized | converter_error`（对齐现有 recordReject reason）。

### 3.3 QMT 对称（`sources/qmt/realtime/realtime.client.ts`，285-342）

---

## 4. ingress span + 日志

### 4.1 `realtime-snapshot-ingress.service.ts` handleSnapshot（26-64）

- trading-day rollover（35-45）：`span.addEvent('trading_day_rollover', { symbol, day })` +
  `this.logger.info('candle trading_day_rollover symbol=... day=...')`
- product.handleSnapshot 抛错（54-62 catch）：`span.addEvent('product_sink_failed')` +
  `this.logger.warn('candle product_sink_failed symbol=... error=...')`（不再静默）
- ingress 不建新 span——事件挂在 client 的 `candle.snapshot.process`（同一 trace，
  通过 context 传播；ingress 是同步调用链的一部分）

---

## 5. product service span + 日志

### 5.1 `realtime-market-data-product.service.ts`

**handleSnapshot（179-205）**：
- early gate（180-181）：`span.addEvent('ingest_gated', { reason })` + warn 日志
  （reason = stopping | mode_off | redis_unavailable）
- queue overflow（189-203）：`span.addEvent('queue_overflow')` + warn 日志

**processSnapshot（209-309）**：
- no-client（213-214）：event `redis_client_unavailable` + warn
- startup-boundary（216-225）：event `startup_boundary_skip` + warn
- applySnapshot outcome switch（238-308）：
  - 各 outcome 处 `span.addEvent('aggregated', { outcome })`（opened/updated/rolled-over）
  - skip 的 4 个未计 reason：warn 日志（event 在 aggregator 层加）
- `this.logger.info('candle aggregated source=... symbol=... outcome=...')`

**registerDueIfFirst（331-423）**：
- too-late（342-347）：event `due_registration_too_late` + warn（静默修复）
- catch（395-412）：event `due_registration_failed` + warn + span ERROR

**scanDue（427-497）**：
- scan failure（446-463）：event + warn
- malformed member（468-478）：event `malformed_due_member` + warn（静默修复）
- dueAdmissionOverflow（481-490）：event + warn

**processDueMember（689-765）**——见第 7 节 due finalize。

---

## 6. aggregator span event + 补计数 + 日志

### 6.1 `open-candle-aggregator.ts` applySnapshot（64-158）

6 个 skip 分支各加：
```typescript
// this.skipCounts[reason]++（2.4 新增计数器）
// 当前 span event + warn 日志（通过参数传入的 span？还是 aggregator 自己建 span？）
```

**span 归属决策**（⚠️ 修正：不传参）：aggregator 的 applySnapshot 由 product 的
processSnapshot 调用——**同一同步调用链**（已验证 applySnapshot 前无 await），
`trace.getActiveSpan()` 在 processSnapshot 的 startActiveSpan 块内可直接拿到当前 span。
**不建新 span、不传参数**——applySnapshot 内用 `trace.getActiveSpan()?.addEvent(...)`。
```typescript
// applySnapshot 内（skip 分支）：
trace.getActiveSpan()?.addEvent('skipped', { reason: 'no_event_time' });
this.skipCounts['no_event_time']++;   // 计数（2.4）
// 日志由 product 层打（aggregator 保持纯逻辑）
```
invalidated → event（getActiveSpan）+ product 层 warn 日志。

invalidated（invalid_price/counter_reset）→ event + product 层 warn 日志。
opened/updated/rolled-over → event（aggregated 已在 5.1）。

---

## 7. due finalize span

### 7.1 `realtime-market-data-product.service.ts` processDueMember（689-765）

```typescript
// processDueMember 开头（⚠️ 修正：processDueMember 是 async，需 await + async 回调）：
return await candleTracer().startActiveSpan('candle.due.finalize', async (span) => {
  span.setAttribute('source', member.source);
  span.setAttribute('securityId', member.securityId);
  span.setAttribute('bucketStartMs', member.bucketStartMs);
  // isAlreadySealed（696-705）：event 'already_sealed'
  // hard horizon（707-717）：event 'finalization_horizon_exceeded' + ERROR + warn
  // freezeCandidate null（746-748）：event 'discarded' {reason} + ERROR + warn
  // seal 成功（724-741）：
  //   sealed → event 'sealed' + status OK + info 'candle finalize result=sealed'
  //   discarded → event 'discarded' {reason} + ERROR + warn 'candle finalize result=discarded reason=...'
});
```

### 7.2 `candle-finalizer.ts` seal/discardDue（74-205, 212-291）

- recordLimit/exec fail（123-131, 179-189, 196-204）：`span.addEvent('finalization_failed', { reason: 'record_limit' | 'exec_failed' })` + ERROR + warn
- finalizer 也是纯逻辑类——span 从参数传（seal 加 `span` 参数）或由 processDueMember 统一处理。**选 processDueMember 统一处理**（finalizer 保持纯逻辑，异常通过返回值/抛错暴露，processDueMember 的 catch 打日志）。

---

## 8. mock 验证

### 8.1 mock-verify.sh 加 backend span 断言

```
query_oo_traces "select * from 'default' where operation_name = 'candle.snapshot.process' ..."
  → 断言存在 + status OK
query_oo_traces "select * from 'default' where operation_name = 'candle.due.finalize' ..."
  → 断言存在（sealed event 或 discarded event）
```

### 8.2 验证流

```
run-mock.sh（backend 需 OTel env：OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:5080/api/default
  —— run-mock.sh 的 backend 启动命令加 env）
mock-drive.py --source tdx 注入（--captured-at 交易时段 + clock 偏移触发 due）
→ OpenObserve 查询 candle.snapshot.process（OK）+ candle.due.finalize（sealed）
→ 停注入 → due 到期 → candle.due.finalize（discarded no_snapshot）
```

**run-mock.sh 改动**：backend 启动（第 4 步 pnpm start:dev）加 OTel env
（和 datasource 一样的 OTEL_COMMON）。

---

## 9. 测试

### 9.1 测试基础设施

jest 每个测试文件独立进程——各文件可独立 `setTracerProvider(InMemorySpanExporter)`。
新建 `apps/mist/src/realtime/observability/test-utils.ts`：
```typescript
export function setupInMemoryTracing(): InMemorySpanExporter {
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  trace.setTracerProvider(provider);
  return exporter;
}
```
（依赖：**需显式装** `pnpm add -w @opentelemetry/sdk-trace-base@^2.10.0`——
pnpm 严格模式，sdk-node 内部的 sdk-trace-base 不可直接 import，已验证 store 有
`@opentelemetry+sdk-trace-base@2.10.0`）

### 9.2 测试文件

| 文件 | 断言 |
|---|---|
| `candle-finalizer.spec.ts`（新增或扩展） | seal 成功/失败分支（span 事件由 processDueMember 层测——finalizer 单测只测计数） |
| `realtime-market-data-product.service.spec.ts`（扩展） | processSnapshot 各 event + registerDue 各 event + processDueMember sealed/discarded span |
| `open-candle-aggregator.spec.ts`（扩展） | 6 个 skip 的 skipCounts 计数 + span event（传入 span mock） |
| `realtime.client.spec.ts`（tdx/qmt 扩展） | 5 个拒绝分支的 span event + status |
| `candle-metrics.spec.ts`（新增） | 指标注册幂等 + observable 回调读现有 counter |
| `realtime-snapshot-ingress.service.spec.ts`（扩展） | rollover event + product 抛错 event |

### 9.3 现有测试无回归

`pnpm test` 全量（148 套件 + 新增）。

---

## 10. 验证命令

```bash
cd mist
pnpm typecheck && pnpm test && pnpm test:ci

# openspec
openspec validate instrument-backend-candle-pipeline --strict

# mock 闭环
cd mist-datasource && bash tools/mock-env/run-mock.sh
python3 tools/mock-env/mock-drive.py --source tdx --frames 3 --captured-at 2026-08-09T10:00:00+08:00
bash tools/mock-env/mock-verify.sh   # 含 candle.snapshot.process + candle.due.finalize 断言
```

---

## 11. 提交

- mist 仓分支 `feat/instrument-backend-pipeline` 提交推送
- mist-datasource（mock-verify.sh 扩展）分支提交
- 不合并 master（等部署验证）

---

## 风险与注意

1. **jest 进程隔离**：各测试文件独立 setTracerProvider 安全（jest 每文件独立 worker）；
   同文件内多个测试需 exporter.clear()（O2a 教训）
2. **nestjs-pino 委托**：`app.useLogger(app.get(Logger))` 后业务 `new Logger()` 实例
   方法委托 pino——需验证（若 NestJS 10 的 Logger 实例不委托，需改用
   `InjectPinoLogger`——备选）
3. **aggregator/finalizer 纯逻辑**：保持不依赖 NestJS Logger——日志在 product 层打，
   span event 通过参数传 span（或 `trace.getActiveSpan()` 读当前）
4. **runtimeObservation() 复用**：它是死代码但字段完整——O1 复用作指标来源；
   若字段缺 skip 计数，先补（2.4）
5. **pino-http 请求日志**：nestjs-pino 默认会打每个 HTTP 请求日志（噪音）——可配
   `pinoHttp.autoLogging: false` 关掉，保留业务日志
6. **5 个 app 的 LoggerModule**：signal/backtest/chan/schedule 也要接入 pino
   （统一）——但 O1 埋点只在 mist app；其他 app 先接 LoggerModule 保持日志一致
