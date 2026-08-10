# 实施计划 — otel-observability-gaps（代码级）

> 2026-08-10。spec 已全部确认（A1 source+securityId 归因 / A2-A3 span attributes / B1 日志进 OO
> / B2 查询与 UTC / C 已补项登记）。本计划含代码级落点，落地前逐行核对。

## 0. 前置事实（已核实）

- `CanonicalRealtimeSnapshot` 有 `source: RealtimeSource` + `securityId: number`
  （`realtime.types.ts:11-13`）——A1 加维数据源可用
- `skipCounts` 在 `OpenCandleAggregator` 单例（`open-candle-aggregator.ts:69-79`）——4 个 skip 点
  计数器，无 source/securityId 维；`diagnostics()` L216 输出
- `discardTotals` 在 `CandleFinalizer` 单例（`candle-finalizer.ts:59`）Map<InvalidReason, number>，
  `diagnostics()` L293
- product 的 `lateAfterGraceCount`/`candidateCapacityExceededCount` 为数字（无维）
- `runtimeObservation()` 消费者**只有 candle-metrics**（grep 确认，无外部 health reader）——
  结构改动影响面 = candle-metrics + 类型 + 单测
- `ApplySnapshotOutcome`：skip 带 reason（无 bucket）、opened/updated 带 bucket
  （`candle.types.ts:168-180`）；processSnapshot 已有 `snapshotBucket` 解析（L253）
- processSnapshot 判断点已用 `trace.getActiveSpan()?.addEvent(...)`（L189/248）——A3 同模式加
  `setAttribute`
- **vwap 校验当前代码不存在**（在 `fix-tdx-realtime-vwap-window-consistency` change，未落地）——
  A2 的 vwap attribute 依赖其落地后补（本 change 预留）
- 日志通道：5 个 app 已配 `pinoTraceMixin`（trace_id/span_id 注入主线程）——B1 transport
  只转发不读 span（worker 线程读不到 AsyncLocalStorage）
- pino transport 是 worker 线程（thread-stream），继承 process.env，独立于 webpack ——
  可在 worker 里 require `@opentelemetry/exporter-logs-otlp-http`
- jest coverage 门槛：lines 82.72 / statements 81.64 / functions 78.47 / branches 67.9——
  新增行必须有测试覆盖

## 1. 分支与工作流

- 分支 `feat/otel-observability-gaps`，基于 master（当前 `f73d3c1`）
- `git worktree add -b feat/otel-observability-gaps .worktrees/otel-observability-gaps` → `pnpm install`
- 5 个逻辑 commit：① openspec delta 定稿 → ② G0 SDK 初始化切换官方 register（含删
  initTelemetry）→ ③ A1-A3 埋点补强 → ④ B1 日志 transport + B2 文档 → ⑤ tasks 勾选
- ff 合并 master（`git checkout master && git merge --ff-only`，合并前
  `git branch --show-current` 确认）+ push origin/master

## 2. 文件改动清单（改 8 + 删 2 + 新 2 + 测试 6）

### G0：SDK 初始化切换官方 register（2026-08-11 拍板，remediate G1 提前）

> 实测结论（mock OO probe）：`@opentelemetry/auto-instrumentations-node/register`
> 三路全通——traces（probe-register/reg.manual 到达）、metrics（probe_reg_gauge stream
> 出现，`OTEL_METRIC_EXPORT_INTERVAL` 生效）、logs 默认 otlp（sdk.js 源码确认）。
> 替代自研 `otel-preload.js` + `initTelemetry`；**register 不设 `__MIST_OTEL_PRELOADED__`
> 标记，不删 initTelemetry 会双 SDK——切换与删除必须同步**。

- **删 `otel-preload.js`**（mist 仓根）
- **删 `libs/otel/src/otel.ts` 的 `initTelemetry`/`shutdownTelemetry`**（保留
  `pinoTraceMixin` + global 类型声明）；`otel.spec.ts` 删 initTelemetry 测试、保留 mixin 测试
