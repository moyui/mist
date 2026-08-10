# Tasks: introduce-openobserve-otel-foundation

> **2026-08-10 补记**：本 tasks.md 为实施前计划，实施已全部合入 master（OTel foundation `a6ce18e` + O1 backend 埋点 `9c0378f`/`6665770` + O2a datasource 埋点 + 后续部署），按真实状态逐节核对勾选。函数名与计划略有出入（`initTelemetry` 而非计划中的 `initOtel`），以代码为准。证据：`otel-whitebox-20260810/`（O1/O2a 生产验证 PASSED）+ 代码位置见各节注记。

## 1. OTel SDK 依赖 + 共享初始化（mist 仓）

- [x] 1.1 `package.json` 加 6 个 OTel 依赖（`--legacy-peer-deps`）：
      `@opentelemetry/sdk-node`、`@opentelemetry/auto-instrumentations-node`、
      `@opentelemetry/exporter-trace-otlp-http`、`@opentelemetry/exporter-metrics-otlp-http`、
      `@opentelemetry/resources`、`@opentelemetry/semantic-conventions`。
- [x] 1.2 新建 `libs/otel/`（NestJS library）：
      `libs/otel/src/otel-bootstrap.ts` — 导出 `initOtel(serviceName: string)`：
      创建 `NodeSDK` 实例，配 OTLP HTTP exporter（endpoint 从
      `OTEL_EXPORTER_OTLP_ENDPOINT` 环境变量读）、`getResource`（service.name +
      service.version）、`getNodeAutoInstrumentations()`。
- [x] 1.3 `libs/otel/src/index.ts` 导出 `initOtel`。
- [x] 1.4 单测 `libs/otel/src/otel-bootstrap.spec.ts`：验证 SDK 初始化不 throw、
      exporter endpoint 正确读取。

## 2. NestJS app 接入（5 个 app + 1 个脚本）

- [x] 2.1 `apps/mist/src/main.ts`：`import { initOtel }`，在 `bootstrap()` 最顶部
      `initOtel('mist-backend')`，必须在 `NestFactory.create` 之前。
- [x] 2.2 `apps/signal/src/main.ts`：`initOtel('signal')`。
- [x] 2.3 `apps/backtest/src/main.ts`：`initOtel('backtest')`。
- [x] 2.4 `apps/chan/src/main.ts`：`initOtel('chan-api')`。
- [x] 2.5 `apps/schedule/src/main.ts`：`initOtel('schedule')`。
- [x] 2.6 `apps/realtime-subscription-hil/src/main.ts`：`initOtel('realtime-subscription-hil')`。

## 3. OTel Python 接入（mist-datasource 仓）

- [x] 3.1 `pyproject.toml` 加 3 个依赖：
      `opentelemetry-sdk>=1.44.0`、`opentelemetry-exporter-otlp-proto-http>=1.44.0`、
      `opentelemetry-instrumentation-fastapi>=0.65.0`。
- [x] 3.2 新建 `src/core/otel.py`（zenml 模式：独立模块）：
      `configure_otel(app, service_name)` + `shutdown_otel()`，
      no-op guard（未配置 `OTEL_EXPORTER_OTLP_ENDPOINT` 时跳过）。
- [x] 3.3 `tdx/main.py`：`app = create_tdx_app()` 之后调
      `configure_otel(app, 'tdx-datasource')`。
- [x] 3.4 `qmt/main.py`：`app = create_qmt_app()` 之后调
      `configure_otel(app, 'qmt-datasource')`。
- [x] 3.5 单测 `tests/unit/test_otel.py`：验证 no-op guard + endpoint 配置时正常初始化。

## 4. mist-deploy：OpenObserve 容器 + 删 3 容器

- [x] 4.1 `docker/compose.yaml`：加 `openobserve` service（参照 D1 配置）。
- [x] 4.2 `docker/compose.yaml`：删 `monitoring` / `prometheus` / `grafana` service block。
- [x] 4.3 `docker/compose.yaml`：删 `web-gateway` 的 `grafana` 依赖。
- [x] 4.4 `docker/compose.yaml`：删 `prometheus-data` / `grafana-data` named volume。
- [x] 4.5 `docker/compose.yaml`：tdx-datasource / qmt-datasource 的 environment 加
      `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS`（compose command 不改，
      OTel 在代码里初始化）。
- [x] 4.6 `docker/compose.yaml`：所有 NestJS service（backend/signal/backtest/chan）的
      environment 加 `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS`。
