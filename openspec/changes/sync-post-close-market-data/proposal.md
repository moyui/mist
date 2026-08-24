# Proposal: sync-post-close-market-data

## Why

根据 `mist/docs/project-quality-governance-guide.md` 第 6.7 节历史记录，收盘后 provider 历史数据同步曾因日内高频轮询缺陷、数据源清算时钟不匹配和无就绪自检而被延期。

当前实时行情链路（TDX/QMT → Ingress → Redis 1m candle）已稳定运行，并严格遵循**“不写 Redis→MySQL”**的核心架构原则——当日 Redis 聚合 candle 仅用于盘中实时策略扫描与微信告警，收盘后历史权威 K 线必须由权威数据源（QMT/TDX/EastMoney）接口抓取并持久化落入 MySQL。

同时，根据 Mist 已冻结的架构原则（*“Diagnostics then go through OpenObserve — no HTTP read endpoints are restored”*），收盘同步作为纯后台定时批处理流程，不应暴露冗余的 HTTP 运维接口，而应将其执行状态、数据指标、异常诊断和故障告警**100% 纳入 OpenObserve (OO) 体系**。

为正式激活并规范化收盘历史数据同步能力，需解决以下物理约束与系统质量痛点：
1. **数据源物理就绪时点与清算窗口**：券商 QMT 盘后历史数据下载通常在 17:00 启动，多标的多周期分钟线与除权结算完全就绪通常在晚间 18:30~20:00 之后；TDX 客户端通常采用每周手动盘后下载方式；因此收盘同步不能在 15:00 刚收盘时触发，必须安排在晚间 22:30 主跑，并在次日开盘前 06:30 提供晨间二次兜底重试窗口（在 09:15 盘前生命周期开始前确保数据库 100% 完整）；
2. **解除历史延期状态并重构 `apps/schedule`**：正式废止旧的日内逐根轮询逻辑，将 `apps/schedule` 改造为严格交易日、固定晚间 22:30 与晨间 06:30 的收盘权威数据同步调度；
3. **消除硬编码并引入数据就绪自检（Data Freshness Guard）**：利用 `DataSourceSelectionService` 支持 QMT/TDX 多源路由，并在入库前引入强类型 `DataFreshnessStatus` 门禁，严防将未下载的旧数据或残缺数据误写入数据库；
4. **全链路 OpenObserve (OO) 可观测性与告警闭环**：
   - 彻底废除冗余 HTTP 端点与 DTO/VO，保持 API 边界极简收敛；
   - 建立结构化日志（Structured Logging to OO）；
   - 导出 OTel Metrics 指标（`mist_post_close_sync_tasks_total`, `mist_post_close_sync_klines_saved_total`, `mist_post_close_sync_last_success_age_seconds` 等）；
   - 联动 `mist-deploy/oo-alerts/rules.json` 配置 A8/A9 告警规则，并通过 `apps/notification` 实现微信告警自动推送。

## What Changes

1. **新建数据就绪自检模块 `DataFreshnessValidator`**：
   - 严格自检最新 bar 的日期（确认覆盖目标交易日）与分钟线根数（1m 满 240 根且达 15:00 收盘）；
   - 输出强类型 `DataFreshnessStatus`（`READY`, `NOT_LATEST`, `INCOMPLETE_BARS`, `SUSPENDED`）及详细诊断；
   - 对 `NOT_LATEST` 或 `INCOMPLETE_BARS` 实施拦截，严禁写入 MySQL。
2. **新建 `PostCloseSyncService` 核心同步引擎**：
   - 接收内部领域选择条件 `SyncPostCloseCriteria`；
   - 权威全周期拉取（`DAY`, `ONE_MIN`, `FIVE_MIN`, `FIFTEEN_MIN`, `THIRTY_MIN`, `SIXTY_MIN`, `WEEK`, `MONTH`），直接调用底层 `CollectorService.collectKForSource`（保持量价精确且缺失量额保留 null，绝不补零）；
   - 多数据源动态路由（QMT 优先，TDX/EastMoney 兼容）；
   - 引入有界并发控制（Bounded Concurrency）与 `Promise.allSettled` 故障隔离；
   - 产出结构化执行报告 `PostCloseSyncReport`。
3. **重构 `apps/schedule` 定时调度**：
   - 晚间 22:30 主同步（`@Cron('30 22 * * 1-5')`）：周一至周五交易日全周期同步；周五追加 `WEEK`，月末交易日追加 `MONTH`；
   - 次日 06:30 晨间兜底重试（`@Cron('30 6 * * 2-6')`）：周二至周六开盘前，对前一交易日的数据做二次自动扫描与补齐；
   - 移除日内无效逐根轮询。
4. **接入 OpenObserve 可观测性与告警体系**：
   - **结构化日志**：输出包含 `event`, `targetDate`, `window`, `succeeded`, `notReady`, `failed`, `totalKLines`, `durationMs` 的标准日志；
   - **OTel Metrics 导出**（`post-close-sync-metrics.ts`）：任务计数、保存量、耗时与成功时效 Gauge；
   - **OO 告警规则**：在 `mist-deploy/oo-alerts/rules.json` 中定义 A8（同步失败 P1）与 A9（未就绪激增 P2）告警；
   - **微信推送**：在 `apps/notification` 中注册 A8/A9 严重度映射并接入 `oo-alert` 队列。

## Capabilities

### New Capabilities
- `post-close-market-data-sync`: 定义 A 股收盘后权威行情数据的自动化同步、晚间 22:30 主跑 + 次日 06:30 兜底重试、全周期拉取、多数据源路由、数据就绪门禁、以及完整的 OpenObserve 结构化日志、指标与微信告警闭环。

## Impact

- **Affected Repository:** `mist`（`apps/schedule/`, `apps/mist/src/collector/`, `apps/notification/`）以及 `mist-deploy`（`oo-alerts/rules.json`）。
- **Governance Guide:** 正式解除 `project-quality-governance-guide.md` 中关于收盘同步的延期限制。
- **Database:** 无 schema 变更（复用现有 `K`, `Security`, `SecuritySourceConfig` 实体与 upsert 唯一键）。
- **API / Contract:** 零新增 HTTP REST 端点，收敛至 OpenObserve 监控与告警体系。
- **Realtime Pipeline:** 保持完全独立，实时 Ingress 零写 MySQL。
