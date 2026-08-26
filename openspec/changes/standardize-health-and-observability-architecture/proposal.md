# Proposal: 统一子 App 的 Health 与 Observability 目录架构与契约规范

## 1. 背景与现状

在 Mist 多 App 微服务架构（包含 `mist`、`backtest`、`signal`、`notification`、`chan`、`schedule` 6 个应用）演进过程中，各应用在 **Health 探活/健康检查** 与 **Observability 可观测性/指标注册** 上形成了不同的历史实现风格，存在以下显著不一致：

1. **端点职责与路由混乱**：
   - `mist` 存在 `GET /health`（业务开关）与 `GET /app/hello`（探活）。
   - `chan` 将 `/app/hello` 写在 `health.controller.ts` 中，无 `/health` 深度健康端点。
   - `schedule` 完全缺失健康端点，Docker Compose 依赖查询 `/schedule` 是否 404 作为存活 hack。
   - `backtest`、`signal`、`notification` 仅有 `GET /health`，缺失与部署冒烟统一的 `/app/hello`。
2. **响应契约与 Envelope 双轨**：
   - `mist` 引入了 `HttpTransportModule`，导致 `GET /health` 返回业务包装格式 `{ success: true, data: { status: 'ok', ... } }`。
   - `backtest`、`signal`、`notification` 返回纯净 Raw JSON `{ status: 'ok', ... }`。
   - 导致 `schedule` 的 09:05 盘前巡检代码必须做防御性分支 `const data = (body['data'] ?? body)`。
3. **顶层标识字段冲突**：
   - `backtest` 使用 `service: 'backtest'`。
   - `backend`、`signal`、`notification`、`tdx`、`qmt` 使用 `instance: '...'`。
4. **目录结构与文件命名零散**：
   - `mist` 的指标分散在 `src/realtime/observability/` 与 `src/collector/observability/`。
   - `backtest` 拥有 `src/observability/backtest-metrics.ts`，但健康文件平铺在 `src/`。
   - `signal` 将 `signal-runtime-observability.service.ts` 平铺在 `src/`，未建立 `observability/` 目录且未注册 OTel 指标。
   - `notification` 将 metrics 拆分为 `delivery-metrics.ts` 与 `oo-alert-metrics.ts`。
   - 各 App 缺少统一的 `libs/observability` 共享基础契约。

## 2. 治理目标

1. **端点分工清晰化**：
   - **`GET /app/hello`（轻量探活/冒烟）**：所有 6 个 App 统一在 `src/app.controller.ts` 提供，返回简单 greeting 字符串，用于 Docker 基础存活、网关 80 端口冒烟及部署前置检查。
   - **`GET /health`（深度结构化运行时健康）**：所有 6 个 App 统一在 `src/health/health.controller.ts` 提供，统一返回 **纯净 Raw JSON**（不经 API Envelope 包装），提供结构化状态、开关、准入与观测快照。
2. **目录与文件名完全对称统一**：
   - 每个子 App 统一采用两级目录结构：`src/health/` 与 `src/observability/`。
   - 子目录内统一采用语义化文件名：`health.controller.ts`、`health.vo.ts`、`health-state.service.ts`、`metrics.ts`、`runtime-observability.service.ts`。
3. **共享基础契约抽象（`libs/observability`）**：
   - 在 `libs/observability` 沉淀 `BaseHealthVo`（`status: 'ok' | 'degraded' | 'error'`、`service: string`、`instance: string` 双写兼容、`timestamp: string`）。
   - 提供 OTel Meter 初始化助手与低基数 Label 防护工具。
4. **OpenObserve 指标兼容与补齐**：
   - 保持现有 `mist_*` OTel metric stream 命名与 Label schema 不变，确保 OpenObserve 既有 Dashboard 和告警规则零破坏。
   - 为 `signal`、`schedule`、`chan` 建立标准 `src/observability/metrics.ts` 并补齐缺失的 OTel 遥测指标。
5. **部署编排统一收敛**：
   - 更新 `mist-deploy/docker/compose.yaml`，清理 `schedule` 的 404 hack，统一各容器的健康检查。

## 3. 受影响范围

- `libs/observability`：新建共享库，沉淀 Base Health VO 与通用 OTel 工具。
- `libs/transport`：在 `HttpTransportModule` 中为 `/health` 增加 Raw JSON 豁免支持。
- `apps/mist`、`apps/backtest`、`apps/signal`、`apps/notification`、`apps/chan`、`apps/schedule`：对齐 `src/app.controller.ts`、`src/health/` 和 `src/observability/`。
- `apps/schedule/src/pre-market-inspection.service.ts`：移除防御性 Envelope 解包兼容代码。
- `mist-deploy/docker/compose.yaml`：标准化所有容器的 healthcheck 配置。
