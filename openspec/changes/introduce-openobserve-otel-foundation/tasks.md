# Tasks: introduce-openobserve-otel-foundation

## 1. OTel SDK 依赖 + 共享初始化（mist 仓）

- [ ] 1.1 `package.json` 加 6 个 OTel 依赖（`--legacy-peer-deps`）：
      `@opentelemetry/sdk-node`、`@opentelemetry/auto-instrumentations-node`、
      `@opentelemetry/exporter-trace-otlp-http`、`@opentelemetry/exporter-metrics-otlp-http`、
      `@opentelemetry/resources`、`@opentelemetry/semantic-conventions`。
- [ ] 1.2 新建 `libs/otel/`（NestJS library）：
      `libs/otel/src/otel-bootstrap.ts` — 导出 `initOtel(serviceName: string)`：
      创建 `NodeSDK` 实例，配 OTLP HTTP exporter（endpoint 从
      `OTEL_EXPORTER_OTLP_ENDPOINT` 环境变量读）、`getResource`（service.name +
      service.version）、`getNodeAutoInstrumentations()`。
- [ ] 1.3 `libs/otel/src/index.ts` 导出 `initOtel`。
- [ ] 1.4 单测 `libs/otel/src/otel-bootstrap.spec.ts`：验证 SDK 初始化不 throw、
      exporter endpoint 正确读取。

## 2. NestJS app 接入（5 个 app + 1 个脚本）

- [ ] 2.1 `apps/mist/src/main.ts`：`import { initOtel }`，在 `bootstrap()` 最顶部
      `initOtel('mist-backend')`，必须在 `NestFactory.create` 之前。
- [ ] 2.2 `apps/signal/src/main.ts`：`initOtel('signal')`。
- [ ] 2.3 `apps/backtest/src/main.ts`：`initOtel('backtest')`。
- [ ] 2.4 `apps/chan/src/main.ts`：`initOtel('chan-api')`。
- [ ] 2.5 `apps/schedule/src/main.ts`：`initOtel('schedule')`。
- [ ] 2.6 `apps/realtime-subscription-hil/src/main.ts`：`initOtel('realtime-subscription-hil')`。

## 3. OTel Python 接入（mist-datasource 仓）

- [ ] 3.1 `pyproject.toml` 加 3 个依赖：
      `opentelemetry-sdk>=1.44.0`、`opentelemetry-exporter-otlp-proto-http>=1.44.0`、
      `opentelemetry-instrumentation-fastapi>=0.65.0`。
- [ ] 3.2 新建 `src/core/otel.py`（zenml 模式：独立模块）：
      `configure_otel(app, service_name)` + `shutdown_otel()`，
      no-op guard（未配置 `OTEL_EXPORTER_OTLP_ENDPOINT` 时跳过）。
- [ ] 3.3 `tdx/main.py`：`app = create_tdx_app()` 之后调
      `configure_otel(app, 'tdx-datasource')`。
- [ ] 3.4 `qmt/main.py`：`app = create_qmt_app()` 之后调
      `configure_otel(app, 'qmt-datasource')`。
- [ ] 3.5 单测 `tests/unit/test_otel.py`：验证 no-op guard + endpoint 配置时正常初始化。

## 4. mist-deploy：OpenObserve 容器 + 删 3 容器

- [ ] 4.1 `docker/compose.yaml`：加 `openobserve` service（参照 D1 配置）。
- [ ] 4.2 `docker/compose.yaml`：删 `monitoring` / `prometheus` / `grafana` service block。
- [ ] 4.3 `docker/compose.yaml`：删 `web-gateway` 的 `grafana` 依赖。
- [ ] 4.4 `docker/compose.yaml`：删 `prometheus-data` / `grafana-data` named volume。
- [ ] 4.5 `docker/compose.yaml`：tdx-datasource / qmt-datasource 的 environment 加
      `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS`（compose command 不改，
      OTel 在代码里初始化）。
- [ ] 4.6 `docker/compose.yaml`：所有 NestJS service（backend/signal/backtest/chan）的
      environment 加 `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS`。
- [ ] 4.7 `docker/nginx/templates/default.conf.template`：删 `/grafana/` location block。
- [ ] 4.8 `docker/.env.example`：删 `MIST_MONITORING_*` / `PROMETHEUS_IMAGE` / `GRAFANA_*`，
      加 `OO_ROOT_USER_EMAIL` / `OO_ROOT_USER_PASSWORD` / `OPENOBSERVE_DATA_DIR` /
      `OPENOBSERVE_PORT`。
- [ ] 4.9 删目录 `docker/monitoring/` / `docker/prometheus/` / `docker/grafana/`。

## 5. mist-deploy：脚本/workflow 清理

- [ ] 5.1 删 `scripts/deploy-observability.ps1`。
- [ ] 5.2 删 `scripts/deploy-monitoring.ps1`。
- [ ] 5.3 删 `scripts/test-deploy-monitoring.ps1`。
- [ ] 5.4 删 `.github/workflows/deploy-observability-stack.yml`。
- [ ] 5.5 删 `.github/workflows/deploy-windows-monitoring.yml`。
- [ ] 5.6 删 `.github/workflows/retire-windows-monitoring-exporter.yml`（端口 9109 概念已死）。
- [ ] 5.7 删 `.github/workflows/inspect-windows-monitoring-runtime.yml`（端口 9109 概念已死）。
- [ ] 5.8 `scripts/deploy-docker-appliance.ps1`：删 monitoring/prometheus/grafana 参数 +
      配置拷贝 + 镜像拉取 + 启动序列（L726-727）+ 加 openobserve 启动。