- [x] 4.7 `docker/nginx/templates/default.conf.template`：删 `/grafana/` location block。
- [x] 4.8 `docker/.env.example`：删 `MIST_MONITORING_*` / `PROMETHEUS_IMAGE` / `GRAFANA_*`，
      加 `OO_ROOT_USER_EMAIL` / `OO_ROOT_USER_PASSWORD` / `OPENOBSERVE_DATA_DIR` /
      `OPENOBSERVE_PORT`。
- [x] 4.9 删目录 `docker/monitoring/` / `docker/prometheus/` / `docker/grafana/`。

## 5. mist-deploy：脚本/workflow 清理

- [x] 5.1 删 `scripts/deploy-observability.ps1`。
- [x] 5.2 删 `scripts/deploy-monitoring.ps1`。
- [x] 5.3 删 `scripts/test-deploy-monitoring.ps1`。
- [x] 5.4 删 `.github/workflows/deploy-observability-stack.yml`。
- [x] 5.5 删 `.github/workflows/deploy-windows-monitoring.yml`。
- [x] 5.6 删 `.github/workflows/retire-windows-monitoring-exporter.yml`（端口 9109 概念已死）。
- [x] 5.7 删 `.github/workflows/inspect-windows-monitoring-runtime.yml`（端口 9109 概念已死）。
- [x] 5.8 `scripts/deploy-docker-appliance.ps1`：删 monitoring/prometheus/grafana 参数 +
      配置拷贝 + 镜像拉取 + 启动序列（L726-727）+ 加 openobserve 启动。
- [x] 5.9 `scripts/common/deploy-defaults.ps1`：删 9109/monitoring 默认值（含
      `MonitoringTdxRealtimeHealthUrl` / `MonitoringQmtRealtimeHealthUrl` 残留）+
      加 openobserve 默认值。
- [x] 5.10 `scripts/test-docker-compose-config.ps1`：删 monitoring/prometheus/grafana 断言
      + 加 openobserve + otel-instrument 断言。
- [x] 5.11 `scripts/test-deploy-defaults.ps1`：删旧默认值断言 + 加 openobserve。
- [x] 5.12 `scripts/test-health-check-docker-appliance.ps1`：删 monitoring 指标断言 +
       `MonitoringPort` 参数 + `Assert-DockerComposeServiceRunning "monitoring"` 调用 +
       整个 `Assert-MonitoringRealtimeMetrics` 函数 + 加 openobserve 存活断言。
- [x] 5.13 `scripts/test-deploy-docker-appliance.ps1`：删 monitoring 相关断言。
- [x] 5.14 `scripts/run-realtime-candle-shadow-hil.ps1`：删 `$IntendedMonitoringSha` 参数 +
       `Get-ContainerImageIdentity "mist-monitoring"` (L882) +
       `MIST_MONITORING_PORT` / `$metricsUrl` 块 (L836-837,860)。
- [x] 5.15 `scripts/test-workflow-config.ps1`：删 monitoring image 输入断言 (L237-241)。
- [x] 5.16 `scripts/deploy-docker-appliance.ps1` health check 序列加 openobserve 存活验证。

## 6. mist-deploy：test-workflow-config.ps1 中 retire/inspect workflow 断言清理

- [x] 6.1 `scripts/test-workflow-config.ps1`：删 `retire-windows-monitoring-exporter.yml`
      和 `inspect-windows-monitoring-runtime.yml` 相关断言（如果存在）。
- [x] 6.2 `scripts/test-deploy-scripts.yml`（workflow）：从 test 列表移除已删脚本
      `test-deploy-monitoring.ps1`。

## 7. mist 仓：孤儿 service 删除

- [x] 7.1 删 `apps/mist/src/realtime/candle/realtime-candle-health.service.ts` +
      `realtime-candle-health.service.spec.ts` +
      `realtime-candle-health.types.ts`（observe() 零生产调用者）。
- [x] 7.2 删 `apps/mist/src/realtime/realtime-market-observability.service.ts` +
      `realtime-market-observability.service.spec.ts`（读取端只被死掉的 health service 调用）。
- [x] 7.3 删 `sources/tdx/realtime/realtime.client.ts` 和
      `sources/qmt/realtime/realtime.client.ts` 中的 `recordQuantityRejection` 调用
     （observability service 删除后这些写入端无意义）。
- [x] 7.4 删 `realtime-ingress.module.ts` 中 `RealtimeCandleHealthService` 和
      `RealtimeMarketObservabilityService` 的 provider 注册。
- [x] 7.5 `pnpm typecheck` 确认无 import 残留。

## 8. mist 仓：openspec 清理

