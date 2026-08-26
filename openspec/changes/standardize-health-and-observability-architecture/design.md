# Design: Health 端点契约与 Observability 目录架构统一设计

## 1. 架构总览

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          libs/observability                             │
│  - BaseHealthVo (status, service, instance, timestamp)                 │
│  - MetricRegistryUtils (createIdempotentMetricRegistration, labels)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ implements / extends
        ┌───────────────────────────┴───────────────────────────┐
        ▼                                                       ▼
┌───────────────────────────────┐               ┌───────────────────────────────┐
│     apps/<app>/src/health/    │               │  apps/<app>/src/observability │
│  - health.controller.ts       │               │  - metrics.ts                 │
│  - health.vo.ts               │               │  - runtime-observability.ts   │
│  - health-state.service.ts    │               └───────────────┬───────────────┘
└───────────────┬───────────────┘                               │
                │                                               ▼
                │ (Raw JSON, bypassed Envelope)           OTel Meter Export
                ▼                                               ▼
        GET /health                                      OpenObserve Stream
 (Docker / Pre-Market / Humans)                       (mist_<subsystem>_* metrics)

 ─────────────────────────────────────────────────────────────────────────────
        apps/<app>/src/app.controller.ts  ──►  GET /app/hello (Liveness Ping)
```

## 2. 端点职责与协议规范

### 2.1 `GET /app/hello` — 轻量级存活性与网关冒烟探针
- **Owner**: `apps/<app>/src/app.controller.ts`
- **定位**: 基础 Liveness Probe，验证 Node.js 进程、HTTP Event Loop 与 Web Gateway 反代链路存活性。
- **返回类型**: `string`（如 `'Hello World!'` 或 `'mist-backend alive'`）。
- **使用场景**:
  - `mist-deploy` 部署脚本在变更配置前后的前置连通性确认；
  - Web 网关 `80` 端口反向代理路径冒烟（`/api/mist/app/hello`、`/api/chan/app/hello`）；
  - 不需要加载或查询任何下游数据库/Redis 依赖。

### 2.2 `GET /health` — 结构化运行时状态与可观测性快照
- **Owner**: `apps/<app>/src/health/health.controller.ts`
- **定位**: 深度 Readiness / Switch / Diagnostics Probe。
- **返回格式**: **纯净 Raw JSON**（在 `HttpResponseInterceptor` 中豁免 Envelope 包装）。
- **基础契约定义（`libs/observability/src/base-health.vo.ts`）**:
  ```typescript
  export type HealthStatus = 'ok' | 'degraded' | 'error';

  export interface BaseHealthVo {
    readonly status: HealthStatus;
    readonly service: string;    // 标准服务名: 'mist-backend' | 'backtest' | 'signal' | 'notification' | 'chan' | 'schedule'
    readonly instance: string;   // 双写兼容字段: 'backend' | 'backtest' | 'signal' | 'notification' | 'chan' | 'schedule'
    readonly timestamp: string;  // ISO 8601 UTC
    readonly version?: string;
  }
  ```

## 3. 各子 App 统一目录布局与文件命名

全仓 6 个应用统一遵循以下结构（完全对称，消除 `<app>-` 前缀冗余）：

```text
apps/<app>/src/
├── app.controller.ts              # GET /app/hello (统一 Liveness)
├── app.controller.spec.ts
├── <app>-app.module.ts (或 app.module.ts)
├── main.ts
├── health/                        # 深度健康目录
│   ├── health.controller.ts       # GET /health 控制器
│   ├── health.controller.spec.ts
│   ├── health.vo.ts               # 继承 BaseHealthVo 的 App 专属 VO
│   └── health-state.service.ts    # 进程内可变状态累加器 (backtest/signal 等 stateful app 按需配置)
└── observability/                 # 可观测性与 OTel 指标目录
    ├── metrics.ts                 # OTel Meter 注册与 Gauge 回调
    ├── metrics.spec.ts
    └── runtime-observability.service.ts # 进程性能/GC/内存采样 (signal 等按需配置)
