# Design: introduce-openobserve-otel-foundation

## 决策

### D1. OpenObserve 单容器部署

**选择**：单容器 `public.ecr.aws/zinclabs/openobserve:latest`，Parquet + SQLite 本地存储。

compose service：
```yaml
openobserve:
  image: public.ecr.aws/zinclabs/openobserve:latest
  container_name: mist-openobserve
  environment:
    ZO_ROOT_USER_EMAIL: ${OO_ROOT_USER_EMAIL:?set OO_ROOT_USER_EMAIL}
    ZO_ROOT_USER_PASSWORD: ${OO_ROOT_USER_PASSWORD:?set OO_ROOT_USER_PASSWORD}
  volumes:
    - type: bind
      source: ${OPENOBSERVE_DATA_DIR:?set OPENOBSERVE_DATA_DIR}
      target: /data
  ports:
    - "${OPENOBSERVE_PORT:-5080}:5080"
  healthcheck:
    test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:5080/web/healthz >/dev/null || exit 1"]
    interval: 30s
    timeout: 5s
    retries: 5
    start_period: 15s
  restart: unless-stopped
  networks:
    - mist-network
```

bind mount 路径：`E:\quant\MistDocker\openobserve-data`（跟随现有 MistDocker 模式）。

### D2. OTel SDK 接入 — NestJS（5 个 app + 1 个脚本）

**社区模式**（2026-08 调研：novu / booking-microservices / idempo / SBTM 一致）：
- **共享 lib + import-first 函数**——`libs/otel` 导出 `initTelemetry({serviceName, serviceVersion})`
  和 `shutdownTelemetry()`，每个 app 的 main.ts 在 `NestFactory.create` 之前调用
- **OTel 依赖栈只声明在 libs/otel 的 package.json**——apps 不声明 OTel 依赖
- **no-op guard**：未配置 `OTEL_EXPORTER_OTLP_ENDPOINT` 时静默跳过（SBTM/zenml 风格）
- `serviceName` 作为参数传入，不硬编码

**关键约束**：OTel SDK 必须在 `NestFactory.create` 之前 start（auto-instrumentation 需要
在 Nest core 加载前 patch 模块）。

依赖（声明在 libs/otel，同一 release train 0.221.0）：
- `@opentelemetry/sdk-node@^0.221.0`
- `@opentelemetry/auto-instrumentations-node@^0.79.0`
- `@opentelemetry/exporter-trace-otlp-http@^0.221.0`
- `@opentelemetry/exporter-metrics-otlp-http@^0.221.0`
- `@opentelemetry/sdk-metrics@^0.221.0`（PeriodicExportingMetricReader 需要）
- `@opentelemetry/resources@^2.10.0`
- `@opentelemetry/semantic-conventions@^1.31.0`

⚠️ **版本必须钉在同一 release train**（调研确认 OTel JS 正在版本分裂：api 1.9.x / SDK 0.221.0 /
resources 2.10.0）。混装会导致 instrumentation/exporter 不匹配。

**覆盖范围**（社区验证）：
- ✅ HTTP：`instrumentation-http` + `instrumentation-undici`（fetch）
- ✅ NestJS controller：`instrumentation-nestjs-core`（支持 NestJS 4-11，HTTP router 自动有
  `<Controller>.<method>` span）
- ✅ ioredis：`instrumentation-ioredis`（ioredis 2-5 支持）——**注意 `requireParentSpan`
  默认 true**，后台任务无 parent span 时不建 span
- ✅ MySQL：`instrumentation-mysql2`
- ❌ `@nestjs/microservices` TCP transport：**无官方 instrumentation**——signal/backtest 的
  TCP RPC 无自动 span（O1 手动 span 的范围）
- ❌ WS 帧推送（自定义管道）：无自动覆盖（O1/O2 手动）

OpenObserve endpoint 配置：`OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS`
（Basic auth），compose 里给每个服务配。

### D3. OTel SDK 接入 — Python（2 个 datasource app）

**社区模式**（zenml 5.5k★ / allenai infinigram / Azure contoso 一致）：
- **独立模块 `src/core/otel.py`**：`configure_otel(app, service_name)` + `shutdown_otel()`
- **`FastAPIInstrumentor.instrument_app(app)` 留在入口**，在 `app = create_*_app()` 之后
  模块级调用（instrument_app 需要 app 实例，且必须在第一个请求前调用）
