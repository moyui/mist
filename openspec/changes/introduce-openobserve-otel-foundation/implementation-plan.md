# O0 实施计划：introduce-openobserve-otel-foundation

> 代码级实施计划（三步流程第二步）。spec 已确认，本计划细化到文件/函数/测试/验证命令。
> 基于 2026-08-09 社区调研（novu / booking-microservices / idempo / SBTM / zenml /
> allenai / Azure contoso）修正，采用社区主流模式。
> 实施计划确认通过后才落地。

---

## 1. mist 仓：libs/otel 共享库（社区函数式模式）

### 1.1 依赖（声明在 libs/otel 的 package.json，同一 release train 0.221.0）

⚠️ OTel JS 正在版本分裂：api 1.9.x / SDK 0.221.0 / resources 2.10.0。
**所有 SDK 家族包必须钉在同一 release train（0.221.0）**，混装会 instrumentation/exporter 不匹配。

```json
{
  "dependencies": {
    "@opentelemetry/sdk-node": "^0.221.0",
    "@opentelemetry/auto-instrumentations-node": "^0.79.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.221.0",
    "@opentelemetry/exporter-metrics-otlp-http": "^0.221.0",
    "@opentelemetry/sdk-metrics": "^0.221.0",
    "@opentelemetry/resources": "^2.10.0",
    "@opentelemetry/semantic-conventions": "^1.31.0"
  }
}
```

**apps 不声明 OTel 依赖**——整个栈只在 libs/otel。

### 1.2 libs/otel 文件结构（SBTM `libs/common` 模式）

```
libs/otel/
├── package.json          # 声明全部 OTel 依赖（1.1）
├── tsconfig.lib.json
├── tsconfig.spec.json
├── index.ts              # 导出 initTelemetry / shutdownTelemetry
└── src/
    ├── index.ts
    ├── otel.ts           # 核心实现
    └── otel.spec.ts
```

**`src/otel.ts`**：

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

export interface InitTelemetryOptions {
  serviceName: string;
  serviceVersion?: string;
}

let sdk: NodeSDK | null = null;

/**
 * 初始化 OTel SDK。必须在 NestFactory.create 之前调用。
 *
 * 社区函数式模式（idempo/SBTM/booking）：
 * - no-op guard：未配置 OTEL_EXPORTER_OTLP_ENDPOINT 时静默跳过（本地开发/CI 不炸）
 * - serviceName 参数化，不硬编码
 * - endpoint/auth 从 OTEL_EXPORTER_OTLP_ENDPOINT / OTEL_EXPORTER_OTLP_HEADERS 读
 */