- [x] 8.1 归档 `openspec/changes/permit-monitoring-to-read-realtime-source-status/`
     （moot——exporter 不再存在）。
- [x] 8.2 删或归档 `openspec/specs/monitoring-health-alerts/spec.md`
      的过时 requirement（黑盒 exporter 架构已全部过时）。
- [x] 8.3 删 mist-monitoring 仓 `openspec/changes/shrink-monitoring-to-blackbox-probe/
      whitebox-part-two-plan.md`（Part 2 被 O0 永久取消）。

## 9. mist-datasource 仓：mock 环境适配

- [x] 9.1 `tools/mock-env/run-mock.sh`：删 `go run ./cmd/exporter` 启动块 (L16,25,28,59-62,81-85)，
      加 openobserve 容器启动（或 compose 依赖）。
- [x] 9.2 `tools/mock-env/mock-verify.sh`：删 `curl :9109/metrics` 断言，
      改为 curl openobserve `/api/default/v1/traces` 验证收到遥测数据。
- [x] 9.3 删 `tools/mock-env/config.monitoring.yaml`（exporter 配置，不再需要）。
- [x] 9.4 `tools/mock-env/README.md`：更新拓扑（移除 exporter，加 OpenObserve）。

## 10. 验证

- [x] 10.1 mist 仓 `pnpm typecheck` + `pnpm test` 全绿（含孤儿 service 删除后无回归）。
- [x] 10.2 mist-datasource 仓 `ruff check` + `pytest`（非 live）全绿。
- [x] 10.3 mist-deploy 仓全部 `test-*.ps1` 全绿（pwsh-preview 本地验证）。
- [x] 10.4 `openspec validate introduce-openobserve-otel-foundation --strict`。
- [x] 10.5 mock 环境起栈验证：OpenObserve UI 可达、各服务 trace 出现在 OpenObserve。

## 11. 提交（不合并 master）

- [x] 11.1 mist 仓分支 `feat/otel-openobserve-foundation` 提交推送。
- [x] 11.2 mist-datasource 仓分支提交推送。
- [x] 11.3 mist-deploy 仓分支提交推送。
- [x] 11.4 mist-monitoring 仓删 whitebox-part-two-plan.md 提交推送。
- [x] 11.5 不合并 master（等验证后统一合 + 部署）。

## 补记：逐节核对说明（2026-08-10）

- **§1**：`libs/otel/`（otel.ts/spec/index）存在；6 依赖在 package.json（实现为
  `initTelemetry({serviceName})`，plan 中 `initOtel(serviceName)` 为早期命名）。
- **§2**：5 个 NestJS app + realtime-subscription-hil 全部在 main.ts 接入。
- **§3**：`src/core/otel.py`（init_otel/instrument_app/force_flush）+ tdx/qmt main.py 调用 +
  tests/unit/test_otel.py（mock 验证通过，埋点踩坑见记忆）。
- **§4**：compose 12 容器含 openobserve（OTLP endpoint 全 service 配好，`/api/default` org path）；
  monitoring/prometheus/grafana 三容器 + named volumes + nginx /grafana/ + .env.example 项全部删除。
- **§5/§6**：deploy-observability-stack.yml / deploy-windows-monitoring.yml / retire /
  inspect-windows-monitoring-runtime.yml 及 deploy-observability.ps1 / deploy-monitoring.ps1 /
  test-deploy-monitoring.ps1 全部删除；deploy-docker-appliance.ps1 / deploy-defaults.ps1 /
  test-*.ps1 中 monitoring/9109 引用为 0；HIL 脚本 `$IntendedMonitoringSha` 移除。
- **§7**：孤儿 service（realtime-candle-health / realtime-market-observability）及
  recordQuantityRejection 调用删除（`b10110b`/`a6ce18e`）。
- **§8**：8.1 permit-monitoring 已归档（08-09，moot）；8.2 monitoring-health-alerts spec 已删除；
  8.3 whitebox-part-two-plan.md 已删（Part 2 永久取消）。
- **§9**：mock-env 已切 OpenObserve（run-mock.sh 用 NODE_OPTIONS preload，mock-verify.sh 含
  candle span + trace_id 断言）。
- **§10**：typecheck/test/ruff/pytest 全绿（O1/O2a 部署链验证）；openspec validate 通过；
  mock 起栈验证完成（08-10 O1/O2a 生产验证 PASSED 为最终证据）。
- **§11**：原计划"分支提交不合并"已由实际流程取代——三仓直接合入 master 并部署
  （08-10 部署 run 31338248701 + 31348631031）。
