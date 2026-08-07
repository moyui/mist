# Realtime Strategy 基线与影响链（2026-08-04）

## 1. 执行基线

本 change 的实现工作区固定为：

- repository：`mist`
- worktree：`mist/.worktrees/run-realtime-strategy-evaluation`
- branch：`feat/run-realtime-strategy-evaluation`
- base：`master@d8e413d`
- branch head（本记录创建前）：合并 master 后的当前 HEAD
- dirty：记录前为 clean

工作区父目录下相关仓库的只读快照：

| Repository | Branch | HEAD | Dirty | 说明 |
| --- | --- | --- | --- | --- |
| `mist` 主目录 | `feat/productize-current-day-realtime-market-data` | `917b646efbc2` | no | 落后基线，只作旧 worktree，不用于本 change 判断 |
| `mist-datasource` | `feat/productize-current-day-realtime-market-data` | `e2094dd5ec52` | no | 本批不修改 |
| `mist-deploy` | `feat/productize-current-day-realtime-market-data` | `5269b0cd4d64` | no | 后续任务 6.1/6.3 修改 |
| `mist-monitoring` | `feat/productize-current-day-realtime-market-data` | `4718416f304c` | yes | dirty 仅为未跟踪 `.worktrees/`，本 change 不接管 |
| `mist-fe` | `feat/design-system-phase0` | `6515bfedbc47` | no | manual-scan consumer 已由独立前端交付处理 |
| `mist-skills` | `feat/productize-current-day-realtime-market-data` | `9458f26f67eb` | no | 本批不修改 |

不得在 `mist` 主目录的旧分支继续实现或从该目录运行 `openspec list` 作为当前状态。

## 2. 前置门禁

### Service boundary 与 evaluation contract

- `standardize-service-boundary-contracts` 已归档，HTTP/RPC envelope 与 correlation contract 已进入 stable
  specs。
- `evolve-strategy-evaluation-contract` 已于 master commit `35b2634` 同步 stable specs 并归档为
  `archive/2026-08-04-evolve-strategy-evaluation-contract`。
- 生产只读审计证据固定在该 archive：2026-08-04 捕获时 migration ledger 为 `001`–`013`，六张策略
  目标表均为零行；候选 migration `014` 随前置 change 交付。运行 on-mode persistence 前仍须以目标
  环境 preflight/readback 重新确认 schema，不把旧审计当作永久事实。
- `strategy_versions.signal_kind`、`strategy_signals.security_id/signal_kind`、删除 live
  `security_code`、`fk_strategy_signals_security` 和既有
  `uq_strategy_alert_events_dedupe_key` 的代码契约已由前置 change 持有；本 change 不新增 migration。

### Candle foundation

- `complete-current-day-realtime-candles` 自动化、strict contract、真实 snapshot fixture 回放和 shadow
  基础已通过，支持本 change 的 off/shadow 开发。
- `RealtimeMarketDataProductService.syncExpectedBuckets()` 从当前 TDX/QMT allowlist 建立 active-listener
  expected series，并为完整理论 1m bucket 登记 due。
- due 到期且没有 Node candidate 时，`processDueMember()` 以 `no_snapshot` 调用
  `CandleFinalizer.discardDue()`；事务提交后才发布 `outcome=discarded` 的
  `CandleFinalizedTriggerV1`。
- 定向测试覆盖“allowlisted series 没有 snapshot 仍产生 discarded trigger”。因此 Signal 不实现第二套
  session/grace timer。
- 真实交易时段 timestamp/quantity、restart/AOF、capacity、protected-table 零写入与负责人审核继续是
  candle 5.4/5.5 和 Signal 6.4/6.5 的 on promotion 门禁；不阻塞离线自动化、off 部署或 shadow。

## 3. 当前运行与存储基线

### Strategy schema 与存量

- 最新固定生产审计记录六张策略表零行；migration `014` 的隔离 MySQL 验证由前置 archive 保存。
- 当前 TypeORM entity 已使用 live `StrategySignal.securityId` 与 `signalKind`，并声明
  `fk_strategy_signals_security`；AlertEvent entity 继续声明 named unique
  `uq_strategy_alert_events_dedupe_key`。