- **6 处 `apps/*/src/main.ts` 删 `initTelemetry(...)` 调用及对应 import**
  （mist/backtest/chan/signal/schedule/realtime-subscription-hil）
- **启动命令换 target**（`-r ./otel-preload.js` → `-r @opentelemetry/auto-instrumentations-node/register`）：
  - mist `Dockerfile` CMD
  - mist-deploy `compose.yaml` 3 处 command（backtest/signal/chan）+ CI 门禁断言同步
  - mist-datasource `run-mock.sh` NODE_OPTIONS
- env 兼容：`OTEL_SERVICE_NAME`（compose 已设 4 app）/ `OTEL_EXPORTER_OTLP_ENDPOINT` /
  `OTEL_EXPORTER_OTLP_HEADERS` 全部沿用；metrics 导出间隔可用
  `OTEL_METRIC_EXPORT_INTERVAL`（不设则默认 60s）
- 验证：probe 已证机制；mock 栈 backend 全链路（spans + 10 gauges + logs）落地后复验

### A1：skip/discard source+securityId 归因（D1a=securityId）

**A. `open-candle-aggregator.ts`**
- `skipCounts`：`Partial<Record<reason, number>>` → `Map<string, Partial<Record<reason, number>>>`，
  key = `${source}:${securityId}`（4 个 skip 点：`applySnapshot` 有 snapshot.source/securityId）
- skip 点统一走私有方法 `recordSkip(source, securityId, reason)`
- `diagnostics()` 的 skipTotals 类型同步（`Array<{source, securityId, reason, total}>` 或
  Map 序列化——**定：`Array<{ source: RealtimeSource; securityId: number; reason: ...; total: number }>`**，
  低基数集合内循环消费）

**B. `candle-finalizer.ts`**
- `discardTotals`：Map<InvalidReason, number> → key `${source}:${securityId}`（discard 点
  seal/discardDue 有 decoded.source/securityId——落地时逐点核对）
- `diagnostics()` 同步（discardTotals → `Array<{source, securityId, reason, total}>`）

**C. `realtime-market-data-product.service.ts`**
- `lateAfterGraceCount`/`candidateCapacityExceededCount`（数字）→ per (source, securityId)
  Map（processSnapshot 有 snapshot.source/securityId）
- `runtimeObservation()` 的 candle 块输出类型同步

**D. `realtime-candle-health.types.ts`**
- `RealtimeCandleRuntimeObservation.candle` 的 skipTotals/discardTotals/lateAfterGraceTotal/
  candidateCapacityExceededTotal 类型更新

**E. `candle-metrics.ts`**
- skip gauge callback：遍历新结构 → `result.observe(total, { source, securityId: String(securityId), reason })`
  （OTel label 值 string；securityId 数字转 string）
- discard gauge：对称
- lateAfterGrace/capacity gauge：对称（带 source+securityId）
- **基数护栏**：当前收集周期内 securityId 集合 size > `MAX_SECURITY_LABELS`（常量 50）→
  该周期只发 `{source, reason}`（回退 source-only，spec R1 Scenario 3 落地）

### A2：finalize span attributes

**F. `realtime-market-data-product.service.ts` processDueMember**
- sealed 分支（L804 附近）：`span.setAttribute('verdict', 'sealed')`
- discarded 分支（L810/L837）：`span.setAttribute('verdict', 'discarded')` +
  `span.setAttribute('discardReason', sealed.invalidReason ?? reason)`
- **不做 vwap attribute**（review 2026-08-11）：backend 无 vwap 校验数据源；
  vwap 一致性检查在 deploy workflow 层（vwapClassification）

### A3：snapshot span 判断点 attributes