- **不用 CLI 方式**（`opentelemetry-instrument`）——zenml 明确解释 CLI 与 uvicorn
  `--reload`/`--workers` 不兼容，主流生产代码库都用代码方式
- **no-op guard**：未配置 endpoint 时跳过（zenml/SBTM 风格）
- **幂等**：模块级 `_configured` 标志

依赖（pyproject.toml）：
- `opentelemetry-sdk>=1.44.0`
- `opentelemetry-exporter-otlp-proto-http>=1.44.0`
- `opentelemetry-instrumentation-fastapi>=0.65.0`

**覆盖范围**（社区验证）：
- ✅ HTTP：ASGI middleware 自动 span
- ✅ **WebSocket**：`scope["type"] in ("http","websocket")` 都建 span（WS 连接有 span，
  ⚠️ 无 HTTP duration 指标——WS 只记 span）
- ✅ 指标：FastAPI instrumentor 自动出 `http.server.duration` 等 OTel metrics
- 单 worker uvicorn = 安全（无多进程问题）

### D4. trace context 跨进程传播

OTel auto-instrumentation 自动传播 HTTP/gRPC 的 trace context（W3C TraceContext header）。
但 datasource → backend 的数据推送是 **WebSocket**（非标准 HTTP 请求），auto-instrumentation
**不会自动**传播 WS 消息的 trace context。

**O0 不处理这个问题**——O0 只做基础接入（auto-instrumentation 覆盖的 HTTP/gRPC/Redis
自动追踪）。WS trace context 传播留给 O1/O2（需要在 WS 帧里注入/提取 traceparent header，
是自定义代码）。

O0 完成后能看到的：
- ✅ 各服务的 HTTP 请求自动追踪（/app/hello、/health、API 请求）
- ✅ Redis 调用自动追踪（ioredis auto-instrumentation）
- ✅ 进程间 HTTP 调用的 trace 关联（backend → datasource HTTP /health 检查等）
- ❌ WS 帧推送的 trace 关联（datasource push → backend ingress 断链）
- ❌ 自定义管道内部的 span（ingress→aggregator→finalizer 判断节点）

### D5. 删除 3 容器的影响范围

审计确认的删除链：
- `monitoring` ← 仅 `prometheus` 依赖它
- `prometheus` ← 仅 `grafana` 依赖它
- `grafana` ← `web-gateway` 依赖它（`depends_on` + nginx `/grafana/` proxy）

删除清单：
| 类型 | 文件/目录 |
|---|---|
| compose service | `monitoring` / `prometheus` / `grafana` 三个 service block |
| compose volume | `prometheus-data` / `grafana-data` |
| compose depends_on | `web-gateway` 的 `grafana` 依赖 |
| nginx location | `/grafana/` proxy_pass |
| 配置目录 | `docker/monitoring/` / `docker/prometheus/` / `docker/grafana/` |
| 脚本 | `scripts/deploy-observability.ps1` / `scripts/deploy-monitoring.ps1` |
| 脚本测试 | `scripts/test-deploy-monitoring.ps1` |
| workflow | `deploy-observability-stack.yml` / `deploy-windows-monitoring.yml` |
| 脚本编辑 | `deploy-docker-appliance.ps1`（删启动序列）/ `test-docker-compose-config.ps1`（删断言）/ `deploy-defaults.ps1` / `test-deploy-defaults.ps1` / `test-health-check-docker-appliance.ps1` |
| .env.example | `MIST_MONITORING_*` / `PROMETHEUS_IMAGE` / `GRAFANA_*` |

### D6. 孤儿 service 删除（审计发现）

shrink 时"保留给 whitebox 重建"的 service，现在 whitebox 方案变为 OTel，永久死掉：

**RealtimeCandleHealthService**（`realtime-candle-health.service.ts`）：
- `observe()` 的唯一调用者是已删的诊断 controller（`RealtimeCandleDiagnosticController`）
- 零生产调用者——完全孤儿
- 删除范围：service + types + spec + module 注册

**RealtimeMarketObservabilityService**（`realtime-market-observability.service.ts`）：
- 读取端（`quantityRejectionObservations()` / `pruneQuantityRejections()`）只被死掉的 health service 调用
- 写入端（`recordQuantityRejection`）在 `sources/tdx/realtime.client.ts` 和 `sources/qmt/realtime.client.ts` 里调用
- 删读取端后，写入端变成只写不读的 zombie sink——一并删除写入端调用
- 删除范围：service + spec + module 注册 + realtime client 里的 `recordQuantityRejection` 调用

