## 0. Timezone 统一调度与窗口收口 (libs/timezone)

- [x] 0.1 `[mist libs/timezone]` 新增 `src/cron-schedules.constants.ts`，权威定义并导出：
  - `CRON_PRE_MARKET_INSPECTION_0905 = '0 5 9 * * 1-5'`（盘前 09:05）
  - `CRON_SUBSCRIPTION_RESET_0915 = '0 15 9 * * 1-5'`（订阅重置 09:15）
  - `CRON_POST_CLOSE_SYNC_NIGHTLY_2230 = '30 22 * * 1-5'`（晚间同步 22:30）
  - `CRON_POST_CLOSE_SYNC_MORNING_0630 = '30 6 * * 2-6'`（晨间兜底 06:30）
- [x] 0.2 `[mist libs/timezone]` 将 `isIntradayAddWindow` 与相关时段分钟常量迁移并统一收敛至 `libs/timezone/src/trading-session.util.ts`。
- [x] 0.3 `[mist apps/mist & schedule]` 重构现有控制器与协调器（`DataCollectionController`、`RealtimeSubscriptionLifecycleCoordinator`），统一引用 `@app/timezone` 导出的常量。
- [x] 0.4 `[mist tests]` 增加 `cron-schedules.constants` 与相关时段判定单元测试。

## 1. 09:05 盘前主动巡检与诊断简报 (apps/schedule & apps/notification)

- [x] 1.1 `[mist apps/schedule]` 实现 `PreMarketInspectionService`，支持 5 维探针并发检测：
  - 数据源 `/health` 探针（`reconciliationRequired == false`、`phase != 'degraded'`）；
  - MySQL `k_lines` 前一交易日各周期（DAY, 1m, 5m, 15m, 30m, 60m）完整性校验；
  - MySQL `realtime_subscription_assignments` 活跃标的数（<=5）及协调器状态校验；
  - 实时通信链路（WS 客户端 `connected`、Bridge `bridge_ready`）探测；
  - 基础设施（Redis PING/内存、MySQL 连接池、Signal `/health`）探测。
- [x] 1.2 `[mist apps/schedule]` 在 `DataCollectionController` 中注册 `@Cron(CRON_PRE_MARKET_INSPECTION_0905, { timeZone: ASIA_SHANGHAI_TIMEZONE })`，交易日 09:05 自动触发体检，生成结构化诊断结果。
- [x] 1.3 `[mist apps/schedule & notification]` 组装深度智能 Markdown 诊断卡片（全绿简报 vs 异常标红置顶 + 一键恢复命令），通过通知模块推送至企业微信群。
- [x] 1.4 `[mist tests]` 编写 `PreMarketInspectionService` 与调度任务的单元测试，模拟各维度健康与异常场景（如 Journal 阻塞、K线缺失、非交易日跳过等）。

## 2. Datasource 专用指标埋点 (mist-datasource)

- [x] 2.1 `[mist-datasource]` 在 `src/datasource/metrics.py` 注册 Gauge `mist_datasource_subscription_reconciliation_required` 并导出辅助方法 `set_reconciliation_required(source: str, required: bool)`。
- [x] 2.2 `[mist-datasource]` 在 `src/datasource/qmt/realtime/subscription.py` 中，在启动 replay 降级/完成、`context-rebuild-observation.json` 消费解除阻塞、以及运行时异常标记 `reconciliation_required` 时同步置指标为 0 或 1。
- [x] 2.3 `[mist-datasource tests]` 增加单元测试与集成测试，覆盖 `reconciliation_required` 状态流转与 Gauge 指标更新，断言指标无高基数标签。

## 3. Deploy 告警规则与契约升级 (mist-deploy)

- [x] 3.1 `[mist-deploy]` 在 `oo-alerts/rules.json` 增加 `A10_qmt_reconciliation_required` 规则（P1，SQL 查询 `mist_datasource_subscription_reconciliation_required`，阈值 `>= 1`，周期 10m，频次 300s，静默 30m）。
- [x] 3.2 `[mist-deploy]` 升级 `scripts/test-docker-compose-config.ps1` 和 `scripts/sync-oo-alerts.ps1`，将规则名正则放宽为 `^A\d+_\w+$`，前缀提取改为 `Split('_')[0]`，并在 `$severityByPrefix` 中加入 `"A10" = "P1"`。
- [x] 3.3 `[mist-deploy tests]` 运行 `test-docker-compose-config.ps1` 校验规则合法性与 Severity 契约锁。

## 4. Notification 规则前缀与 Severity 映射对齐 (apps/notification)

- [x] 4.1 `[mist apps/notification]` 在 `apps/notification/src/oo-alert/oo-alert.constants.ts` 的 `SEVERITY_BY_PREFIX` 中新增 `A10: 'P1'`。
- [x] 4.2 `[mist apps/notification]` 在 `apps/notification/src/oo-alert/oo-alert-receiver.controller.ts` 中将前缀解析重构为 `alertName.split('_')[0].toUpperCase()`，确保正确提取多字符前缀（如 `A10`）。
- [x] 4.3 `[mist tests]` 在 `oo-alert-receiver.controller.spec.ts` 和 `oo-alert-delivery.worker.spec.ts` 中增加 A10 规则接收与 P1 队列分发测试。

## 5. 运维手册与 Runbook 沉淀

- [x] 5.1 在运维手册与 `capture-realtime-provider-anomalies` 的 runbook 中补充 A10 告警与 09:05 盘前体检异常的处理指引（检查 health JSON、生成 one-shot context observation 文件、一键重启与补录命令）。
