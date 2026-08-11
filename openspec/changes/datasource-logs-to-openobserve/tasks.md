# Tasks: datasource-logs-to-openobserve

> 状态约定：本 change 为 O2b（datasource 日志进 OO），改动集中在 mist-datasource
> 仓库（`src/core/otel.py` / `src/core/logging.py` + 测试 + 文档）；OpenSpec 文件在
> mist 仓库。spec 确认后写实施计划（代码级），再落地。

## 1. 代码（mist-datasource）

- [ ] 1.1 `src/core/otel.py`：`init_otel` 内新增 logs provider——`LoggerProvider`
      （同 `service.name` 资源）+ `BatchLogRecordProcessor(OTLPLogExporter())` +
      `LoggingHandler` 挂 root logger（级别与 `settings.log_level` 一致）；
      no-op guard 与 `_configured` 幂等语义同步覆盖 logs（D1/D4）。
- [ ] 1.2 `src/core/otel.py`：`force_flush()` 扩展为 flush tracer + logs provider
      （meter 维持现状）；`shutdown_otel()` 重置 logs provider（D3）。
- [ ] 1.3 `src/core/logging.py`：`TraceContextFormatter` trace_id 由截断前 16 hex
      改为完整 32 hex（D6）。
- [ ] 1.4 验证 OTLP HTTP logs exporter 从现有 endpoint 自动派生 `/v1/logs`、
      类名导入路径（D5 前提，实施第一步先验证）。

## 2. 测试（mist-datasource）

- [ ] 2.1 `tests/conftest.py`：新增 session 级 `InMemoryLogExporter` +
      `LoggerProvider` fixture（仿现有 `otel_exporter`，OTel 1.44 全局 provider
      单次设置约束，resetModules/动态导入）。
- [ ] 2.2 `tests/unit/test_otel.py` 扩展：no-op（无 endpoint 不配置不抛错）、
      幂等（二次 init 不重建）、force_flush 含 logs 且不抛错。
- [ ] 2.3 新增 logs 断言测试：日志经 `LoggingHandler` 转 `LogRecord`，body/
      severity 正确、trace_id/span_id 与活动 span 一致（顶层字段）；**单发断言**
      （同一条日志恰好一条 LogRecord，防 cnt=2 回归，D2）。
- [ ] 2.4 `tests/unit/test_logging_trace.py` 更新：trace_id 完整 32 hex 断言。

## 3. 验证

- [ ] 3.1 `uv run pytest`（85% 覆盖率门禁，CI 同款命令）全绿。
- [ ] 3.2 `tools/mock-env/mock-verify.sh` 增加 `_search?type=logs` 断言：
      service_name=tdx-datasource 日志存在、按 trace_id 顶层可检索、单发（cnt=1）。
- [ ] 3.3 `openspec validate datasource-logs-to-openobserve --strict`（mist 仓根）。

## 4. 文档

- [ ] 4.1 mist 仓 `docs/otel-observability-queries.md` 补 datasource 日志查询段：
      service_name=tdx-datasource/qmt-datasource、trace_id 顶层检索、与 spans
      同 trace_id 聚合的查询示例。
- [ ] 4.2 交接文档（otel-whitebox-20260810/）注明 `dump-windows-datasource-logs`
      workflow 在 OO 检索验证通过后降级为兜底（不强制删除）。

## 5. 生产验证

- [ ] 5.1 部署后（实盘线程/交易时段）：OO 查询 tdx-datasource logs（type=logs +
      service_name + trace_id 检索），确认 ingest 三条 lifecycle 日志 + reject
      warn 可见、单发、trace_id 与 spans 一致；QMT 侧待 QMT 数据流恢复后补。
- [ ] 5.2 验证证据落盘 `evidence/`（查询语句 + 结果摘要，参照 O1/O2a 证据格式）。

## 6. 提交（三步工作流）

- [ ] 6.1 spec 确认通过后写实施计划（代码级）。
- [ ] 6.2 实施计划确认后落地（worktree 分支 + 单测 + 验证 + 合并）。
- [ ] 6.3 归档（delta 合并进 live specs 由手动同步，参照 gaps 6.3）。
