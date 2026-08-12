---
name: datasource-log-access
version: 0.1.0
---

# Datasource Log Access

## ADDED Requirements

### Requirement: R1: Datasource logs are exported to OpenObserve

tdx-datasource 与 qmt-datasource 两个 app 的 Python logging 日志 SHALL 经 OTLP
logs 进入 OpenObserve；LogRecord 的 `service.name` SHALL 与 traces/metrics 一致
（tdx-datasource / qmt-datasource）；LogRecord SHALL 携带完整 trace_id/span_id
顶层字段，可与同 trace_id 的 spans 聚合检索。

#### Scenario: 观测帧/reject 日志在 OO 可查

- **WHEN** 桥 reject 一条快照（或 TCP 观测帧产生一条日志）
- **THEN** 该日志 MUST 可在 OO 按 service_name（tdx-datasource）与 trace_id 检索
- **AND** LogRecord MUST 携带 reason/symbol 等既有 `key=value` 结构化内容
- **AND** LogRecord 的 trace_id MUST 与对应 spans 一致（可同 trace 聚合）

### Requirement: R2: Single delivery with stdout fallback

日志 SHALL 在 OO 内单发（每条日志恰好一条 LogRecord，不重复）；stdout
（docker logs）SHALL 保留为兜底通道，两条通道各自消费，不构成重复。

#### Scenario: OO 内单发

- **WHEN** 一条 ingest reject 日志被发出
- **THEN** 按该 trace_id 查询 OO logs MUST 恰好命中一条
- **AND** stdout 同步输出一份（docker logs 兜底），不影响 OO 内计数

### Requirement: R3: No-op guard and flush coverage

无 `OTEL_EXPORTER_OTLP_ENDPOINT` 时日志导出 SHALL 不配置、不抛错，stdout 正常；
`force_flush` SHALL 覆盖 logs provider，保证启动失败路径的日志在进程退出前出站。

#### Scenario: 无 endpoint 时不配置

- **WHEN** 进程无 OTLP endpoint（本地开发/诊断环境）
- **THEN** 日志导出 MUST NOT 初始化、MUST NOT 抛错
- **AND** stdout 日志 MUST 保持正常

#### Scenario: QMT 启动失败日志出站

- **WHEN** QMT startup 失败并走 error log → force_flush → 退出路径
- **THEN** force_flush MUST 包含 logs（该 errored 日志随 flush 出站）

### Requirement: R4: Zero compose changes

日志导出 SHALL 复用现有 `OTEL_EXPORTER_OTLP_ENDPOINT` /
`OTEL_EXPORTER_OTLP_HEADERS`（OTLP logs 自动派生 `/v1/logs`），不新增环境变量
与 compose 配置。

#### Scenario: 部署零改动

- **WHEN** 本 change 部署到生产
- **THEN** compose/env 配置 MUST 保持不变
- **AND** logs 流 MUST 使用与 spans/metrics 相同的 endpoint 与凭据
