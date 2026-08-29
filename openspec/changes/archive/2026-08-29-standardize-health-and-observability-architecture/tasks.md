# Tasks: 统一子 App 的 Health 与 Observability 目录架构与契约规范

## Phase 1: Monorepo 依赖配置与共享库沉淀
- [x] 1.1 更新 Monorepo 编译与路径配置：
  - [x] 1.1.1 在 `tsconfig.json` 中增加 `@app/observability` 与 `@app/observability/*` 路径映射
  - [x] 1.1.2 在 `nest-cli.json` 中注册 `observability` library 项目，并清理未落地的历史残留 `"otel"` 条目
- [x] 1.2 创建 `libs/observability` 共享库，定义 `BaseHealthVo` 与 `HealthStatus` 类型
- [x] 1.3 在 `libs/observability` 中实现通用 OTel 辅助工具（`createIdempotentMetricRegistration`、低基数 Label 清洗与校验）
- [x] 1.4 在 `libs/transport/src/http` 中扩展 `HttpResponseInterceptor`，实现对 `/health` 端点的 Raw JSON 豁免支持，并编写单元测试

## Phase 2: 子 App 目录结构对齐与死代码清理
- [x] 2.1 **apps/mist** 目录重构：
  - [x] 2.1.1 规范 `src/health/health.controller.ts` 与 `src/health/health.vo.ts`
  - [x] 2.1.2 彻底删除旧文件 `src/health/app-health.*`
  - [x] 2.1.3 保留 `src/app.controller.ts` 作为 `/app/hello` 探活
  - [x] 2.1.4 统一收敛 `src/observability/metrics.ts` 与 `tracer.ts`
  - [x] 2.1.5 更新 `app.module.ts` 及各相关单元测试的 Import 引用
- [x] 2.2 **apps/backtest** 目录重构：
  - [x] 2.2.1 建立 `src/health/` 目录，迁移并重命名为 `health.controller.ts`、`health.vo.ts`、`health-state.service.ts`
  - [x] 2.2.2 彻底删除根目录平铺的旧 `src/backtest-health.*` 文件
  - [x] 2.2.3 规范 `src/observability/metrics.ts`，删除旧 `backtest-metrics.ts`
  - [x] 2.2.4 新增 `src/app.controller.ts`（`GET /app/hello`）
  - [x] 2.2.5 更新 `backtest-app.module.ts`、`main.ts` 及各相关单元测试的 Import 引用
- [x] 2.3 **apps/signal** 目录重构：
  - [x] 2.3.1 建立 `src/health/` 目录，迁移并重命名为 `health.controller.ts`、`health.vo.ts`、`health-state.service.ts`
  - [x] 2.3.2 彻底删除根目录平铺的旧 `src/signal-health.*` 文件
  - [x] 2.3.3 建立 `src/observability/` 目录，归位 `runtime-observability.service.ts`（删除旧根目录文件）并创建 `metrics.ts` 注册 OTel 指标
  - [x] 2.3.4 新增 `src/app.controller.ts`（`GET /app/hello`）
  - [x] 2.3.5 更新 `signal-app.module.ts`、`main.ts` 及各相关单元测试的 Import 引用
- [x] 2.4 **apps/notification** 目录重构：
  - [x] 2.4.1 建立 `src/health/` 目录，规范 `health.controller.ts` 与 `health.vo.ts`
  - [x] 2.4.2 彻底删除根目录平铺的旧 `src/notification-health.controller.ts`
  - [x] 2.4.3 统一 `src/observability/metrics.ts`，聚合 delivery 与 oo-alert 指标注册，清理旧碎片文件
  - [x] 2.4.4 新增 `src/app.controller.ts`（`GET /app/hello`）
  - [x] 2.4.5 更新 `notification-app.module.ts` 及各相关单元测试的 Import 引用
- [x] 2.5 **apps/chan** 目录重构：
  - [x] 2.5.1 将原 `src/health.controller.ts` 改造为标准 `src/app.controller.ts`（`GET /app/hello`），删除旧平铺文件
  - [x] 2.5.2 建立 `src/health/` 目录，新增标准 `health.controller.ts` 与 `health.vo.ts`（`GET /health`）
  - [x] 2.5.3 建立 `src/observability/metrics.ts`
  - [x] 2.5.4 更新 `chan-app.module.ts` 及各相关单元测试的 Import 引用
- [x] 2.6 **apps/schedule** 目录重构：
  - [x] 2.6.1 建立 `src/health/` 目录，新增标准 `health.controller.ts` 与 `health.vo.ts`（`GET /health`）
  - [x] 2.6.2 建立 `src/observability/metrics.ts`
  - [x] 2.6.3 新增 `src/app.controller.ts`（`GET /app/hello`）
  - [x] 2.6.4 更新 `schedule.module.ts` 及各相关单元测试的 Import 引用

## Phase 3: 内部消费者适配与盘前检查清理
- [x] 3.1 简化 `apps/schedule/src/pre-market-inspection.service.ts`，兼容并统一消费 Raw JSON 健康结构
- [x] 3.2 更新各 App 单元测试与端到端测试，断言 `/health` 返回 Raw JSON 且 `/app/hello` 正常响应

## Phase 4: 部署编排与 Compose 健康检查对齐
- [x] 4.1 更新 `mist-deploy/docker/compose.yaml`，标准化全栈 6 个 Node 容器的 healthcheck 配置，彻底删除 schedule 的 404 hack
- [x] 4.2 验证 `mist-deploy` 既有 PowerShell 脚本对 `/app/hello` 和 `/health` 的兼容性

## Phase 5: 全量死代码排查与门禁验证
- [x] 5.1 进行全仓死代码扫描（Grep 检查所有旧文件名、旧 Import 路径与废弃类型，确保零残留）
- [x] 5.2 运行全 monorepo 单元测试 (`pnpm test`)，确保 100% 通过
- [x] 5.3 运行全 monorepo Docker 构建门禁 (`pnpm build:docker`)，确保所有 7 个 app 构建无缺失模块
