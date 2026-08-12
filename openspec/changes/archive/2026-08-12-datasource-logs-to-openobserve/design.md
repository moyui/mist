# Design: datasource-logs-to-openobserve

## 决策点

### D1：实现路线——手动 LoggerProvider vs LoggingInstrumentor
- **A（推荐）**：手动 `LoggerProvider + BatchLogRecordProcessor + OTLPLogExporter` +
  `LoggingHandler` 挂 root logger——**零新依赖**：
  - `opentelemetry-sdk`（已装）内含 `opentelemetry.sdk._logs`（LoggerProvider /
    LoggingHandler / LogRecord）；
  - `opentelemetry-exporter-otlp-proto-http`（已装）内含 `OTLPLogExporter`（http，
    endpoint 复用现有 `OTEL_EXPORTER_OTLP_ENDPOINT`，自动派生 `/v1/logs`）。
  - handler 逻辑透明、可单测（InMemoryLogExporter 直接断言），与 `init_otel` 的
    no-op guard / `_configured` 幂等模式完全同构。
- **B**：`LoggingInstrumentor`（`opentelemetry-instrumentation-logging`，+1 依赖，
  与 backend instrumentation-pino 的"官方 instrumentor"路线对齐）——但其能力
  （自动捕获所有 logger + 注入 trace context）与手动 `LoggingHandler` 相同，且本
  项目 `TraceContextFormatter` 已自带 trace context 注入，instrumentor 收益为零，
  徒增依赖与审计面（remediate-otel-audit-findings 正在收敛依赖）。
- 结论：**A**（零新依赖，符合"生产环境不引入新的外部依赖"验收目标）。

### D2：单发与去向——保留 stdout + OO 内单发
- **A（用户拍板 2026-08-11）**：stdout handler **保留**（docker logs 仍是 OO
  不可用时的兜底通道；O2b 部署前的存量诊断方式不失效）。保留理由：① no-op
  模式（无 endpoint）下 stdout 是唯一日志出口，删了本地开发/诊断无日志；
  ② OO 链路故障时（先例：08-09 OTLP endpoint 缺 /api/default 生产遥测全丢）
  docker logs 是唯一诊断通道；③ 与 backend pino 双通道一致；④ 零成本
  （stdout handler 本来就在，不删不改）。
- OO 内**单发**：每条日志经 `LoggingHandler` 恰好转一条 LogRecord——吸取 gaps B1
  初版教训（transport + mixin 双发，OO 内 cnt=2）；本 change 只有一条 OTLP 路径，
  结构上无重复可能，但仍以单测断言锁定（防未来加 mixin/第二 handler）。
- "stdout 一份 + OO 一份"不属双发：两通道各自消费，docker logs 是独立兜底。

### D3：force_flush 扩展含 logs
- 现 `force_flush()`（otel.py:76-82）只 flush tracer provider（`_tracer_provider`）。
- 扩展为 flush logs provider（`_logger_provider`）——QMT startup 失败路径
  （`qmt/main.py:223-224` error log → force_flush → re-raise）保证 errored 日志
  在进程退出前出站（与 live spec R6 "QMT startup failures" 的 flush 要求对齐）。
- meter 维持现状不 flush（与 O2a 一致）。
- no-op 时（无 endpoint）force_flush 不抛错（现有测试已锁定）。

### D4：no-op guard 与幂等
- 与 `init_otel` 现有模式一致：无 `OTEL_EXPORTER_OTLP_ENDPOINT` 时不创建 logs
  provider、不挂 handler（stdout 正常）、`force_flush` 不抛错。
- `_configured` 幂等：二次调用 `init_otel` 不重建（现有 test_otel.py 模式扩展）。

### D5：env 复用——compose 零改动
- tdx/qmt 两个 service 已注入 `OTEL_EXPORTER_OTLP_ENDPOINT`（含 `/api/default`
  org path）+ `OTEL_EXPORTER_OTLP_HEADERS`（`OO_OTLP_AUTH_BASE64` Basic auth）——
  OTLP HTTP logs exporter 直接消费同一 endpoint/headers，零新 env、零 compose 改动
  （gaps 2.4 backend 已验证同一模式）。
- `service.name` 沿用 `init_otel("tdx-datasource"/"qmt-datasource")` 的资源
  （与 traces/metrics 一致，OO 按 service_name 检索三流对齐）。

### D6：TraceContextFormatter trace_id 16 → 32 hex
- 现 `logging.py:19-21`：`record.trace_id = f"{ctx.trace_id:032x}"[:16]`——截断为
  前 16 hex 仅为 stdout 展示习惯；OTLP LogRecord 顶层 trace_id 是完整 32 hex
  （exporter 从 span context 取，不经 formatter）。
- 两通道 trace_id 形态不一致会造成误判（"为什么 stdout 的 trace_id 在 OO 搜不到"）。
- 改为完整 32 hex，与 backend pino（完整 trace_id）和 OO 检索键一致。
- 影响：stdout 日志行变长 16 字符；`test_logging_trace.py` 断言更新。

## 影响链（producer → wire → decoder → state → consumer → deploy/monitoring）

- **producer**：`src/core/logging.py`（TraceContextFormatter 32 hex）+ 全部现有
  logging 调用点（gateway.py / realtime_tcp.py / bridge.py / subscription.py 等，
  已结构化 `key=value`，内容不变）。
- **wire**：`otel.py` 新增 LoggerProvider → `OTLPLogExporter`（HTTP，复用
  `OTEL_EXPORTER_OTLP_ENDPOINT` → `/v1/logs`）→ OpenObserve logs 流。
- **state**：无状态改动（LoggerProvider 进程内，随 `_configured` 生命周期）。
- **consumer**：OpenObserve `type=logs` 检索（service_name / trace_id 顶层 /
  reason 等 attribute）——`docs/otel-observability-queries.md` 补 datasource 段。
- **deploy**：compose 零改动（D5）；部署验证走现有部署流程（O2a 同款）。
- **monitoring**：流量观察点（logs 量/留存）随本 change 落地；`dump-windows-
  datasource-logs` workflow 在 OO 检索验证通过后降级（保留为兜底，不强制删除）。

## 长期维护成本

- 手动 handler 约 20 行代码，与 `init_otel` 同文件、同模式，无独立抽象。
- 单发约束由单测锁定，防未来加 mixin/第二 handler 回归（gaps cnt=2 教训）。
- `TraceContextFormatter` 32 hex 为一次性修正，与 backend 对齐后无后续成本。
- capability 结构：`mist-observability` 下 `datasource-log-access` 独立子 spec，
  与 `backend-log-access` 平行演进（backend 已 done，datasource 本 change 补齐）。