**注意**：删除 realtime client 里的 `recordQuantityRejection` 调用是**改业务代码**——converter throw 路径里的 quantity 校验记录逻辑被移除。这不影响转换本身（converter 照常 throw `converterError` reject），只是不再单独记录 quantity rejection 这个子分类。

### D7. 死 workflow + 残留清理

- `retire-windows-monitoring-exporter.yml`：这个 workflow 是退役 legacy WinSW host exporter（`mist-windows-exporter-service.exe`），不是 docker monitoring 容器。但端口 9109 概念在 O0 后完全消失，这个 workflow 的默认端口参数过时。如果 legacy WinSW exporter 已退役则 workflow 完全死；否则仅端口默认值过时——O0 删除此 workflow（如需退役可重建）。
- `inspect-windows-monitoring-runtime.yml`：检查谁占端口 9109 的诊断工具。O0 后无服务监听 9109——完全死。
- `deploy-defaults.ps1` 的 `MonitoringTdxRealtimeHealthUrl` / `MonitoringQmtRealtimeHealthUrl`：pre-shrink 的 exporter 探测目标，shrink 后已 vestigial，O0 后完全死。

### D8. 部署硬依赖

部署后需要验证 OpenObserve 可达 + 收到遥测数据：
- `curl http://127.0.0.1:5080/web/healthz` → 200
- 各服务启动后能在 OpenObserve UI 看到 trace（auto-instrumentation 的 HTTP 请求）
- health-check-docker-appliance.ps1 加 OpenObserve 存活断言（替代原 monitoring 断言）

## 影响链

```
mist 仓
  ├── package.json +6 依赖（OTel SDK）
  ├── libs/otel/src/otel-bootstrap.ts（新建，共享初始化）
  ├── apps/mist/src/main.ts（头部加 initOtel）
  ├── apps/signal/src/main.ts（同）
  ├── apps/backtest/src/main.ts（同）
  ├── apps/chan/src/main.ts（同）
  ├── apps/schedule/src/main.ts（同）
  └── apps/realtime-subscription-hil/src/main.ts（同）

mist-datasource 仓
  ├── pyproject.toml +3 依赖（OTel Python）
  └── 不改源码（方式 A：compose command 加 opentelemetry-instrument 前缀）

mist-deploy 仓
  ├── docker/compose.yaml（+openobserve service，-monitoring/-prometheus/-grafana）
  ├── docker/nginx/templates/default.conf.template（删 /grafana/）
  ├── docker/.env.example（删旧 env，+openobserve env）
  ├── docker/monitoring/ → 删
  ├── docker/prometheus/ → 删
  ├── docker/grafana/ → 删
  ├── scripts/deploy-observability.ps1 → 删
  ├── scripts/deploy-monitoring.ps1 → 删
  ├── scripts/test-deploy-monitoring.ps1 → 删
  ├── scripts/deploy-docker-appliance.ps1 → 删启动序列 + 加 openobserve
  ├── scripts/test-docker-compose-config.ps1 → 删断言 + 加 openobserve 断言
  ├── scripts/common/deploy-defaults.ps1 → 删 9109 默认 + 加 openobserve 默认
  ├── scripts/test-deploy-defaults.ps1 → 同
  ├── scripts/test-health-check-docker-appliance.ps1 → 删 monitoring 断言
  ├── .github/workflows/deploy-observability-stack.yml → 删
  └── .github/workflows/deploy-windows-monitoring.yml → 删
```

## 边界

### O0 不定义任何 mist_* 自定义指标

O0 只做基础设施接入（auto-instrumentation + OpenObserve）。`mist_realtime_candle_sealed_total`
等自定义指标的定义和 span 埋点全部留给 O1-O2。O0 完成后 OpenObserve 里只能看到
auto-instrumentation 产出的标准指标（HTTP 请求量/延迟、进程指标、Redis 调用等）和标准追踪
（HTTP/gRPC/Redis span）。

### mist-monitoring 仓代码不删

exporter 的 Go 代码保留在 mist-monitoring 仓（后续可能完全 archive 这个仓）。
本 change 只停部署它的容器。

### logs 不改

日志继续走 stdout + Docker 自然收集。OpenObserve 能收 OTLP logs 但 O0 不接入——
日志收集留给后续（如果要加的话）。

### realtime-subscription-hil 脚本

这个 app 不是 NestJS（是 Node 脚本调函数），OTel 初始化方式不同——直接在文件头
`import { initOtel } from '...'` + `initOtel('realtime-subscription-hil')`。
