# Proposal: Pre-Market Health Inspection, Subscription Reconciliation Alert (A10), and Timezone Consolidation

## Why

在 2026-08-23 生产巡检中，发现 QMT journal 因历史异常残留孤儿记录导致 `reconciliationRequired=true`，订阅控制面（sync / subscribe / unsubscribe）被全面拒绝。由于实时行情数据流（snapshot）和回测链路持续正常，该故障静默持续了 **2 天** 未被察觉。

现有体系存在三大核心防御与治理断层：
1. **被动监控断层**：OpenObserve 现有规则（A1~A9）中无专用对账阻塞告警，`mist-datasource` 在 `/health` 中能感知但未在 OTel 指标中暴露专用 Gauge；
2. **主动防御断层**：缺少开盘前的主动综合体检机制。在每日 09:15 订阅重置门禁（Read-Before-Reset）与 09:30 正式开盘前，没有系统级自动巡检去确保对账状态、昨夜收盘K线完整性、活跃标的合规性、实时链路通畅性及底层基础设施就绪；
3. **时间体系分散治理缺陷**：全系统的 Cron 表达式（如 22:30、06:30、09:15、09:05）和时段判定函数（`isInTradingHours`、`isIntradayAddWindow`）分散在 `apps/schedule`、`apps/mist`、`libs/timezone` 等不同位置，缺乏全局唯一的权威收口源。

## What Changes

1. **`libs/timezone` 统一时间节点与 Cron 调度收口（架构治理）**：
   - 新增 `cron-schedules.const.ts` 与统一窗口判定工具，权威收口全系统调度时刻：
     - `CRON_PRE_MARKET_INSPECTION_0905`: `'0 5 9 * * 1-5'`（交易日 09:05 盘前体检）
     - `CRON_SUBSCRIPTION_RESET_0915`: `'0 15 9 * * 1-5'`（交易日 09:15 订阅重置门禁）
     - `CRON_POST_CLOSE_SYNC_NIGHTLY_2230`: `'30 22 * * 1-5'`（交易日 22:30 晚间同步）
     - `CRON_POST_CLOSE_SYNC_MORNING_0630`: `'30 6 * * 2-6'`（交易日次日 06:30 兜底同步）
   - 将分散在 `apps/mist` 等处的 `isIntradayAddWindow` 收敛至 `@app/timezone` 统一导出。
2. **`apps/schedule` 09:05 盘前主动巡检与智能诊断简报（新增主动防御层）**：
   - 在每个 A 股交易日的 **09:05**（留出 10 分钟应对 09:15 订阅重置门禁，25 分钟应对 09:30 开盘），自动执行 5 维综合健康体检：
     1. **数据源与 Journal 控制面**：QMT/TDX `/health` 的 `reconciliationRequired=false`、`journalHealthy=true`、`phase="completed"`；
     2. **收盘历史 K 线完整性**：检查昨夜 22:30 与今晨 06:30 同步结果，确保目标标的前一交易日各周期（日线/1m/5m/15m/30m/60m）无缺漏；
     3. **订阅生命周期合规**：校验 MySQL 中 `Security.status=ACTIVE` 的标的数合规（每源 <= 5）且订阅协调器就绪；
     4. **实时链路与流转通畅性**：检查 TDX/QMT WebSocket 客户端连接状态、Bridge TCP 连通性与活跃心跳；
     5. **基础设施存活性**：MySQL 连接池、Redis 内存与 Key 淘汰策略、Signal 服务健康度。
   - **每日必发企业微信体检简报**：
     - **全绿态**：通报 5 大模块就绪及活跃标的清单；
     - **异常态**：标红置顶故障模块，在卡片中精准给出根因、受影响标的及一键排查与恢复命令指引（如生成 `context-rebuild-observation.json` 路径）。
3. **`mist-datasource` 专用指标导出（被动告警基础）**：
   - 在 `metrics.py` 新增 Gauge 指标 `mist_datasource_subscription_reconciliation_required`（0/1，标签 `source="qmt"|"tdx"`）。
   - 在 `subscription.py` 中，与启动 replay 降级、手动观察恢复、运行时异常标记等状态严格同步。
4. **`mist-deploy` A10 规则与多位数前缀（`A10+`）契约升级**：
   - 在 `oo-alerts/rules.json` 新增 `A10_qmt_reconciliation_required` 告警规则（P1，10 分钟窗口，阈值 `>= 1`，静默 30 分钟）。
   - 升级 `test-docker-compose-config.ps1` 与 `sync-oo-alerts.ps1`，将规则前缀提取改为 `Split('_')[0]`，放宽正则为 `^A\d+_\w+$`，在 `$severityByPrefix` 中注册 `"A10" = "P1"`。
5. **`apps/notification` 接收器与前缀映射对齐**：
   - 在 `oo-alert.constants.ts` 注册 `A10: 'P1'`，重构 `oo-alert-receiver.controller.ts` 的前缀解析为 `alertName.split('_')[0].toUpperCase()`。
   - 提供盘前体检简报推送通道。

## Capabilities

### New Capabilities
- `pre-market-health-inspection`: 交易日 09:05 执行全方位主动体检（数据源/Journal、收盘K线、标的合规、实时链路、基础设施），并向企业微信推送深度智能诊断简报。
- `subscription-reconciliation-alert`: 数据源订阅控制面因 Journal 对账阻塞（`reconciliationRequired`）时导出专用指标并在 OpenObserve 中触发 A10 P1 告警。

### Modified Capabilities
- `monitoring-health-alerts`: 增加 A10 告警规则规约，并将规则命名与 Severity 映射契约升级为支持双位数（`A10+`）。

## Impact

- **`libs/timezone`**: 集中收口全系统调度 Cron 表达式与时段判定常量。
- **`apps/schedule`**: 引用 `@app/timezone` 集中常量，注册 09:05 盘前体检服务。
- **`apps/mist`**: 替换原本内联的 Cron 表达式与窗口判定为 `@app/timezone` 集中常量。
- **`mist-datasource`**: 增加 OTel gauge 埋点，不影响现有行情吞吐与控制面协议。
- **`mist-deploy`**: 增加一条 OO SQL 告警规则，修复部署脚本中的规则名单数字假设。
- **`apps/notification`**: 扩展规则前缀映射与简报发送。
