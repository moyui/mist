# Implementation Plan: datasource-logs-to-openobserve

> spec 确认后按本计划落地。代码改动全部在 **mist-datasource** 仓库（除文档
> otel-observability-queries.md 在 mist 仓库）。本计划为普通 markdown（非
> openspec 格式）。

## 0. 实施前提验证（第一步做，失败停下）

```bash
cd mist-datasource && uv run python -c "
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor, InMemoryLogExporter, SimpleLogRecordProcessor
print('imports ok')
"
```
预期 `imports ok`。若 `_log_exporter` 私有路径不可用，改用公开导出点并更新本计划。

## 1. `src/core/otel.py`（核心改动）

### 1.1 新增 import
```python
import logging  # 新增

from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter  # 新增
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler  # 新增
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor  # 新增
```

### 1.2 模块级状态
```python
_logger_provider: LoggerProvider | None = None  # 新增，与 _tracer_provider 并列
```

### 1.3 `init_otel()` 尾部追加（tracer/meter 之后、`_configured = True` 之前）
```python
    logs_provider = LoggerProvider(resource=resource)
    logs_provider.add_log_record_processor(BatchLogRecordProcessor(OTLPLogExporter()))
    logging.getLogger().addHandler(LoggingHandler(logger_provider=logs_provider))
    _logger_provider = logs_provider
```
- 签名不变：`init_otel(service_name: str) -> None`
- 级别：LoggingHandler 默认 level 不过滤——实际生效级别由 `setup_logging()`
  basicConfig 设置的 root logger level（`settings.log_level`）兜底（低于 root
  level 的日志根本不产生），与 stdout 语义一致（D2）
- no-op guard：现有 endpoint 检查天然覆盖（logs 配置在其后，无 endpoint 整段
  跳过）
- 幂等：`_configured` guard 覆盖（二次调用直接 return）

### 1.4 `force_flush()` 扩展（D3）
```python
def force_flush() -> None:
    if _tracer_provider is not None:
        _tracer_provider.force_flush()
    if _logger_provider is not None:
        _logger_provider.force_flush()  # 新增：QMT startup 失败路径 logs 出站
```

### 1.5 `shutdown_otel()` 扩展
```python
def shutdown_otel() -> None:
    global _configured, _logger_provider
    _logger_provider = None  # 新增
    _configured = False
```

## 2. `src/core/logging.py`（D6）

### 2.1 `TraceContextFormatter.format()` L24 修正
```python
# 改前
record.trace_id = f"{ctx.trace_id:032x}"[:16]
# 改后（完整 32 hex，与 OTLP LogRecord 顶层/backend pino 一致）
record.trace_id = f"{ctx.trace_id:032x}"
```
其余不变（span_id 已是 16 hex）。

## 3. 测试（mist-datasource）

### 3.1 `tests/conftest.py` — session 级 logs fixture
```python
@pytest.fixture(scope="session")
def log_exporter():
    """In-memory logs provider for LoggingHandler assertions (OTel 1.44:
    single global provider per domain; this one is passed explicitly to
    LoggingHandler, no global set needed)."""
    exporter = InMemoryLogExporter()
    provider = LoggerProvider()
    provider.add_log_record_processor(SimpleLogRecordProcessor(exporter))
    yield exporter, provider
```
（与现有 `otel_exporter` 并列；LoggingHandler 显式传 provider，不设全局）

### 3.2 `tests/unit/test_otel.py` 扩展（4 个新用例）

| 用例 | 断言 |
|---|---|
| `test_init_otel_logs_noop_without_endpoint` | delenvy endpoint → init 后 root logger **无** LoggingHandler；force_flush 不抛 |
| `test_init_otel_logs_attaches_handler` | setenv endpoint → init 后 `logging.getLogger().handlers` 含 `LoggingHandler` 实例（traces 同款模式） |
| `test_force_flush_flushes_logs` | init 后 force_flush 不抛（含 logs 分支） |
| `test_init_otel_logs_idempotent` | 二次 init 不重复挂 handler（root handlers 中 LoggingHandler 计数 == 1） |