export function initTelemetry({ serviceName, serviceVersion = 'dev' }: InitTelemetryOptions): void {
  if (sdk) return; // 幂等
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return; // no-op guard

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();

  process.on('SIGTERM', () => { void shutdownTelemetry(); });
  process.on('SIGINT', () => { void shutdownTelemetry(); });
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) return;
  const current = sdk;
  sdk = null;
  await current.shutdown();
}
```

**注意**：
- `NodeSDK` 只在提供 `metricReader` 时注册全局 MeterProvider（SDK 源码验证）——必须加
- `OTLPTraceExporter()` 无参构造自动从 env 读 endpoint + headers（OTel 标准协议）
- no-op guard 是社区标准（SBTM `initTracing` 和 zenml `configure_otel` 都这么做）

**测试 `src/otel.spec.ts`**：

```typescript
describe('initTelemetry', () => {
  it('未配置 endpoint 时静默跳过（no-op guard）', () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    expect(() => initTelemetry({ serviceName: 'test' })).not.toThrow();
    expect(() => shutdownTelemetry()).not.toThrow();
  });
  it('配置 endpoint 时正常初始化 + 幂等', () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:5080';
    expect(() => initTelemetry({ serviceName: 'test' })).not.toThrow();
    expect(() => initTelemetry({ serviceName: 'test-again' })).not.toThrow(); // 幂等
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  });
});
```

### 1.3 注册进 nest-cli.json

`nest-cli.json` 的 `projects` 加 `otel`（参照 `libs/config` 的配置），否则 tsc 编译不到。

---

## 2. mist 仓：6 个 app main.ts 接入

每个 main.ts：`initTelemetry` 调用放 `NestFactory.create` 之前（booking 模式）：

```typescript
import { initTelemetry } from '@app/otel';
// ... 其他 import
async function bootstrap() {
  initTelemetry({ serviceName: 'mist-backend' }); // 在 create 之前
  const app = await NestFactory.create(AppModule);
  ...
}
bootstrap();
```

| app | serviceName |
|---|---|
| `apps/mist/src/main.ts` | `mist-backend` |
| `apps/signal/src/main.ts` | `signal` |
| `apps/backtest/src/main.ts` | `backtest` |
| `apps/chan/src/main.ts` | `chan-api` |
| `apps/schedule/src/main.ts` | `schedule` |
| `apps/realtime-subscription-hil/src/main.ts` | `realtime-subscription-hil` |

**注意 realtime-subscription-hil**：纯 Node 脚本（非 NestJS），确认 `@app/otel` 在
tsconfig paths 里可用；不行用相对路径 import。

**覆盖范围预期**（社区验证，写进测试/验证）：
- ✅ HTTP 请求自动 span（`instrumentation-http` + `undici`）
- ✅ NestJS controller 自动 span（`instrumentation-nestjs-core`，支持 NestJS 4-11，
  `<Controller>.<method>` span）
- ✅ ioredis（`instrumentation-ioredis`，ioredis 5.x）——⚠️ `requireParentSpan` 默认 true，
  后台任务无 parent span 时不建 span
- ✅ MySQL（`instrumentation-mysql2`）
- ❌ `@nestjs/microservices` TCP transport——**无官方 instrumentation**，signal/backtest
  的 TCP RPC 无自动 span（O1 手动 span 范围）

---

## 3. mist-datasource 仓：Python OTel（zenml 模式）

### 3.1 pyproject.toml

```toml
dependencies = [
    ...existing,
    "opentelemetry-sdk>=1.44.0",
    "opentelemetry-exporter-otlp-proto-http>=1.44.0",
    "opentelemetry-instrumentation-fastapi>=0.65.0",
]
```

安装：`uv sync`。**不用 `opentelemetry-distro`**（CLI 方式不需要）。

### 3.2 新建 `src/core/otel.py`（zenml 独立模块模式）

```python
"""OpenTelemetry 初始化（zenml 模式：独立模块 + 入口调用）。

设计：
- no-op guard：未配置 OTEL_EXPORTER_OTLP_ENDPOINT 时跳过（本地/测试零开销）
- 幂等：模块级 _configured 标志
- instrument_app 留在入口（需要 app 实例，必须在第一个请求前调用）
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

_configured = False


def configure_otel(app: FastAPI, service_name: str) -> None:
    """在 app 创建后、第一个请求前调用。未配置 endpoint 时 no-op。"""
    global _configured
    if _configured:
        return
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        return

    resource = Resource.create({"service.name": service_name})

    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)

    metric_reader = PeriodicExportingMetricReader(OTLPMetricExporter())
    meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    metrics.set_meter_provider(meter_provider)

    FastAPIInstrumentor.instrument_app(app)
    _configured = True


def shutdown_otel() -> None:
    """lifespan shutdown 时调用。"""
    global _configured
    _configured = False
```

### 3.3 入口接入

`tdx/main.py`：
```python
app = create_tdx_app()
configure_otel(app, "tdx-datasource")   # app 创建后模块级调用
```

`qmt/main.py`：
```python
app = create_qmt_app()
configure_otel(app, "qmt-datasource")
```

**覆盖范围预期**（社区验证）：
- ✅ HTTP 请求自动 span（ASGI middleware）
- ✅ WebSocket 连接 span（`scope["type"] in ("http","websocket")` 都建）——⚠️ WS 无
  HTTP duration 指标（只记 span）
- ✅ 自动 OTel metrics（`http.server.duration` 等，经 OTLP 出）
- 单 worker uvicorn = 安全（无多进程问题，zenml 的顾虑不适用）

### 3.4 单测 `tests/unit/test_otel.py`

```python
def test_configure_otel_noop_without_endpoint(monkeypatch):
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    from fastapi import FastAPI
    from src.core.otel import configure_otel
    app = FastAPI()
    configure_otel(app, "test")  # 不 throw

def test_configure_otel_idempotent(monkeypatch):
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:5080")
    from fastapi import FastAPI
    from src.core.otel import configure_otel
    app = FastAPI()
    configure_otel(app, "test")
    configure_otel(app, "test-again")  # 幂等
```

---

## 4. mist-deploy 仓：compose.yaml 改动

### 4.1 加 openobserve service（design D1 不变）

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

### 4.2 删 monitoring / prometheus / grafana service block + web-gateway grafana 依赖 + 2 volume

（design D5 不变）

### 4.3 各 NestJS service（backend/signal/backtest/chan）加 OTel env

```yaml
OTEL_EXPORTER_OTLP_ENDPOINT: http://openobserve:5080
OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Basic ${OO_OTLP_AUTH_BASE64}"
```

### 4.4 datasource 加 OTel env

```yaml
OTEL_EXPORTER_OTLP_ENDPOINT: http://openobserve:5080
OTEL_EXPORTER_OTLP_HEADERS: "Authorization=Basic ${OO_OTLP_AUTH_BASE64}"
```

**compose command 不改**——OTel 在 Python 代码里初始化（方式 B）。

### 4.5 nginx template 删 /grafana/ + .env.example 更新

（design D5 不变；.env.example 加 OO_OTLP_AUTH_BASE64 计算方式）

---

## 5. mist-deploy 仓：脚本/workflow 清理

（与原计划一致，含审计 9 项缺口——见 design D5/D7）

---

## 6. mist 仓：孤儿 service 删除

（与原计划一致，见 design D6）

---

## 7. mist 仓：openspec 清理

（与原计划一致）

---

## 8. mist-datasource 仓：mock 环境适配

（与原计划一致，但 mock-verify.sh 改为 curl OpenObserve 验证 OTLP ingestion）

---

## 9. 验证命令（task 10）

```bash
# mist 仓
cd mist && pnpm typecheck && pnpm test && pnpm test:ci

# mist-datasource
cd mist-datasource && uv run ruff check . && uv run pytest tests/ -m "not live" -x

# mist-deploy（38 个测试脚本，pwsh-preview 全量跑法）
cd mist-deploy && pwsh-preview -NoProfile -Command '...'

# openspec
cd mist && openspec validate introduce-openobserve-otel-foundation --strict

# mock 环境
cd mist-datasource/tools/mock-env && ./run-mock.sh && ./mock-verify.sh
```

---

## 10. 提交（task 11）

| 仓 | 分支 | 内容 |
|---|---|---|
| mist | `feat/otel-openobserve-foundation` | libs/otel + main.ts ×6 + 孤儿 service 删除 + openspec 清理 |
| mist-datasource | `feat/otel-openobserve-foundation` | pyproject + src/core/otel.py + 2 入口 + mock-env 适配 |
| mist-deploy | `feat/otel-openobserve-foundation` | compose + 脚本/workflow 清理 + openobserve |
| mist-monitoring | master 直接提交 | 删 whitebox-part-two-plan.md |

不合并 master。全部验证通过后统一合并 + 部署（含 OO 首次部署验证）。

---

## 风险与注意（社区调研后的更新）

1. **OTel JS 版本分裂**：api 1.9.x / SDK 0.221.0 / resources 2.10.0——所有 SDK 包钉 0.221.0。
2. **TCP microservice 无自动 span**：signal/backtest 的 TCP RPC 是 O1 手动 span 范围，O0 不覆盖。
3. **ioredis requireParentSpan 默认 true**：后台任务（如 finalizer 写 Redis）无 parent span 时
   不建 span——O1 手动 span 会提供 parent，O0 里后台链路看不到 Redis span 是预期。
4. **Python 不用 CLI 方式**：zenml 明确 CLI 与 uvicorn reload/workers 不兼容；代码方式（方式 B）
   是主流。compose command 不改。
5. **WebSocket 有 span 无 duration 指标**：datasource 的 WS 连接可追踪，但无 HTTP 指标。
6. **OpenObserve OTLP 端口 5080 非标准**：`OTEL_EXPORTER_OTLP_ENDPOINT=http://openobserve:5080`，
   OTel SDK 自动拼 `/v1/traces` / `/v1/metrics`。
7. **realtime-subscription-hil 的 @app/otel import 路径**：确认 tsconfig paths 覆盖；
   不行用相对路径。
8. **node -r / --import 预加载方式不用**：webpack 构建下单文件，main.ts 顶部调用是
   booking/SBTM 社区模式，足够。