```

### 各 App 的 Health VO 扩展明细：

1. **`mist` (`apps/mist`)**:
   - `service`: `'mist-backend'`, `instance`: `'backend'`
   - 字段: `productizationMode`, `strategyMode`, `redisAvailable`, `allowlistCount`
2. **`backtest` (`apps/backtest`)**:
   - `service`: `'backtest'`, `instance`: `'backtest'`
   - 字段: `backtest: { ready, state, activeCount, waitingCount, concurrency, queueCapacity, observations }`
3. **`signal` (`apps/signal`)**:
   - `service`: `'signal'`, `instance`: `'signal'`
   - 字段: `realtimeMode`, `registry`, `marketData`, `queue`, `evaluation`, `runtime`
4. **`notification` (`apps/notification`)**:
   - `service`: `'notification'`, `instance`: `'notification'`
   - 字段: `channels`, `queueDepth`, `deliveryTotals`
5. **`chan` (`apps/chan`)**:
   - `service`: `'chan'`, `instance`: `'chan'`
   - 字段: `algorithmVersion` (4), `cacheReady`
6. **`schedule` (`apps/schedule`)**:
   - `service`: `'schedule'`, `instance`: `'schedule'`
   - 字段: `timezone`, `lastInspectionSummary`, `cronActive`

## 4. HttpTransportModule 的 Raw JSON 豁免设计

在 `libs/transport/src/http` 中：
- 增加元数据装饰器 `@RawResponse()`（或在 `HttpResponseInterceptor` 中直接判定请求路径为 `/health`）。
- 当请求为 `GET /health` 或包含 `@RawResponse()` 时，直接透传 Controller 返回的 JSON 对象，不封装 `success/statusCode/message/data`。
- 保证 `apps/schedule` 盘前检查无需做 `body['data'] ?? body` 兼容，全栈微服务健康响应统一为一等公民。

## 5. OpenObserve 指标与 OTel 集成

1. **指标流命名绝对守恒**：
   - 现存关键 OTel 指标名与 Label 结构严格保持不变：
     - `mist_candle_*`（`sealed_total`, `skip_total`, `discard_total` 等）
     - `mist_backtest_*`（`ready`, `active_runs`, `waiting_runs`, `run_total` 等）
     - `mist_delivery_*`, `mist_oo_alert_*`
     - `mist_startup_compensation_total`
     - `mist_realtime_subscription_*`
2. **新增缺失 OTel 指标**：
   - `apps/signal/src/observability/metrics.ts`：注册 `mist_signal_ready`、`mist_signal_evaluation_total`、`mist_signal_queue_active`。
   - `apps/schedule/src/observability/metrics.ts`：注册 `mist_schedule_inspection_status`、`mist_schedule_job_total`。
   - `apps/chan/src/observability/metrics.ts`：注册 `mist_chan_calculation_total`。

## 6. Docker Compose 健康检查标准化

更新 `mist-deploy/docker/compose.yaml`：
- `mist-backend`: `test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:8001/health >/dev/null || exit 1"]`
- `chan-api`: `test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:8008/health >/dev/null || exit 1"]`
- `schedule`: `test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:8003/health >/dev/null || exit 1"]`（彻底废除 404 Hack）
- `backtest`, `signal`, `notification`: 维持 `/health` 并对齐一致的 curl/fetch 校验逻辑。

## 7. 依赖配置与死代码清理规范

### 7.1 Monorepo 依赖与编译配置同步
1. **`tsconfig.json`**:
   - 增加 `@app/observability` 与 `@app/observability/*` 路径映射指向 `libs/observability/src`。
2. **`nest-cli.json`**:
   - 正式注册 `observability` library 项目（`root: "libs/observability"`, `sourceRoot: "libs/observability/src"`）；
   - 清理未实际落地的历史残留 `"otel"` library 条目，避免 monorepo 编译混乱。
3. **`apps/build:docker` & `package.json`**:
   - 保证所有新增/迁移的 app 和 lib 在 `nest build` 时被正确引入。

### 7.2 死代码与历史旧文件清理清单
迁移至标准两级目录后，必须彻底删除以下旧文件并更新全量引用：
1. **`apps/mist`**:
   - 删除 `src/health/app-health.controller.ts`、`src/health/app-health.vo.ts`、`src/health/app-health.controller.spec.ts`；
   - 替换为 `src/health/health.controller.ts`、`src/health/health.vo.ts`、`src/health/health.controller.spec.ts`。
2. **`apps/backtest`**:
   - 删除平铺旧文件 `src/backtest-health.controller.ts`、`src/backtest-health.vo.ts`、`src/backtest-health-state.service.ts` 及 spec；
   - 删除旧 `src/observability/backtest-metrics.ts`，重命名为 `src/observability/metrics.ts`。
3. **`apps/signal`**:
   - 删除平铺旧文件 `src/signal-health.controller.ts`、`src/signal-health.vo.ts`、`src/signal-health-state.service.ts`；
   - 移动 `src/signal-runtime-observability.service.ts` 至 `src/observability/runtime-observability.service.ts`。
4. **`apps/notification`**:
   - 删除平铺旧文件 `src/notification-health.controller.ts`；
   - 清理 `src/observability/` 内冗余平铺文件，统一由 `metrics.ts` 导出。
5. **`apps/chan`**:
   - 将原 `src/health.controller.ts` 改造为 `src/app.controller.ts` 并清理旧引用。
6. **全仓 Import 路径清理**:
   - 全量搜索已迁移的文件路径，更新所有 controller/service/test 内部 import，确保零废弃代码与零无效引用残留。

