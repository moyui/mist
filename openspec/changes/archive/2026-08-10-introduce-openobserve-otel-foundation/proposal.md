# Proposal: introduce-openobserve-otel-foundation

## Why

第一部分（shrink-monitoring-to-blackbox-probe）删掉了 121 个业务指标和全部诊断端点，
留下 Prometheus + Grafana + mist-monitoring exporter 三个容器组成的空壳指标监控层
（5 个指标 + 全 TODO 的 dashboard + 注释的告警规则）。

本 change 用 **OpenTelemetry SDK + OpenObserve** 一体化平台**替换**这三个容器，
建立新的可观测性基础：
- metrics：OTel SDK → OTLP → OpenObserve（不再走 Prometheus pull）
- traces：OTel SDK → OTLP → OpenObserve（每个判断节点埋 span，O1/O2 做）
- 一个 UI 看全部（OpenObserve Web UI 替代 Grafana）

选 OpenObserve（而非 SigNoz）的理由：SigNoz 官方明确不推荐 Windows Docker Desktop
（virtualization crashes），OpenObserve 是 Rust 单容器、零外部依赖、Docker Desktop 最友好。

## What Changes

### 新增：OpenObserve 容器
- 单容器（`public.ecr.aws/zinclabs/openobserve`），bind mount data 目录
- 接收 OTLP HTTP（端口 5080，compose 网络内 `openobserve:5080`）
- Web UI 在 5080

### 新增：OTel SDK 接入（6 个 Node.js app + 2 个 Python app）
- NestJS（mist/signal/backtest/chan/schedule）：每个 app 的 `main.ts` 头部加 OTel SDK 初始化
  （必须在 `NestFactory.create` 之前），配 OTLP HTTP exporter 指向 OpenObserve
- Node 脚本（realtime-subscription-hil）：同样在文件头部初始化
- Python（tdx-datasource/qmt-datasource）：在 `setup_logging()` 处初始化 OTel +
  `Instrumentator` 自动 instrument FastAPI

### 删除：3 个容器 + 相关基础设施
- `monitoring`（mist-monitoring exporter）
- `prometheus`
- `grafana`
- 容器净变化：14 - 3 + 1 = **12**

### 删除：deploy 脚本/配置/workflow
- `docker/monitoring/`、`docker/prometheus/`、`docker/grafana/` 全删
- `scripts/deploy-observability.ps1`、`scripts/deploy-monitoring.ps1` 删除
- `.github/workflows/deploy-observability-stack.yml`、`deploy-windows-monitoring.yml` 删除
- `compose.yaml` 删 3 个 service + grafana 依赖 + 2 个 named volume
- nginx `default.conf.template` 删 `/grafana/` location
- `.env.example` 删 `MIST_MONITORING_*` / `PROMETHEUS_IMAGE` / `GRAFANA_*`
- `deploy-docker-appliance.ps1` 删 monitoring/prometheus/grafana 启动序列
- `test-docker-compose-config.ps1` 删相关断言
- `deploy-defaults.ps1` / `test-deploy-defaults.ps1` 删 9109 / monitoring 默认值

### 删除：孤儿 service + 死区代码（审计发现 9 项）

shrink 时"保留给 whitebox 重建"的 service，现在 whitebox 方案变成了 OTel，它们永久死掉：
- `RealtimeCandleHealthService`——`observe()` 唯一调用者是已删的诊断 controller，零生产调用者
- `RealtimeMarketObservabilityService`——读取端只被死掉的 health service 调用，变成只写不读的 zombie sink；`recordQuantityRejection` 写入端在 realtime client 里也变无意义

会直接 break 的脚本/mock 环境（不加进 O0 则落地后报错）：
- `run-realtime-candle-shadow-hil.ps1`——`Get-ContainerImageIdentity "mist-monitoring"` 找不到容器
- `health-check-docker-appliance.ps1`——`Assert-DockerComposeServiceRunning "monitoring"` + `Assert-MonitoringRealtimeMetrics` 函数
- mist-datasource `tools/mock-env/run-mock.sh`——`go run ./cmd/exporter` 启动失败
- mist-datasource `tools/mock-env/mock-verify.sh`——`curl :9109/metrics` 失败

死 workflow + 残留默认值：
- `retire-windows-monitoring-exporter.yml` / `inspect-windows-monitoring-runtime.yml`——端口 9109 概念已死
- `deploy-defaults.ps1` 的 `MonitoringTdxRealtimeHealthUrl` / `MonitoringQmtRealtimeHealthUrl`

过时 openspec：
- `openspec/specs/monitoring-health-alerts/spec.md`——整个 spec 描述黑盒 exporter 架构
- `openspec/changes/permit-monitoring-to-read-realtime-source-status/`——moot
- mist-monitoring 仓 `shrink-monitoring-to-blackbox-probe/whitebox-part-two-plan.md`——Part 2 被 O0 永久取消

### 不做（留给后续 change）
- O1：实时数据管道的 span 埋点（ingress→aggregator→finalizer 判断节点）
- O2：datasource 侧 span 埋点
- O3：OpenObserve 告警规则 + dashboard
- WS 帧的 trace context 跨进程传播（datasource → backend，需要自定义 inject/extract）
- `mist-monitoring` 仓 archive（O0 停部署但不 archive 仓库，等 OpenObserve 验证后单独做）

## Scope

### In scope
- mist 仓：OTel SDK 依赖 + 6 个 main.ts 初始化 + 1 个 Node 脚本初始化
- mist-datasource 仓：OTel 依赖 + 2 个 Python app 初始化
- mist-deploy 仓：OpenObserve 容器 + 删 3 容器 + 删脚本/配置/workflow + nginx/env/compose 改动
- mist-monitoring 仓：本 change 不删代码（exporter 代码保留，但容器不再部署）

### Out of scope
- 自定义指标定义（用 OTel API 定义 `mist_realtime_*` 等 metrics）
- 自定义 span 埋点（管道判断节点）
- 告警规则迁移
- dashboard 重建
- WS trace context 传播
- `mist-monitoring` 仓代码删除（exporter 可能彻底退役，后续单独处理）
