# Proposal: datasource-logs-to-openobserve

## Why

2026-08-11 TDX 行情四层故障排查全程暴露一个运维盲区：**datasource Python 日志
不进 OpenObserve，观测帧/reject 只能 `docker logs` 挖**。当天为定位/修复临时新增
`dump-windows-datasource-logs` workflow（`docker logs --tail N` + grep），每次触发
等 self-hosted runner 30s-2min，且 docker logs 容量有限（tail 默认 300 行）、
**不可回溯、不可按 trace_id 聚合检索**——与 backend 日志（gaps B1 已进 OO）形成
不对称：backend 侧按 trace_id 一条查询就能还原归因链，datasource 侧只能翻容器输出。

历史留坑（两次主动排除）：
1. `introduce-openobserve-otel-foundation` design.md「logs 不改」：日志继续走
   stdout + Docker 自然收集，明确"日志收集留给后续（如果要加的话）"。
2. `otel-observability-gaps` proposal 明确排除 datasource："datasource 侧埋点不动
   （O2a 已含 source label；本次问题全在 backend skip/discard）"——B1「日志进 OO」
   只覆盖 backend pino。

live spec `datasource-bridge-ingest-observability` 的 "Snapshot lifecycle is logged"
只约束"打日志并带 trace_id"（R2，stdout 形态），**未规定日志去向**——本 change 是
该要求的天然扩展点（O2b）。

## What Changes

datasource 两个 app（tdx-datasource / qmt-datasource）的 Python logging 日志
经 **OTLP logs** 进入 OpenObserve：

- **logs exporter**：`src/core/otel.py` 新增 `LoggerProvider` + `BatchLogRecordProcessor`
  + `OTLPLogExporter`（http，复用现有 endpoint），`LoggingHandler` 挂 root logger
  （级别与 `settings.log_level` 一致）——**手动路线，零新依赖**（`opentelemetry-sdk`
  内含 `LoggerProvider`/`LoggingHandler`，`opentelemetry-exporter-otlp-proto-http`
  内含 `OTLPLogExporter`）。
- **单发与兜底**：保留 stdout handler（docker logs 仍可看，作为 OO 不可用时的兜底）；
  每条日志在 OO 内恰好出现一次（吸取 gaps B1 初版 transport+mixin 双发 cnt=2 教训）。
- **force_flush 扩展**：含 LoggerProvider（QMT startup 失败路径的 errored 日志必须
  在进程退出前出站——现 `force_flush` 只 flush tracer provider）。
- **no-op guard**：无 `OTEL_EXPORTER_OTLP_ENDPOINT` 时整体不配置不抛错（与现有
  `init_otel` 一致，stdout 正常）。
- **trace_id 一致性**：`TraceContextFormatter` 现截断 trace_id 前 16 hex（stdout
  展示），改为完整 32 hex——与 OTLP LogRecord 顶层字段（完整 trace_id，OO 检索键）
  一致，避免两通道 trace_id 形态不同造成混淆。

### 边界（不做）

- **不建 OO 告警规则**（独立 O3 change）。
- **不改 compose/env**：tdx/qmt 两个 service 已有
  `OTEL_EXPORTER_OTLP_ENDPOINT=http://openobserve:5080/api/default` +
  `OTEL_EXPORTER_OTLP_HEADERS`（compose.yaml），OTLP HTTP logs exporter 从 endpoint
  自动派生 `/v1/logs`（gaps 2.4 已验证此模式）——零部署改动。
- **不动 backend pino 日志**（gaps B1 已做，不重复）。
- **不新增依赖**（手动 LoggerProvider 路线，不用 `opentelemetry-instrumentation-logging`）。
- **不改日志内容/级别策略**：日志语句与 `LOG_LEVEL` 语义保持不变，仅改变去向。
- **不做日志分级过滤/采样**（流量观察随本 change 落地，策略留后续）。

## Capabilities

- **New** `mist-observability/datasource-log-access`（ADDED：日志进 OO、单发与
  兜底、no-op + flush 覆盖、零 compose 改动）。
- **Modified** `mist-observability/datasource-bridge-ingest-observability`
  （R2 "Snapshot lifecycle is logged" 明确日志去向：stdout + OTLP 双通道、OO 内单发）。

## Assumptions

- OO Rust 版 logs 流可用且支持按 trace_id 顶层检索（gaps 2.1 已验证，
  `POST /api/default/_search?type=logs` + trace_id 顶层字段）。
- `opentelemetry-sdk`（已装 1.44）内含 `LoggerProvider`/`LoggingHandler`；
  `opentelemetry-exporter-otlp-proto-http` 内含 `OTLPLogExporter`——手动路线
  零新依赖成立（实施前验证类名导入路径）。
- OTLP HTTP logs 从现有 endpoint 自动派生 `/v1/logs`（gaps 2.4 backend 同模式已验证）。