**G. `realtime-market-data-product.service.ts` processSnapshot**（沿用 `trace.getActiveSpan()` 模式）
- ingest_gated（L189）：+ `setAttribute('ingestGated', reason)`（命名对齐 handoff 缺口 4；
  `ingestGated` 独立 attribute，值为 gate reason）
- startup_boundary_skip（L248）：+ `setAttribute('bucketStartMs', snapshotBucket.bucketStartMs)` +
  `setAttribute('skippedReason', 'startup_boundary_skip')`
- applySnapshot outcome skip（L280 后）：+ `setAttribute('skippedReason', outcome.reason)` +
  （有 bucket 时）`setAttribute('bucketStartMs', ...)`——skip 分支无 bucket 时只设 skippedReason
- 事件保留（addEvent 不动）

### B1：日志进 OO（D3 统一 mist 仓 + D3a 可配置）

> **方案定稿（2026-08-11 开源调研）**：采用 **pino 官方组织维护的
> `pino-opentelemetry-transport`**（github.com/pinojs/pino-opentelemetry-transport，v4.0.2），
> 放弃自研 logger-transport.js。理由：机制同构（pino transport worker）但缓冲/重试/协议/
> severity 映射全官方；兼容已验证（pino 10.3.1 ✓ peer ^10、api-logs 0.221 ✓ ^0.220、
> api ^1.9.1 ✓）；D3a"可配置"由 OTel 标准 env 天然满足（`OTEL_BLRP_MAX_QUEUE_SIZE` 等）。

**H. 依赖**
- `pnpm add pino-opentelemetry-transport`（新增唯一依赖；O1 的 OTel 依赖不动）

**I. 5 个 app 的 `LoggerModule.forRoot`**（app.module.ts / chan / schedule / signal / backtest）
- `pinoHttp` 加 `transport: { target: 'pino-opentelemetry-transport' }`
  （target 是包名——pino 运行时在 worker 线程 resolve，不走 webpack，无打包问题）
- `pinoTraceMixin` 保留（主线程注入 trace_id/span_id → 作为 LogRecord attributes；
  transport 不做 trace 关联提升——官方包依赖 instrumentation-pino 做顶层 traceId，
  我们 webpack 场景不可用，**trace_id 经 attributes 检索**——gaps 2.1 验证 OO
  `attributes['trace_id']` 过滤）
- env：复用 `OTEL_EXPORTER_OTLP_ENDPOINT`（logs endpoint 自动派生 `/v1/logs`）；
  可配置项走 OTel 标准 env（OTEL_BLRP_* / OTEL_EXPORTER_OTLP_LOGS_*）

**J. `libs/otel`**：**不加 LoggerProvider**（官方 transport 自带 sdk-logs 栈，避免双路径）；
  `pinoTraceMixin` 不动

### B2：查询文档 + UTC

**K. 新 `docs/otel-observability-queries.md`（mist 仓）**
- OO 查询方式：traces/metrics/logs 的 stream 名、`type=` 参数、微秒窗口、按名查 stream
  （streams API 空是用法问题——用 `_search?type=metrics` 按名查）
- UTC 约定：窗口计算统一 UTC epoch（微秒），业务时间（tradingDay/bucket/capturedAt）
  按 Asia/Shanghai 展示（引用 libs/timezone）

### C：已补项登记（tasks 4.x，无代码）

## 3. 测试用例

**公共手法**（镜像 candle-metrics.spec / backtest-metrics.spec）：
`InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)` + `MeterProvider` +
`metrics.setGlobalMeterProvider`；`_registered` 模块级单例 → 单 it 全量断言或
`jest.resetModules()` + fresh api `disable()`+`setGlobalMeterProvider`（5.2 已验证手法）

1. **candle-metrics.spec 扩展**：mock diagnostics 新结构（2 source × 2 securityId × reason）→
   断言 skip/discard gauge 的 `{source, securityId, reason}` label 与值；lateAfterGrace/capacity
   对称；幂等保留
