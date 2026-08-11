# OpenObserve 查询指南（遥测 + 日志）

> 2026-08-11（otel-observability-gaps B2）。生产 OO：192.168.31.182:5080（凭据见
> mist-deploy `.env` 的 `OO_ROOT_USER_EMAIL`/`OO_ROOT_USER_PASSWORD`，**不落明文**）；
> mock OO：127.0.0.1:5080（root@example.com / Complexpass#123）。

## 通用要点

- **搜索 API**：`POST /api/default/_search?type=<traces|metrics|logs>`（`type=` 必填）
- **时间窗口**：`start_time`/`end_time` 在 `query` 对象内，单位**微秒**（epoch us）
- **字段**：traces/logs 的字段在 hit **顶层**（operation_name/service_name/span_status 等）
- **metrics 按 stream 名查**：每个 metric 名是一个 stream（`select * from '<metric名>'`）；
  streams 列表 API 可能返回空（用法问题），按名直查可靠
- **时间约定（libs/timezone）**：脚本窗口计算统一 **UTC epoch 微秒**；业务时间
  （tradingDay/bucket/capturedAt）展示按 **Asia/Shanghai**

## Traces

```sql
-- 某 service 最近 span 分布
select service_name, operation_name, count(*) from 'default'
where service_name = 'mist-backend' group by service_name, operation_name

-- candle 管道（交易时段）
select * from 'default'
where operation_name like 'candle%' and service_name = 'mist-backend'
order by _timestamp desc limit 20

-- 按判定 attribute 过滤（gaps A2/A3 后）
select * from 'default'
where operation_name = 'candle.snapshot.process'
  and attributes['skippedReason'] = 'out_of_session'
order by _timestamp desc limit 20
```

## Metrics

```sql
-- 按 stream 名查（每个指标一个 stream）
select * from mist_candle_skip_total order by _timestamp desc limit 20
-- 归因 label（gaps A1 后：source/securityId/reason）
select * from mist_candle_skip_total where source = 'tdx' limit 20
```

## Logs（gaps B1 后）

```sql
-- 按 trace_id 过滤（instrumentation-pino 官方注入顶层 trace_id）
select * from 'default' where trace_id = '<traceId>' limit 50
-- 按 service 查
select * from 'default' where service_name = 'mist-backend' order by _timestamp desc limit 50
```

## 已知限制

- **span events 在 OO 不可查**（`skipped`/`ingest_gated` events 查询为空）——关键判定已提升为
  span attribute（gaps A2/A3），events 仅作细节保留
- metrics 历史窗口行为：按正确窗口（微秒）+ 按名查 stream 可回溯；聚合语义见 OO 文档
