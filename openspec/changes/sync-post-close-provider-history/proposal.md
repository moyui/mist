## Why

Redis candle 只代表当日实时产品状态，不能成为 MySQL 历史事实来源。市场收盘后必须由 TDX/QMT
历史接口回填各自 source-specific 1 分钟 K，并在逐项验证成功后安全清理对应 Redis 分区，才能让
次日查询稳定地只依赖 provider 权威历史。

## 当前状态与授权边界（2026-07-29，最终复核）

本 change 当前是**无限期延期草案**，不属于当前交付计划，不授权修改或部署
`apps/schedule`。依赖 change 完成、代码条件成熟或 OpenSpec 中仍存在未完成任务，都不能自动
解除延期。只有项目负责人再次明确授权后，才可重新逐项评审 proposal、design、specs 和未完成
tasks；不能因为已有详细草案就推定方案已经确认。

当前只确认以下边界：

- `apps/schedule` 包必须保留；它后续除历史同步外还可能承载其他内部任务，本 change 不删除、
  不改名，也不把它收缩成只能存在一个用途的包。
- 现有 EastMoney cron 和采集后 `StrategyScanService.runScan()` 暂时保持现状。是否删除、替换或
  迁移到其他 owner，留待以后重新讨论。
- TDX/QMT 收盘后权威历史同步、MySQL readback digest 和 Redis 精确清理是未来候选能力，当前
  均未授权实施；具体 source、market、时间窗、空集合、重试、digest 和 cleanup 规则仍可修改。
- 当前生产 Compose 继续不部署 `apps/schedule`。未来任何启用必须有独立 feature flag、dry-run、
  隔离验证和生产发布审批。
- 当前数据库基线已经推进到 migration 013；migration 007～013 所定义的精度、约束、命名和
  退休字段均是未来重开本 change 时必须继承的既有事实，不得回写或重新编号。

下面的 “What Changes”、delta specs 和 tasks 记录的是后续讨论底稿，不表示当前生产承诺，
也不得作为 agent 自动实施队列。

## What Changes

- 正式构建和部署现有 `apps/schedule`，使用同一 Mist image 的独立 command、内部 health 和
  `HISTORICAL_SYNC_ENABLED=false` 默认关闭。
- 先完成 `remove-orphaned-data-collection-scheduler`，不复用或恢复未注册的
  已退休的通用调度抽象；替换 schedule app 当前 EastMoney 分钟采集与每分钟 MySQL scan cron。
- 对所有 active security 的 enabled TDX/QMT `SecuritySourceConfig` 分别请求目标交易日
  `Period.ONE_MIN`，不只选最高优先级 source；provider 成功返回多少条合法 bar 就保存多少条，
  不要求固定根数或末根覆盖。
- A 股默认 15:10、港股默认 16:20 首次执行；失败项每 10 分钟重试至次日 08:00，所有时间可配置。
- 使用 MySQL advisory lock 保证同一 market/tradingDay 的单次 dispatch/retry cycle 只有一个
  owner；每轮 `finally` 释放，不跨 10 分钟等待持锁，不新增 migration。
- provider 成功返回非空 normalized result 时，必须通过 identity、session、唯一有序 timestamp、
  required field 和
  MySQL round-trip count/digest 验收；成功返回空集合是正常 no-op，不写占位 K、不重试。
- provider 成功完成后，无论返回合格非空数据还是空集合，都按 source/security 对 Redis
  partition 执行相同的精确幂等清理；只有 provider 请求失败、非空结果无效或持久化/回读失败才保留
  Redis 并进入 retry。
- provider 历史是权威值；失败重试或 operator 显式 manual rerun 返回修订值时，同一唯一键允许
  覆盖。成功 item 不为发现潜在修订而自动重复拉取；Redis candle 不补洞，差异只记录诊断指标。
- provider 调用使用按 source 分组的 bounded concurrency、显式 request timeout 和每轮最大 item
  guard，禁止 unbounded `Promise.all`；超过 guard 时整轮 fail closed 并告警，不静默漏项。
- schedule operational status 与精确 cleanup 只连接既有 `MIST_REALTIME_REDIS_URL` /
  `mist-realtime-redis`；本 change 不部署 BullMQ 或 `mist-queue-redis`。未来 queue Redis 必须与
  market-data Redis 物理隔离。
- 失败项作为查询不可见的恢复缓存保留 72 小时 TTL；超时仍失败必须告警，且不得阻塞其他成功项。
- historical API 与 bridge 行为相对于依赖归档后已接受的 schema-v2 realtime baseline 保持不变；
  本 change 不修改 formal frame、fixture/SHA、transport mode 或 provider-local bridge fence，
  也不重新引入 schema-v1 formal epoch/per-symbol sequence。
- 提供 manual dry-run/shadow、自动调度、单项重试、发布回滚和 protected-table digest 证据。

## Capabilities

### New Capabilities

- `post-close-provider-history-sync`: source-aware 调度、advisory lock、provider 验收、MySQL
  round-trip、重试截止和逐项 Redis 清理契约。

### Modified Capabilities

- `backend-datasource-integration`: schedule app 成为 provider historical sync owner，同时继续排除
  realtime transport 和 public product API。
- `datasource-provider-contract`: TDX/QMT historical API 必须支持目标交易日 `1m` 请求及可验证
  normalized result。
- `database-schema-safety`: 允许仅目标 source/security/tradingDay 的权威 historical upsert，
  明确无 migration 和 protected digest 边界。
- `strategy-scheduler-alert-delivery`: 移除旧的“每次分钟采集后运行 MySQL scan”职责；schedule
  只执行收盘历史同步，realtime strategy/signal 仍由后续 focused change 定义。
- `monitoring-health-alerts`: 增加历史同步 lag、pending/failure、retry deadline、TTL 和 cleanup
  指标与告警。
- `windows-docker-appliance`: 增加内部 schedule service、health、依赖、flag、manual dry-run 和
  rollback 部署契约。

## Impact

- **依赖**：必须在 `productize-current-day-realtime-market-data` 和
  `remove-orphaned-data-collection-scheduler` 完成后实施；不得越过前者的 Redis schema/query
  contract。归档的 B1 baseline 必须已经消费
  `migrate-qmt-realtime-to-native-subscription` 的 schema-v2 contract；本 change
  只能以该 accepted baseline 判定 realtime 是否“不变”，不能要求更早的 v1
  epoch/per-symbol sequence。
- **`mist`**：重构 `apps/schedule`，复用现有 TDX/QMT historical fetch/save、MySQL transaction
  和 source-specific K/extension upsert。
- **`mist-deploy`**：新增 schedule service/command/config/health、manual workflow、自动启用与回滚；
  复用 `mist-realtime-redis`，不新增 queue Redis。
- **`mist-monitoring`**：新增 sync/cleanup/TTL 指标与告警。
- **`mist-datasource`**：预期只加强历史 API contract tests；相对于依赖归档后
  记录的 accepted schema-v2 baseline，不修改 realtime frame 或 bridge。
- **数据库**：不新增或修改 migration；只允许目标交易日 `k` 与对应 source extension 改变。
- **B2**：本 change 归档并刷新生产基线后，组合回测仍只读取 MySQL 历史日 K。
