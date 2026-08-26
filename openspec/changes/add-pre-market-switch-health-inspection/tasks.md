# Tasks: 盘前 09:05 运行时开关健康巡检与防断链治理

## 1. mist-backend 结构化健康端点实现

- [x] 1.1 `[mist]` 在 `apps/mist/src/health/` 下新增 `AppHealthController` 与 `BackendHealthVo`，实现 `GET /health` 端点。
- [x] 1.2 `[mist]` 注入 `ConfigService`、`RealtimeRedisService`、`RealtimeSecurityAllowlistService`，返回 `productizationMode`、`strategyMode`、`redisAvailable`、`allowlistCount` 等属性。
- [x] 1.3 `[mist]` 在 `apps/mist/src/app.module.ts` 中注册 `AppHealthController`，确保路由免鉴权且全局可达。
- [x] 1.4 `[mist tests]` 编写 `AppHealthController` 单元测试，覆盖不同模式组合及 Redis 连接状态。

## 2. apps/schedule 09:05 巡检升级 6 维体系

- [x] 2.1 `[mist]` 在 `apps/schedule/src/pre-market-inspection.service.ts` 中实现 `checkPipelineSwitches` 方法，探针覆盖 backend (8001)、signal (8010)、tdx (9001)、qmt (9002) 及企业微信 Webhook 配置。
- [x] 2.2 `[mist]` 扩展 `PreMarketInspectionReport` 接口，加入 `pipelineSwitches: DimensionCheckResult`，将全绿判定更新为 6 维全通过。
- [x] 2.3 `[mist]` 优化 `buildMarkdownReport`，在 All Green 与 FAILED 场景下生成紧凑清晰的微服务开关摘要及一键修复指令。
- [x] 2.4 `[mist tests]` 编写 `PreMarketInspectionService` 单元测试与集成测试，覆盖开关 `off` 拦截、Redis 缺失拦截与卡片文案断言。

## 3. mist-deploy 默认值收敛与 CI 门禁升级

- [x] 3.1 `[mist-deploy]` 修改 `.github/workflows/deploy-windows-mist-stack.yml`，将 `realtime_productization_mode` 输入默认值升级为 `on`。
- [x] 3.2 `[mist-deploy]` 修改 `scripts/common/deploy-defaults.ps1` 与 `docker/.env.example`，将开关默认值对齐为 `on`。
- [x] 3.3 `[mist-deploy]` 同步更新 `scripts/test-docker-compose-config.ps1` 与 `scripts/test-workflow-config.ps1` CI 断言。

## 4. OpenSpec 规范增补与归档

- [x] 4.1 更新 `openspec/specs/pre-market-health-inspection/spec.md` 规范，确立第 6 维开关核验与 All Green 判定准则。
- [x] 4.2 执行本地与 CI 全量测试套件，验证 6 维巡检与部署配置无回归。