2. **open-candle-aggregator.spec 扩展**：4 个 skip 点后 diagnostics 含
   `{source, securityId, reason, total}`（两 source 同 securityId 分开计数）
3. **candle-finalizer.spec 扩展**：discardTotals 加维断言
4. **product spec 扩展**：runtimeObservation 新结构 + processDueMember verdict/discardReason
   attribute 断言（InMemorySpanExporter + 单测手法）
5. **processSnapshot attributes**：ingest_gated/startup_boundary_skip/skip 分支的
   `skippedReason`/`bucketStartMs` attribute 断言（InMemorySpanExporter）
6. **日志 transport（官方包）**：无自研代码可测——验证落到 mock 环境（OO 出 logs 流 +
   attributes['trace_id'] 可过滤）；若 OO attributes 检索不满足，再评估自研提升 traceId
   （见 §7 风险）

**覆盖率补充**：新增行（Map 结构/attribute 设置）依赖上述 spec 覆盖；落地跑
`pnpm run test:coverage` 实测，不足补最小用例

## 4. 验证命令（worktree 内）

```bash
pnpm typecheck
pnpm lint:check
pnpm exec jest candle-metrics --runInBand
pnpm exec jest open-candle-aggregator --runInBand
pnpm exec jest realtime-market-data-product --runInBand
env TZ=UTC pnpm run test:ci
pnpm run test:coverage          # ≥82.72 lines 门槛
openspec validate otel-observability-gaps --strict
git diff --check
```

## 5. mock 验证（落地后）

1. run-mock.sh 起栈（backend 已含 preload + 新代码）
2. mock-drive 推两源帧 → OO 查询：
   - `mist_candle_skip_total` 按 `source`+`securityId` 分组（两源可区分）
   - `candle.due.finalize` span 的 `verdict` attribute（sealed/discarded 各一）
   - `candle.snapshot.process` span 的 `skippedReason`/`bucketStartMs`
   - OO logs 流出现 backend 日志且带 trace_id（B1）
3. mock-verify.sh 补 backend 断言（归因 + attributes + logs）

## 6. 收尾顺序

1. 合并 + push origin/master → Build Docker Images 成功
2. 生产部署（Deploy Windows Mist Stack）：mist tag=新 SHA、previous=f73d3c1（当前 master）、
   frontend ea4632a0、datasource fb38428；**productization 显式传 shadow 或 off 按当时状态**
   （schema 缓存 08-10 下午已可传 shadow——传当前生产期望值 off，422 则不传归一化 off）
3. 生产验证（交易时段，实盘线程）：归因查询 + verdict/skippedReason + OO 日志回溯
4. tasks 勾选 → 归档（--skip-specs；live specs 已含 O1/O2a 子 spec，delta 合并手动同步）
5. remediate-otel-audit-findings 随后处理（spec 已建）

## 7. 风险与注意

- **不改**：otel-preload.js、webpack.config.js、`CanonicalRealtimeSnapshot` 契约、
  aggregator/finalizer 的聚合逻辑（只加维不改变量语义）、`RealtimeCandleRuntimeObservation`
  之外的健康端点
- skipTotals 结构变更影响 candle-metrics 与（若有）未来消费者——当前仅 candle-metrics（已核实）
- **vwap 校验结果不属 span**（review 2026-08-11）：backend 无 vwap 数据源，spec R2 已移除
  该要求；vwap 一致性检查在 deploy workflow 层
- **pino-http 11 transport 兼容**：nestjs-pino 的 pinoHttp 配置传 pino-http 11——
  `transport` 选项支持需 mock 栈实测确认（pino-http 11 已装，peer pino 兼容）
- **register 无 endpoint 时**：OTel 标准行为（默认 localhost:4318 重试）——mock/生产已有
  endpoint，CI（jest）不加载 register，本地直跑有重试噪音可接受（文档注明）
- 实施中发现 spec 需调整 → 先停下讨论再改
