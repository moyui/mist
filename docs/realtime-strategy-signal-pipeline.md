# 实时策略信号流水线

本文是 Mist 盘中实时策略信号 V1 的长期架构说明。可执行契约和任务以
`openspec/changes/build-realtime-strategy-signal-pipeline/` 为准；本文用于解释边界、依赖、
代码复用方式和发布顺序，不替代 OpenSpec 验收。

## 1. 为什么重新整合

此前设计被拆在三个 active change：

- `productize-current-day-realtime-market-data`：当日 1m candle；
- `add-strategy-portfolio-backtesting`：paired rules、共享 evaluator 和数据库变更；
- 尚未正式创建的 `connect-realtime-strategy-signals`：实时触发和信号。

这三个范围实际争用相同的 realtime 类型、规则 schema、migration、Redis identity、部署配置和
策略 context。代码草稿因此出现了错误归属：B1 和 portfolio 前置任务未完成，connect 草稿却提前
实现了 migration、共享规则引擎和 K reader。

现在由 `build-realtime-strategy-signal-pipeline` 统一拥有盘中信号闭环，并在一个 change 内设置
三个不可跳过的 gate。完整 portfolio simulation 与通知投递不再作为前置条件，各自留给未来
focused change。

## 2. V1 范围与影响链

```text
TDX/QMT native callback
  → schema-v2 wire
  → backend strict decoder
  → CanonicalRealtimeSnapshot
  → bounded Node open candle
  → market Redis sealed 1m
  → bounded handoff + queue Redis BullMQ
  → shared in-memory windows/context
  → paired rule evaluator + tri-state episode
  → MySQL Signal + PENDING AlertEvent
  → deploy/monitoring/HIL
```

本轮止于 PENDING `StrategyAlertEvent`。WeCom、微信、AstrBot、retry/dead-letter 和前端实时信号
页面均不属于本轮。

## 3. 三个内部交付 gate

### Gate A：Candle foundation

- `volume/amount` 全链路使用规范十进制字符串或 `null`；
- runtime identity 只用 canonical `securityId`；
- Node 内存维护有界 open candle，market Redis 保存 sealed 1m、watermark、due 和 manifest；
- sealing 不等待 queue、策略、MySQL 或通知；
- 完成 Redis capacity、restart、grace calibration 与 TDX/QMT 交易时段 HIL。

Gate A 未通过，不得开始数据库迁移或 realtime strategy shadow。

### Gate B：Shared strategy contract

- V1 直接使用 `entryRule`、可选 `exitRule` 和有界 `lookbackBars`；
- field catalog 增加 `decimal`，`k.volume`/`k.amount` 阈值只接受规范十进制字符串；
- 共享 validator、evaluator、prior-context 和 bounded context；
- 下一条 forward-only migration、ORM、API 和前端编辑器一次性同步；
- 真实 MySQL preflight、postflight、protected-table digest 通过。

本轮不实现 cash、positions、orders、trades、fees、NAV、benchmark 等 portfolio simulation。

### Gate C：Realtime evaluation

- sealed commit 后向物理隔离的 queue Redis 投递确定性 BullMQ job；
- worker 共享 `(securityId, period)` 有界 ring window，不逐策略或逐 K 查询完整历史；
- 支持 1/5/15/30/60 分钟、指标和现有 Chan Phase B projection；
- episode 显式为 `unknown | false | true`；
- `on` 模式在一个 MySQL transaction 内写 Signal 与 PENDING AlertEvent；
- 完成 queue/reconciler/restart/dedupe、shadow/on 和 Windows Compose HIL。

## 4. 已确认的关键边界

### Identity

- Redis key、due member、jobId、worker cursor 和 episode 使用 `securityId`；
- `source`、`providerSymbol` 只作 provenance；
- candle 与 job 不保存 `securityCode`；
- schema-v1 `streamEpoch/sequence` 不得恢复，也不得把 transport generation 混入 strategy
  episode。

### Exact decimal

- 只有量额及其规则阈值使用 decimal string；OHLC、普通指标和 Chan 数值仍使用有限 `number`；
- TDX `Volume/Amount` 必须是 native string，数字形态 fail closed；
- QMT `volume` 从 provider integer 规范化，`amount` 保存 provider float 的可观察十进制值并标记
  `provider-float` provenance；
