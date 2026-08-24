# Proposal: sync-post-close-market-data

## Why

Mist 系统的实时行情链路（TDX/QMT → Ingress → Redis 1m candle）遵循**“不写 Redis→MySQL”**的核心架构原则，当日 Redis candle 仅用于盘中实时策略扫描与信号触发，收盘后历史权威 K 线必须由权威数据源（TDX/QMT/EastMoney）接口抓取并持久化落入 MySQL。

在实际生产运行中：
1. **数据源晚间就绪窗口**：QMT 盘后历史数据下载通常在 17:00 启动，标的完整分钟线与除权结算完全就绪通常在晚间 18:30~20:00 之后；TDX 则采用每周手动盘后下载方式；因此收盘同步不能在 15:00 刚收盘时触发，必须安排在晚间 22:00 以后（如 22:30），确保所有数据源与清算完全就绪；
2. **收盘自动化缺失**：`apps/schedule` 缺乏晚间权威历史 K 线的全量同步定时流程，导致历史数据依赖人工逐个调用接口；
3. **数据源写死**：`apps/schedule` 中的历史采集逻辑硬编码注入 `EastMoneyCollectionStrategy`，无法感知 `Security.sourceConfigs` 配置的多源体系（TDX/QMT）；
4. **缺少统一服务与可观测端点**：缺乏支持指定日期、周期、标的池以及返回详细执行报告的收盘同步服务与 HTTP 触发接口（便于周末手动下载 TDX 后一键联动）。

## What Changes

1. **新建 `PostCloseSyncService`**：
   - 统一封装收盘后权威数据同步逻辑；
   - 支持多周期批量同步（日线 `Period.DAY`、1 分钟线 `Period.ONE_MIN`、周线 `Period.WEEK`、月线 `Period.MONTH`）；
   - 基于 `DataSourceSelectionService` / `CollectionStrategyRegistry` 自动解析每个标的的配置数据源（TDX/QMT/EastMoney），支持多源路由；
   - 数据就绪校验（Data Freshness Guard），确认返回 bar 确实包含目标交易日；
   - 具备单标的故障隔离（`Promise.allSettled`）、重试与幂等写入能力；
   - 产出结构化同步报告（标的数、成功/失败数、K 线总数、耗时、异常明细）。
2. **重构 `apps/schedule` 定时任务**：
   - 调整收盘自动同步时间为**交易日晚间 22:30**（`@Cron('30 22 * * 1-5')`），确保 QMT 及全市场清算数据彻底就绪；
   - 周五晚间 22:30 自动追加周线同步，月末最后一个交易日 22:30 自动追加月线同步；
   - 移除日内无效高频轮询。
3. **提供运维 HTTP 接口**：
   - 在 `CollectorController` 暴露 `POST /v1/collector/sync-post-close`，支持参数：`targetDate`（可选，默认当日）、`periods`（可选，默认 DAY + ONE_MIN）、`securityCodes`（可选，默认全部 ACTIVE 标的）、`source`（可选，覆盖数据源）。

## Capabilities

### New Capabilities
- `post-close-market-data-sync`: 定义 A 股收盘后权威行情数据的自动化同步、晚间 22:00+ 调度、多数据源路由与故障隔离契约。

## Impact

- **Affected Repository:** `mist`（`apps/schedule/`, `apps/mist/src/collector/`）。
- **Database:** 无 schema 变更（复用现有 `K`, `Security`, `SecuritySourceConfig` 实体与 upsert 索引）。
- **Contract / API:** 新增 `POST /v1/collector/sync-post-close` 运维端点。
- **Realtime Pipeline:** 保持独立，不影响实时行情 Ingress 与 Redis 聚合。
