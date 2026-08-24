# Tasks: sync-post-close-market-data

## 1. 契约与领域模型定义

- [x] 1.1 定义强类型 `DataFreshnessStatus` 枚举（`READY`, `NOT_LATEST`, `INCOMPLETE_BARS`, `SUSPENDED`）
- [x] 1.2 定义内部领域选择契约 `SyncPostCloseCriteria` 与执行报告 `PostCloseSyncReport`
- [x] 1.3 确认不暴露多余的 HTTP Controller / DTO / VO 端点

## 2. 核心服务与就绪自检实现

- [x] 2.1 实现 `DataFreshnessValidator`（`apps/mist/src/collector/helpers/data-freshness.validator.ts`）：
  - 日线 bar 日期与目标交易日对齐校验
  - 分钟线（1m/5m/15m/30m/60m）时间覆盖（15:00 收盘）与标准根数门禁
  - 停牌股票防御处理
- [x] 2.2 实现 `PostCloseSyncService`（`apps/mist/src/collector/post-close-sync.service.ts`）：
  - 接收 `SyncPostCloseCriteria`
  - 目标日期与起止时间窗口计算（利用 `TimezoneService`）
  - 证券列表筛选（ACTIVE 过滤与指定代码过滤）
  - 多数据源动态路由（QMT 优先，TDX/EastMoney 兼容）与 `CollectorService.collectKForSource` 调用
  - 集成 `DataFreshnessValidator` 进行就绪自检（`NOT_LATEST` 拦截落库）
  - 有界并发（Bounded Concurrency，默认并发度 5）与 `Promise.allSettled` 故障隔离
  - 输出规范结构化日志（Structured Logging to OpenObserve）
  - 产出结构化执行报告 `PostCloseSyncReport`
- [x] 2.3 在 `HistoricalCollectorModule` 中注册并导出 `PostCloseSyncService` 与 `DataFreshnessValidator`

## 3. OpenObserve 可观测性与告警接入

- [x] 3.1 实现 OTel 指标导出模块 `PostCloseSyncMetrics`（`apps/mist/src/collector/observability/post-close-sync-metrics.ts`）：
  - 注册 `mist_post_close_sync_tasks_total`、`mist_post_close_sync_klines_saved_total`、`mist_post_close_sync_duration_seconds` 与 `mist_post_close_sync_last_success_age_seconds`
- [x] 3.2 在 `mist-deploy/oo-alerts/rules.json` 中配置 A8（`A8_post_close_sync_failed`）与 A9（`A9_post_close_sync_unready_surge`）告警规则
- [x] 3.3 在 `apps/notification/src/oo-alert/oo-alert.constants.ts` 中注册 `A8: 'P1'` 与 `A9: 'P2'` 严重度映射

## 4. apps/schedule 定时调度重构

- [x] 4.1 在 `DataCollectionController`（`apps/schedule/src/data-collection.controller.ts`）中注入 `PostCloseSyncService`
- [x] 4.2 增加晚间 22:30 主收盘同步任务（`@Cron('30 22 * * 1-5')`）：
  - 仅交易日执行，同步全核心周期（DAY, 1m, 5m, 15m, 30m, 60m）
  - 周五追加 WEEK，月末交易日追加 MONTH
- [x] 4.3 增加次日 06:30 晨间兜底重试任务（`@Cron('30 6 * * 2-6')`）：
  - 计算前一个交易日（排除周末/节假日）并对昨晚未就绪标的做二次扫描与补齐
- [x] 4.4 清理/收敛旧的日内无效高频轮询

## 5. 单元测试与质量门禁

- [x] 5.1 编写 `data-freshness.validator.spec.ts`：
  - 测试正常日线/分钟线就绪判定（`READY`）
  - 测试老旧日期拦截（`NOT_LATEST`）
  - 测试根数残缺拦截（`INCOMPLETE_BARS`）
  - 测试停牌标的防御
- [x] 5.2 编写 `post-close-sync.service.spec.ts`：
  - 测试全周期同步（DAY + 1m + 5m + 15m + 30m + 60m）
  - 测试单标的抛错与未就绪标的的隔离与统计
  - 测试有界并发与指标调用
- [x] 5.3 编写 `post-close-sync-metrics.spec.ts` 测试指标注册与记录
- [x] 5.4 更新 `data-collection.controller.spec.ts`（覆盖 22:30 主任务、06:30 晨间重试、周五追加、月末追加、非交易日跳过）
- [x] 5.5 更新 `oo-alert-receiver.controller.spec.ts` 验证 A8/A9 告警接收与 severity 映射

## 6. 全局校验与基线验证

- [x] 6.1 运行全量单测套件 `npm test`
- [x] 6.2 运行 TypeScript 类型检查 `npx tsc --noEmit`
- [x] 6.3 运行 `openspec validate --all --strict`
- [x] 6.4 运行 `pnpm run lint:check`
- [x] 6.5 验证代码格式与 `git diff --check`
