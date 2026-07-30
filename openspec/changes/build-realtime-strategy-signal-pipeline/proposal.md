## Why

Mist 已有正式 TDX/QMT realtime transport 和基础策略定义，但 accepted snapshot 尚未形成可恢复的
sealed 1m candle，策略也不能在盘中以有界内存连续评估并可靠地产生 Signal/AlertEvent。此前 B1、
portfolio 和 realtime-signal 三组设计存在重叠及相互越权，本 change 将实时信号闭环收敛为一个
明确所有权、按内部门禁分阶段交付的 V1。

## What Changes

- 将 accepted realtime snapshot 聚合为按 canonical `securityId` 定位的 Node.js 有界 1m open
  candle，并把 valid sealed 1m candle、watermark、due 和 manifest 保存到 market-data Redis；
  Redis key 不使用 `securityCode` 或 `providerSymbol`，后两者仅保留必要 provenance。
- **BREAKING**：realtime `volume/amount`、candle baseline/delta、Redis compact fields、策略
  context 以及 `k.volume`/`k.amount` 规则阈值统一使用可装入 `DECIMAL(36,8)` 的规范十进制
  字符串或 `null`；TDX 数字量额 fail closed，QMT 保留 provider precision provenance。
- 不创建统一冷热 `MarketKQueryService`，不让 realtime strategy 每根 K 或每个策略查询完整
  MySQL 历史。worker 共享内存 ring window；冷启动仅从 market Redis 的有限 retention 范围
  有界重放 sealed candles，历史不足时 context 为 `unknown`。
- 以独立 `mist-queue-redis` 和 BullMQ 完成 market commit 后的非阻塞 handoff；确定性 job
  identity 只使用 `tradingDay + securityId + bucketStartMs`，job 不携带 `securityCode`、历史、
  rule、native payload、epoch 或 sequence，reconciler 补偿两个 Redis 之间的 enqueue 窗口。
- **BREAKING**：直接收紧未正式使用的策略 V1，将单一 `rule` 改为 paired
  `entryRule/exitRule + lookbackBars`，增加 decimal field catalog、prior-context crossover 和
  `entry|exit` signal kind；由本 change 明确拥有下一条 forward-only migration、preflight、
  postflight 和 ORM metadata，同步删除旧单规则公共契约，不增加 rule-schema enum 或兼容双写。
- worker 按 `securityId` 有序处理并共享 1/5/15/30/60 分钟内存窗口、指标和现有 Chan Phase B
  projection；缺失组成分钟或历史不足时保持 `unknown`，派生周期不写回 Redis/MySQL。
- episode 显式使用 `unknown|false|true` 三态；`false|unknown → true` 产生候选、持续 true
  抑制、完整 false 重置，incomplete/error 回到 unknown。
- `REALTIME_STRATEGY_MODE=off|shadow|on` 默认 `off`；`shadow` 评估但不写策略表，`on` 在同一
  MySQL transaction 写入 `StrategySignal(signalSource=live)` 与 PENDING `StrategyAlertEvent`。
- 本 change 不提供通用 current-day K API/前端实时 K 合并，不实现 portfolio cash/positions/
  orders/trades/NAV simulation，也不发送 WeCom、微信或 AstrBot 通知。

## Capabilities

### New Capabilities

- `current-day-realtime-candle-foundation`: Node open candle、Redis sealed 1m、exact-decimal、
  grace/finalizer、retention、replay 和 market/strategy 隔离边界。
- `realtime-strategy-evaluation`: BullMQ handoff、内存窗口、周期/指标/Chan context、显式三态
  episode、shadow/on 和 Signal/AlertEvent transaction。

### Modified Capabilities

- `realtime-market-data-ingress`: canonical realtime 量额改为 exact decimal string，并在
  transport acceptance 后接入可失败隔离的 candle sink。
- `backend-datasource-integration`: TDX/QMT 分别执行 native quantity validation、
  normalization 和 precision provenance。
- `strategy-definition-registry`: V1 改为 paired rules、bounded lookback、decimal fields 和
  realtime eligibility。
- `strategy-signal-alerts`: 增加 entry/exit signal kind、source-agnostic candle dedupe 和
  realtime transaction。
- `strategy-operator-ux`: 策略编辑器同步 paired V1 与 decimal-string rule contract，不增加
  portfolio workspace 或 realtime signal 页面。
- `strategy-platform-roadmap`: 以 realtime signal pipeline 取代旧 B1/portfolio/connect
  依赖链，portfolio simulation 保留为未来独立 change。
- `windows-docker-appliance`: 增加物理隔离的 market Redis 与 queue Redis、模式配置、部署门禁
  和可回滚启动顺序。
- `monitoring-health-alerts`: 增加 candle、handoff、queue、replay、window、episode、
  evaluation、decimal rejection 和 persistence 观测。

## Impact

- **`mist`**：realtime canonical/candle/finalizer、Redis repository、BullMQ producer/worker/
  reconciler、共享策略规则/context、StrategySignal/AlertEvent persistence、health 和测试。
- **`mist-datasource`**：TDX exact-decimal validator、QMT native quantity contract 和跨仓 fixture。
- **`mist-deploy`**：`mist-realtime-redis` 与 `mist-queue-redis` 独立 service/volume、backend
  环境变量、health、promotion 和 rollback。
- **`mist-monitoring`**：两个 Redis 与 realtime evaluation 的低基数指标和告警。
- **`mist-fe`**：paired rule/decimal threshold 编辑契约；不修改 K 页面或新增 realtime signal UI。
- **`mist-skills`**：不修改；通知投递仍需未来 focused change。
- **数据库**：新增下一条 migration，把未正式使用的 V1 单规则 schema 前向迁移为 paired rules
  和 signal kind；不得改写 migration `001–013`，实施前必须核对真实 `schema_migrations`。