注意：init_otel 的 exporter 是真实 OTLP（BatchLogRecordProcessor 后台），
内容断言不做（与现有 span 测试模式一致，只断言挂载/幂等/不抛）。

### 3.3 新增 `tests/unit/test_otel_logs.py` — 内容断言（不经 init_otel）

| 用例 | 做法 | 断言 |
|---|---|---|
| `test_logging_handler_forwards_records` | 临时 logger + LoggingHandler(log_exporter provider) 记一条 info | exporter 恰好 1 条 LogRecord，body 含消息、severity=INFO |
| `test_logrecord_carries_trace_context` | `with tracer.start_as_current_span("t")` 内记录日志 | LogRecord.trace_id/span_id == span context 顶层值 |
| `test_single_delivery` | 同一条日志（一个 logger 一次 emit） | exporter 记录数 == 1（防 cnt=2 回归，D2） |
| `test_handler_attached_to_root_does_not_duplicate` | 临时 logger 同时挂 stdout + LoggingHandler 各一，emit 一次 | exporter 计数 == 1（多通道不互扰） |

### 3.4 `tests/unit/test_logging_trace.py` 更新
- 有 span 断言：`record.trace_id == f"{ctx.trace_id:032x}"`（**完整 32 hex**，
  去掉 `[:16]`）；无 span 断言不变（`trace=-`）。

## 4. `tools/mock-env/mock-verify.sh`（mist-datasource）

在现有 backend logs 断言（L145-149）旁新增 datasource logs 断言：
```bash
query_oo_logs() {  # 仿 query_oo_traces() L89-94
  curl -s -X POST "${OO_ENDPOINT}/_search?type=logs" ... -d '{
    "query": {"sql": "select * from '\''default'\'' where service_name='\''tdx-datasource'\'' and trace_id != '\'''\'' limit 10"},
    "from": $((NOW_US - 600_000_000)), "size": 10, "to": "$NOW_US"}'
}
```
断言：`tdx-datasource` logs 记录数 ≥1（观测帧/ingest 日志）；同一 trace_id
命中数 == 1（单发）。

## 5. 文档（mist 仓库）

`docs/otel-observability-queries.md` 补 datasource 日志段：
- service_name=tdx-datasource / qmt-datasource；
- 查询示例（type=logs + trace_id 顶层 + 与 spans 同 trace_id 聚合）；
- 单发说明（stdout 为兜底，OO 内唯一）。

## 6. 验证命令（落地时按序执行）

```bash
# 0. 前提
cd mist-datasource && uv run python -c "..."   # §0

# 相关单测
uv run pytest tests/unit/test_otel.py tests/unit/test_otel_logs.py tests/unit/test_logging_trace.py -q

# 全量（85% 覆盖率门禁）
uv run pytest

# lint
uv run ruff check src tests

# mock 栈验证（需 mock 环境，见 tools/mock-env/）
tools/mock-env/mock-verify.sh

# mist 仓
cd ../mist && openspec validate datasource-logs-to-openobserve --strict
```

## 7. 落地步骤

1. mist-datasource worktree/分支（`feat/datasource-logs-oo`，主 worktree 保持
   master）→ §1/§2 改动 → §3 测试 → §4 mock 脚本 → 本地验证（§6 前 4 条）
2. 合并进 datasource master（个人项目直接合），推 origin
3. mist 仓文档（§5）→ 提交
4. 部署 + 生产验证（tasks 5.1/5.2，实盘线程执行）→ evidence 落盘 → 归档
   （tasks 6.3）

## 8. 风险与回滚

- **风险**：LoggingHandler 挂 root logger 后若 exporter 卡顿——BatchLogRecordProcessor
  是异步后台（不阻塞业务线程，与 spans 同机制）；无风险。
- **风险**：`_log_exporter` 私有导入路径在 OTel 升级后变化——§0 前提验证 + 版本
  钉在 uv.lock（1.44.0），升级 OTel 时回归测试锁定。
- **回滚**：纯增量改动（+logs 通道、stdout 保留），回滚=撤 otel.py/logging.py
  改动，无状态迁移。