- [ ] 5.9 `scripts/common/deploy-defaults.ps1`：删 9109/monitoring 默认值（含
      `MonitoringTdxRealtimeHealthUrl` / `MonitoringQmtRealtimeHealthUrl` 残留）+
      加 openobserve 默认值。
- [ ] 5.10 `scripts/test-docker-compose-config.ps1`：删 monitoring/prometheus/grafana 断言
      + 加 openobserve + otel-instrument 断言。
- [ ] 5.11 `scripts/test-deploy-defaults.ps1`：删旧默认值断言 + 加 openobserve。
- [ ] 5.12 `scripts/test-health-check-docker-appliance.ps1`：删 monitoring 指标断言 +
       `MonitoringPort` 参数 + `Assert-DockerComposeServiceRunning "monitoring"` 调用 +
       整个 `Assert-MonitoringRealtimeMetrics` 函数 + 加 openobserve 存活断言。
- [ ] 5.13 `scripts/test-deploy-docker-appliance.ps1`：删 monitoring 相关断言。
- [ ] 5.14 `scripts/run-realtime-candle-shadow-hil.ps1`：删 `$IntendedMonitoringSha` 参数 +
       `Get-ContainerImageIdentity "mist-monitoring"` (L882) +
       `MIST_MONITORING_PORT` / `$metricsUrl` 块 (L836-837,860)。
- [ ] 5.15 `scripts/test-workflow-config.ps1`：删 monitoring image 输入断言 (L237-241)。
- [ ] 5.16 `scripts/deploy-docker-appliance.ps1` health check 序列加 openobserve 存活验证。

## 6. mist-deploy：test-workflow-config.ps1 中 retire/inspect workflow 断言清理

- [ ] 6.1 `scripts/test-workflow-config.ps1`：删 `retire-windows-monitoring-exporter.yml`
      和 `inspect-windows-monitoring-runtime.yml` 相关断言（如果存在）。
- [ ] 6.2 `scripts/test-deploy-scripts.yml`（workflow）：从 test 列表移除已删脚本
      `test-deploy-monitoring.ps1`。

## 7. mist 仓：孤儿 service 删除

- [ ] 7.1 删 `apps/mist/src/realtime/candle/realtime-candle-health.service.ts` +
      `realtime-candle-health.service.spec.ts` +
      `realtime-candle-health.types.ts`（observe() 零生产调用者）。
- [ ] 7.2 删 `apps/mist/src/realtime/realtime-market-observability.service.ts` +
      `realtime-market-observability.service.spec.ts`（读取端只被死掉的 health service 调用）。
- [ ] 7.3 删 `sources/tdx/realtime/realtime.client.ts` 和
      `sources/qmt/realtime/realtime.client.ts` 中的 `recordQuantityRejection` 调用
     （observability service 删除后这些写入端无意义）。
- [ ] 7.4 删 `realtime-ingress.module.ts` 中 `RealtimeCandleHealthService` 和
      `RealtimeMarketObservabilityService` 的 provider 注册。
- [ ] 7.5 `pnpm typecheck` 确认无 import 残留。

## 8. mist 仓：openspec 清理

- [ ] 8.1 归档 `openspec/changes/permit-monitoring-to-read-realtime-source-status/`
     （moot——exporter 不再存在）。
- [ ] 8.2 删或归档 `openspec/specs/monitoring-health-alerts/spec.md`
      的过时 requirement（黑盒 exporter 架构已全部过时）。
- [ ] 8.3 删 mist-monitoring 仓 `openspec/changes/shrink-monitoring-to-blackbox-probe/
      whitebox-part-two-plan.md`（Part 2 被 O0 永久取消）。

## 9. mist-datasource 仓：mock 环境适配

- [ ] 9.1 `tools/mock-env/run-mock.sh`：删 `go run ./cmd/exporter` 启动块 (L16,25,28,59-62,81-85)，
      加 openobserve 容器启动（或 compose 依赖）。
- [ ] 9.2 `tools/mock-env/mock-verify.sh`：删 `curl :9109/metrics` 断言，
      改为 curl openobserve `/api/default/v1/traces` 验证收到遥测数据。
- [ ] 9.3 删 `tools/mock-env/config.monitoring.yaml`（exporter 配置，不再需要）。
- [ ] 9.4 `tools/mock-env/README.md`：更新拓扑（移除 exporter，加 OpenObserve）。

## 10. 验证

- [ ] 10.1 mist 仓 `pnpm typecheck` + `pnpm test` 全绿（含孤儿 service 删除后无回归）。
- [ ] 10.2 mist-datasource 仓 `ruff check` + `pytest`（非 live）全绿。
- [ ] 10.3 mist-deploy 仓全部 `test-*.ps1` 全绿（pwsh-preview 本地验证）。
- [ ] 10.4 `openspec validate introduce-openobserve-otel-foundation --strict`。
- [ ] 10.5 mock 环境起栈验证：OpenObserve UI 可达、各服务 trace 出现在 OpenObserve。

## 11. 提交（不合并 master）

- [ ] 11.1 mist 仓分支 `feat/otel-openobserve-foundation` 提交推送。
- [ ] 11.2 mist-datasource 仓分支提交推送。
- [ ] 11.3 mist-deploy 仓分支提交推送。
- [ ] 11.4 mist-monitoring 仓删 whitebox-part-two-plan.md 提交推送。
- [ ] 11.5 不合并 master（等验证后统一合 + 部署）。
