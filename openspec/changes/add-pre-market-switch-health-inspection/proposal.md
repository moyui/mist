# Proposal: 盘前 09:05 运行时开关健康巡检与防断链治理

## 1. 背景与问题

在 2026-08-26 实盘验证中，系统发现实时数据流虽然成功进入 Ingress 内存层，但因后端环境变量处于 `REALTIME_PRODUCTIZATION_MODE=off` 导致 Candle 产品化层被静默截断（Gated with reason `mode_off`），进而导致 Redis 1m 桶未封存、BullMQ 任务未派发、Signal 策略未唤醒。

经排查，全系统中存在若干控制关键链路行为的运行时开关（如 `REALTIME_PRODUCTIZATION_MODE`、`REALTIME_STRATEGY_MODE`、`TDX/QMT_REALTIME_MODE`、`MIST_REALTIME_REDIS_URL`、`NOTIFICATION_WECHAT_WEBHOOK`）。若这些开关在部署或滚动时被遗漏、误重置为 `off` 或未正确加载，会导致系统在外观正常（HTTP 200 / 容器 Running）的情况下发生**静默断链**。

虽然系统已于 08-25 建立了 09:05 盘前主动健康巡检体系（`add-reconciliation-blocked-alert`），但现有 5 维巡检仅核验了数据源 Bridge/Journal、历史 K 线完整性、订阅分配和基础设施存活，**尚未将各微服务内部真实生效的运行时开关与链路闸门纳入核验**。

## 2. 治理目标

1. **主后端健康暴露**：在 `mist-backend`（`apps/mist`）实现 `GET /health` 结构化健康端点，真实反映 `productizationMode`、`strategyMode`、`redisAvailable` 等核心开关状态。
2. **09:05 巡检升级 6 维体系**：在 `apps/schedule` 的 `PreMarketInspectionService` 中新增「维度 6：运行时开关与链路闸门 (`pipelineSwitches`)」，自动探针核验全栈 5 大核心开关。
3. **严格门禁与精准指引**：任意核心开关处于 `off`、`false` 或未配置时，09:05 盘前巡检总体判定为 🔴 **FAILED**，并在企业微信诊断卡片中置顶标红，附带一键修复命令。
4. **部署默认值源头收敛**：在 `mist-deploy` 部署编排中，将实盘部署工作流及默认脚本中的 `realtime_productization_mode` 默认值从历史残留的 `off` 收敛升级为生产就绪的 `on`，根除 CI/CD 误覆盖风险。

## 3. 受影响范围

- `apps/mist`: 新增 `AppHealthController`（`GET /health`）
- `apps/schedule`: 升级 `PreMarketInspectionService`、扩展报告接口与微信卡片模板
- `mist-deploy`: 调整部署工作流输入默认值与测试用例断言
- `openspec/specs/pre-market-health-inspection/spec.md`: 增补第 6 维开关校验规范与 All Green 判定契约