- Backtest 表仍使用其独立 `security_code` identity，不属于 live Signal migration。

### Market Redis

- endpoint：`MIST_REALTIME_REDIS_URL`。
- market namespace：`mist:realtime:v1`。
- current-day owner：closed candle、watermark、manifest、due ZSET；AOF/retention 由 candle foundation
  和 deploy contract 持有。
- BullMQ prefix：`mist-bullmq`；queue：`strategy-trigger`；job：`candle_finalized`。
- 本分支已经声明 queue dependencies/constants 和纯 handoff/worker classes，但尚未在 Nest module 中
  注册 producer、Worker 或 Signal market reader。

### Historical K

- MySQL `k` 是 prior-day historical authority；本 change 不迁移 K、不写 Redis candle 回 MySQL。
- realtime adapter 必须排除 trigger 当日 MySQL K，并从 Redis 读取当日且早于 anchor 的 sealed 1m。
- quantity profile 的 on-mode eligibility 仍受 TDX/QMT HIL 门禁约束。

### Legacy manual scan

- 当前 `apps/mist/src/strategy/scanner` 只剩 named AlertEvent unique 的 MySQL contract test；
  `StrategyScanController`、`StrategyScanService` 和 DTO 已不在产品代码中。
- living stable specs 与 `strategy-api-paths.spec.ts` 仍声明 `/v1/strategy-scans/run`，属于任务 3.4 待删除
  的契约残留。
- `apps/schedule` 当前只装配 historical collection；notification delta 已明确删除 schedule strategy-scan
  owner 遗留语义。

### Compose 与 monitoring

- 当前 Compose 尚无 `signal` service、8010 health、9010 RPC 或 Signal env wiring。
- 当前 monitoring 尚无 Signal scoped health decoder、BullMQ queue probe 或 window/episode metrics。
- `REALTIME_STRATEGY_MODE`、Signal config schema和 enabled-mode conditional module wiring 尚未实现。
- 这些缺口分别由任务 4.1、6.1、6.2 持有，不得从现有 candle Redis 部署推断已具备。

## 4. Producer → Wire → Decoder → State → Consumer → Deploy/Monitoring

| Stage | Owner / current code | Current state | Remaining owner |
| --- | --- | --- | --- |
| Producer fact | `RealtimeMarketDataProductService` 在 sealed/discarded commit 后调用 post-commit port | pure hook 与 failure isolation 已实现；Nest producer 尚未注册 | 3.1/3.2 |
| Wire | BullMQ prefix `mist-bullmq`、queue `strategy-trigger`、job `candle_finalized`，使用现有 Redis | contract/constants/dependencies 已存在；conditional queue module 未实现 | 3.1/4.1 |
| Decoder | `parseCandleFinalizedTriggerV1()` 严格解析 exact union，Worker 校验 job name | unit/negative tests 已完成 | 4.5 complete |
| Market state | Redis sealed/discarded watermark + current-day manifest/due | candle owner 已实现；Signal reader/compensation 未实现 | 2.1/2.2/3.3 |
| Runtime state | registry → source group → ring window → period builder → projector/analysis/evaluator → episode | 第一批纯 window/period/evaluation/episode 类已存在；尚未由 app 统一持有 | 2.3/2.4/4.1–5.1 |
| Persistence | on 模式短事务写 Signal + PENDING AlertEvent；shadow 零策略表写入 | 前置 schema/entity 已交付；runtime writer 未实现 | 5.2–5.4 |
| Consumer handoff | notifier 只消费持久化 PENDING AlertEvent | `deliver-strategy-notifications` 明确延期 | 后续 change |
| Deploy | shared image 中的 `apps/signal`，内部 8010/9010，共享 Redis/MySQL | 尚未实现 | 6.1 |
| Monitoring | raw scoped health + bounded queue/window/evaluation/episode/persistence metrics | 尚未实现 | 6.2 |
| Production gate | off → shadow → on | 只允许继续 off/shadow；真实 HIL 与负责人审核未完成 | 6.4/6.5 |

这条链确认 market sealing 不等待 Signal，queue failure 不回滚 candle，Signal failure 不改变 transport/
candle health，notification failure域不进入本 change。