- baseline、delta、period sum、counter reset 和 rule comparison 使用定点整数或等价精确运算；
- 不用 `String(number)` 兼容旧数字阈值，不自动改写存量 rule。

### Redis 与有界取数

- market Redis 与 queue Redis 必须是独立 service、volume、AOF、capacity 和 cleanup；
- Redis closed candle 是可重放的当日产品输入，不是 MySQL 历史事实来源；
- 不实现通用 `MarketKQueryService`，不修改 K API 或前端 K 合并；
- worker 正常路径只追加新 candle；冷启动只从 market Redis retention 内有界重放；
- replay 不足、gap 或 discarded 时 context 为 `unknown`，不静默查询完整 MySQL 历史。

### Period、Chan 与 episode

- 5/15/30/60m 只由完整 sealed 1m 在上午、下午 session 内独立合成，不跨午休；
- 任一组成分钟缺失、discarded 或冲突，整个高周期保持 `unknown`；
- Chan 只投影现有 Phase B latest Fenxing、Bi、Channel 及 count；
- Redis bar 使用窗口临时 ordinal，不能冒充数据库 K id，也不新增 Chan persistence；
- episode key 为
  `(definitionId, versionId, securityId, period, signalKind)`；
- `unknown|false → true` 产生 candidate，持续 true 抑制，完整 false 重置，错误或不完整回到
  unknown；进程重启从 unknown 开始。

## 5. Safety stash 复用规则

五个仓库的 safety stash 是候选代码材料，不是已完成交付物。不得整体 `stash apply`，也不得按旧
tasks 批量勾选。实施时先逐文件分类：

| 候选内容 | 默认处理 | 进入新 change 的条件 |
|---|---|---|
| decimal parser、定点 delta、纯 candle bucket/aggregation tests | `reuse` 候选 | 与新 string/null、scale/range 契约一致并重新测试 |
| keyed queue、finalizer 原子 Redis 操作、deploy Redis service | `rewrite/reuse` 候选 | identity 改为 `securityId`，移除 `securityCode` 和旧 key |
| paired rule validator/evaluator、context builder、migration tests | `rewrite/reuse` 候选 | 由本 change Gate B 接管，先做真实 migration preflight |
| BullMQ、reconciler、period/window/Chan adapter | `rewrite/reuse` 候选 | 满足物理 Redis 隔离、有界容量和 unknown 语义 |
| `MarketKQueryService`、通用冷热 K API、前端 K 合并 | `discard` | 明确不属于 V1 |
| providerSymbol Redis key、securityCode payload、boolean episode | `discard` | 与新 identity/三态契约冲突 |
| 旧 task completion、过期 SHA/worktree 假设 | `discard` | 只能重新验证，不能继承完成状态 |

原 stash 必须保持不变，选择性移植应通过临时 patch 或逐文件 checkout 后重新审查，并记录采用/
拒绝理由。

## 6. 配置、持久化与发布

```text
REALTIME_PRODUCTIZATION_MODE=off|shadow|on
REALTIME_STRATEGY_MODE=off|shadow|on
MIST_REALTIME_REDIS_URL=...
MIST_QUEUE_REDIS_URL=...
```

- 两个 mode 均默认 `off`；
- strategy `shadow` 只评估和记录观测指标，不写策略表；
- strategy `on` 要求 candle foundation 已为 `on` 且 HIL accepted；
- logical signal identity 对 source-agnostic candle 唯一，同一 candle 的重复 job 由数据库唯一键
  幂等；
- migration `001–013` 不可修改。下一编号必须在真实 `schema_migrations` preflight 后确定；
- rollback 先关闭 strategy，再按兼容版本组回滚应用，不能假设新 schema 可直接运行旧镜像。

## 7. 文档所有权

- 可执行开发范围和步骤：
  `openspec/changes/build-realtime-strategy-signal-pipeline/`
- 项目质量门禁：`docs/project-quality-governance-guide.md`
- 稳定能力契约：`openspec/specs/`
- `sync-post-close-provider-history`：仍是无限期延期草案；Redis candle 不因此写回 MySQL；
- 历史 OpenSpec archive 和日期化审计报告：只作当时证据，不回写为当前状态；
- 架构 review 提示词：只负责审查本长期文档、新 change、当前代码与运行证据。

旧 B1、portfolio active change、MarketKQueryService 设计和 connect 实施提示词已由本文与新 change
替代。若未来启动完整 portfolio simulation 或通知投递，必须分别创建新的 focused change。
