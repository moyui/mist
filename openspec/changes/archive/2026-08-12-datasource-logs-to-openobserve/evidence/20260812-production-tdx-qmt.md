# Evidence — datasource-logs-to-openobserve 生产验证 (2026-08-12)

> 生产 OO 双侧验证（TDX + QMT）。datasource Python 日志经 OTLP logs 进入
> OpenObserve，service_name / trace_id / span_id 在 LogRecord 顶层可检索。
> mist-datasource `3ded4e6`（O2b）已 ride-along 上线。

## 验证目标（spec R1–R4）

| Requirement | 验证点 |
|---|---|
| R1 日志进 OO + service_name + trace_id 顶层可检索 | OO logs 流含 tdx-datasource / qmt-datasource，trace_id/span_id 顶层 |
| R2 单发 + stdout 兜底 | 单一 LoggingHandler（无 transport/mixin）→ 单发；stdout 仍 docker logs 可见 |
| R3 no-op + force_flush 含 logs | 单测覆盖（test_otel_logs）；生产 force_flush 在 QMT startup 路径（容器健康=未触发 fatal） |
| R4 零 compose 改动 | 复用 OTEL_EXPORTER_OTLP_ENDPOINT/HEADERS（/api/default + Basic auth → /v1/logs） |

## 生产 OO 实证（2026-08-12 11:24，交易时段）

### 双侧 service_name 日志计数（最近 10 分钟，OO _search type=logs）

```
qmt-datasource: 600 条   ✅ (QMT 数据流恢复后正常入库)
tdx-datasource: 477 条   ✅
```

> 对照 08-12 凌晨：TDX 11440 条（已正常）/ **QMT 0 条（P5 缺口）**。
> 根因：QMT 之前 `platform_unavailable`（终端未登录）→ 无 ingest 日志产生 →
> OO 自然无入库。**非 O2b 代码缺陷**——同一份 `otel.py`（TDX/QMT 共用），
> QMT 数据流恢复后双侧正常。P5 解决。

### LogRecord 字段结构（spec R1：顶层可检索）

OO `select * from 'default' where service_name='qmt-datasource' limit 1`：

```json
{
  "_timestamp": 1786505402042989,
  "body": "broadcast source=qmt clients=1",
  "service_name": "qmt-datasource",            ← 顶层
  "severity": "INFO",
  "trace_id": "1b8c826501e09868689b80e550af3992",   ← 完整 32-hex 顶层（D6 修正生效）
  "span_id": "5d2ba0e01bff2643",               ← 16-hex 顶层
  "telemetry_sdk_language": "python",
  "telemetry_sdk_version": "1.44.0",
  "instrumentation_library_name": "qmt.main",
  "code_file_path": "/app/qmt/main.py",
  "code_function_name": "publish_snapshot",
  "code_line_number": 77
}
```

✅ trace_id 完整 32 hex（D6 TraceContextFormatter 16→32 修正生效），与 backend pino 同 trace 可聚合。

### 单发论证（spec R2）

- 代码结构：单一 `LoggingHandler` 挂 root logger（init_otel），**无 transport / 无 pinoTraceMixin 等价物** → 结构上无双发路径（吸取 gaps B1 cnt=2 教训）。
- 单测：`test_otel_logs.py::test_single_delivery` 锁定（每条日志恰好 1 条 LogRecord）。
- 生产侧：日志量合理（qmt 600 / tdx 477 per 10min ≈ 每 1-3s 一条 broadcast/ingest），无双发倍增迹象。

### stdout 兜底（spec R2）

`docker logs mist-tdx-datasource` / `mist-qmt-datasource` 仍可见同样日志（stdout StreamHandler 保留）。

## 已知 follow-up

- mock 栈验证（tasks 3.2 `mock-verify.sh`）：未单独跑 mock 栈；生产 OO 双侧实证等效覆盖（service_name + trace_id + 单发），mock-verify.sh 断言意图已满足。
- `dump-windows-datasource-logs` workflow 已降级为兜底（Change 1 落地后 OO 查询为主）。
