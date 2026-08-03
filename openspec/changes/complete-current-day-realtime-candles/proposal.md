## Why

accepted realtime snapshot 目前没有形成可恢复、可审计的当日 K 线状态。该市场数据基础必须独立于
策略计算和通知投递完成，避免下游失败反向阻塞行情封存。

## What Changes

- 将 accepted TDX/QMT canonical snapshot 聚合为有界 Node open candle，并在 grace 到期后封存
  valid/discarded 1 分钟结果；active listener 在完整 bucket 开始时即注册 due，即使整分钟没有 snapshot，
  到期也只写 discarded watermark 而不伪造 K。
- V1 共用默认 `5000ms` grace；rollover 不提前封存，finalizer 按完整 candle identity 操作。Redis
  terminal commit 在 `bucketEnd + 60000ms` hard horizon 内幂等重试，仍失败只记录基础设施缺口，不
  伪造 discarded 或触发策略。
- candle memory 按最多 10 个 active market series 线性约束；keyed queue 使用 `libs/config` 中的
  per-series/global pending 上限，Redis due/replay 使用固定 64 条 command batch，并对 sealed/due/
  manifest record 实施 UTF-8 byte bound。
- 使用 market-data Redis 保存当日 sealed/discarded、watermark、due 和 manifest；不写回 MySQL `k`。
- Redis 中交易日 D 的全部 market-data state 只保留到上海时间 D+1 00:00；Node latest/open candle
  state 在第一条新交易日 accepted snapshot 到来时整体换代，不增加午夜 timer 或跨日恢复缓存。
- 将 realtime `volume/amount`、candle baseline/delta 和 sealed record 的量额统一为规范十进制
  字符串或 `null`；A 股 canonical 单位固定为 `volume=股`、`amount=人民币元`，由 TDX/QMT
  provider adapter 在进入 canonical snapshot 前完成精确单位换算，并保留固定 adapter precision
  provenance。
- `volume` 与 `amount` 的累计 counter 独立处理：同一交易日已有可信 baseline 时，后续 snapshot 的
  对应累计字段为 `null` 表示 counter 没有更新，聚合器保持该 baseline 且本次不增加 delta；尚无可信
  baseline 时继续保持该字段不可用，不凭空补零。该 carry-forward 只属于 snapshot → candle counter，
  不修改 sealed K 的原始 interval fact。下游策略若对 raw null 应用显式的同交易日 forward-fill
  projection，必须由其 owning change 定义，candle 不预先改写该值。
- market-series runtime identity 固定为 `(securityId,source)`，candle identity 再加入 `bucketStartMs`；
  Node state、counter baseline、due/watermark/manifest 和 Redis key 均隔离 source。`providerSymbol` 只作为
  provenance，不进入 identity 或 key。
- 增加 capacity、grace、restart、retention、监控、Windows Compose 和真实交易时段 HIL 门禁。
- 明确本 change 不创建策略 trigger、不连接策略 queue、不运行 evaluator、不写 Signal/AlertEvent。
- 所有 grace、精度、discard、capacity 和恢复细节必须在相应任务实施前逐项评审并记录。

## Capabilities

### New Capabilities

- `current-day-realtime-candle-foundation`: 定义 Node 聚合、Redis 封存、当日恢复、日切 expiry 和下游隔离契约。
- `exact-decimal-arithmetic`: 定义量额共用的 `Decimal8` 定点值、边界序列化、有限运算、精确整数
  单位缩放和溢出契约。

### Modified Capabilities

- `realtime-market-data-ingress`: accepted snapshot 后增加可失败隔离的 candle sink，并收紧 canonical 量额契约。
- `backend-datasource-integration`: 明确 TDX/QMT native 量额验证、规范化和 precision provenance。
- `windows-docker-appliance`: 部署物理独立的 market-data Redis，并保持产品模式默认关闭。
- `monitoring-health-alerts`: 增加 candle、Redis、grace、discard、capacity 和 recovery 观测。

## Impact

- **`mist`**：canonical quantity、candle aggregation/finalization、market Redis adapter、health 和测试。
- **`mist-datasource`**：TDX quantity producer contract、OpenAPI/fixture/negative tests。
- **`mist-deploy`**：`mist-realtime-redis`、环境变量、health、启动顺序和回滚验证。
- **`mist-monitoring`**：market Redis 与 candle 低基数指标。
- **不包含**：MySQL `k` 单位迁移、策略 schema、统一公共 K API、BullMQ、notification、portfolio
  或 Chan persistence。
