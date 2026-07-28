## 1. 前置门禁与基线

- [ ] 1.1 确认 `align-realtime-native-ingress-contracts` 已归档且正式 realtime production baseline、TDX `600030.SH`、QMT `300502.SZ`、restart/rollback 和 protected digest 证据可追溯。
- [ ] 1.2 对六仓库执行 fetch，记录 `master`、upstream、worktree、dirty changes 和 CI 状态；从最新 `master` 创建本 change 的全新对应分支，不覆盖用户改动。
- [ ] 1.3 记录 backend、datasource、deploy、frontend、monitoring 当前 SHA 和 migration `006` checksum；确认本 change 不新增 migration、不修改 bridge、不改变 `builtin|off` transport contract。
- [ ] 1.4 审计 Redis dependency、K 查询、Chan/Indicator 和前端类型入口，形成 implementation map 与可独立回滚的跨仓库 commit 顺序；明确 StrategyScan/Signal/Alert/BullMQ 均不在本 change 实施。

## 2. Golden contract、identity 与 Redis 基础设施

- [ ] 2.1 建立 TDX/QMT frame → in-memory latest/open candle → Redis due/closed/watermark + compact closingSnapshot → query response/frontend 的 canonical golden fixtures 与 `.sha256` sidecar，并在消费仓库验证同一 SHA。
- [ ] 2.2 在 `mist` 用 `ioredis` 建立 `MIST_REALTIME_REDIS_URL` typed config、connection lifecycle、health 和 Redis repository；移除未使用且冲突的 Redis client dependency，禁止双 client 并存；配置 `enableOfflineQueue=false`、有界 `maxRetriesPerRequest`、connect/command timeout，保证 product task 有界结束且断线旧命令不在恢复后回放。
- [ ] 2.3 在 backend product boundary 将 transport `symbol` 显式解析为 `securityId + securityCode + providerSymbol`：`securityCode` 使用无市场后缀的 canonical `Security.code`（如 `300502`），`providerSymbol` 保留 source-specific `formatCode`（如 `300502.SZ`）；不得修改 datasource frame、allowlist、fencing 或 diagnostic transport symbol。
- [ ] 2.4 在 `SecurityService` 的 security/source 初始化与新增、更新、删除事务中校验 canonical identity：同一 `(source, normalized formatCode)` 不得关联多个 `securityId`；enabled TDX/QMT configs 的唯一最高 `priority` 定义 effective realtime source，最高并列时拒绝 mutation，无 TDX/QMT config 时保持非 realtime 可用；mutation若会改变或移除已初始化的`source + providerSymbol`，则以`EFFECTIVE_SOURCE_CHANGE_UNSUPPORTED`原子拒绝；不新增 migration。
- [ ] 2.5 启用前只读审计已有 `SecuritySourceConfig` identity/priority 冲突；从已校验 `securityId -> effective source + providerSymbol` 映射生成并按 `securityId` 去重的 desired subscription，不做 freshness/owner 自动 failover；allowlist 只作 safety ceiling，非 effective source frame 以 `non_effective_realtime_source` 拒绝 candle product path；所有 latest/open/queue runtime identity 统一为 canonical `securityId`，source/providerSymbol 只作映射与 Redis 分区元数据。
- [ ] 2.6 实现 `Asia/Shanghai` day routing、provider symbol 安全编码、日级 closed Hash、sealing watermark、manifest/due keys；目标过期点为 day-end-plus-72h，由统一 Node `Clock` 计算剩余时长并使用相对 `EXPIRE`/`PEXPIRE`，禁止 Redis snapshot/latest/timepoint/mutable-open 和任何 strategy/evaluation state key。
- [ ] 2.7 保持按 canonical `securityId` 定位的 effective-source Node.js latest 直接覆盖并在同 identity 的 Node open state 聚合；新 bucket 首次出现时只登记一次 Redis due/manifest/TTL，后续 accepted frame 禁止把完整 open record 重复写入 Redis/AOF；无 `eventTime` 时只更新 latest。
- [ ] 2.8 在 `RealtimeSnapshotIngressService.handleSnapshot()` transport acceptance 后同步记录 `acceptedAt` 并立即提交到无第三方依赖的 `Map<securityId, Promise<void>>` keyed queue；snapshot update与finalizer共用该队列，同 security 串行、不同 security 并行 I/O、task 执行前复核 epoch，前序失败不阻断后续。**注：epoch 复核待 `CanonicalRealtimeSnapshot` 补充 streamEpoch 字段后实现。**
- [ ] 2.9 增加 per-key/global pending limit、oldest-age、overflow metric 和 shutdown stop-accept/drain；overflow 禁止 snapshot coalescing，受影响 candle 标记 `queue_overflow` 并丢弃。
- [ ] 2.10 明确单 product writer runtime guard：不引入 Lua、`WATCH/MULTI` retry、Redlock、distributed lock 或 worker thread；`shadow|on` 禁止 backend replicas 大于 1，image upgrade 使用 stop-old/start-new。
- [ ] 2.11 实现并测试 `REALTIME_PRODUCTIZATION_MODE=off|shadow|on` 的配置解析、默认 `off`、diagnostic/health 和 fail-closed 行为。
- [ ] 2.12 建立可注入的统一 Node `Clock`：provider `eventTime` 只负责 day/session/bucket，datasource `capturedAt` 只诊断，Node 生成 `acceptedAt`/`closedAt` 并控制 due、finalizer、query rollover 和相对 TTL；不得使用 Redis `TIME`、MySQL `NOW()` 或不可替换的散落 `Date.now()` 参与业务判断。
- [ ] 2.13 实现 effective-source immutability guard：改变或移除已初始化`source + providerSymbol`的mutation必须在配置提交前原子拒绝，且不得调用`sync_subscriptions`/`subscribe`/`unsubscribe`、不得改变desired/actual或latest/open/baseline/closed state；runtime source switch留给未来独立change。

## 3. 当日一分钟 candle 状态机

- [ ] 3.1 以 table-driven tests 固化 A 股与港股 session/calendar、分钟 bucket、午休、TDX/QMT source-specific grace、A 股 15:02 与港股 CAS 16:10；`close+5s` 只作为 shadow 候选值。
- [ ] 3.2 实现每 `tradingDay + securityId` 唯一 effective-source、独立有界的 Node per-bucket open candle、Redis source-specific closed/watermark、last applied event 与累计量/额 baseline。
- [ ] 3.3 实现 snapshot-sampled `quality=provisional` OHLC；使用上一根 closed/watermark 的 closing cumulative totals 恢复 baseline；session 中途无 baseline、counter 回退或结构异常时丢弃当前 bucket 并为后续 bucket 重建 baseline。
- [ ] 3.4 重复或可安全忽略的乱序 `eventTime` 只计 metric；禁止负 volume/amount 和跨午休 candle。
- [ ] 3.5 实现 Redis due ZSET 与 finalizer：同 key 按 bucket/cutoff 升序进入 keyed queue，到队首后读取最新 Node open state与 Redis watermark 并复核 time、epoch、sequence、sealed state；valid bucket 以单个 `MULTI/EXEC` 完成 closed HSET、watermark、due ZREM、manifest 和 TTL。
- [ ] 3.6 invalid bucket 推进 `discarded` watermark 但不写 closed；candle sealing 只依赖 market-data 状态，不等待 strategy、MySQL、BullMQ 或其他业务消费者。
- [ ] 3.7 实现 backend restart discard：恢复 closed/watermark/due，任何缺失完整 Node open state 的 due bucket 必须以 `backend_restart_open_state_lost` 丢弃并监控，不合成 OHLC；Redis commit 结果不确定时暂停该 key、product degraded 并 reload 后恢复，不回放 outage 期间错过的 candle。
- [ ] 3.8 每个 Node open bucket只覆盖一份当前 closing snapshot；closed record 只保存 allowlisted compact canonical `closingSnapshot`，禁止完整 native/order book、Redis key 引用、pending-evaluation、eventKey、NotificationEnvelope 或 notification state。
- [ ] 3.9 实现 partition manifest 与 Node `Clock` 驱动的相对 TTL，使后续 change 可按 source/security 精确清理；本 change 不执行收盘归档或旧日业务读取。
- [ ] 3.10 用生产形态 TDX/QMT golden/HIL payload 测量 Node latest、compact closingSnapshot/closed record P50/P95/P99/max bytes、open bucket count/oldest age、normal overlap、Redis `MEMORY USAGE`/used_memory/rss、单 symbol 日稳态、当前日与 72h retention projection、AOF current/base bytes、每分钟 growth、rewrite duration/peak/failure 和 volume/host disk free；废止 414-byte 固定假设并建立 warning/hard capacity budgets。
- [ ] 3.11 记录 `acceptedAt`，实现 `arrivalOffsetMs`、capture/backend ingress lag 和 1/3/5/10/15/30 秒候选 grace 的 late-frame/affected-bucket 统计；严格以 `acceptedAt <= cutoff` 决定 mutation，超过 cutoff 分别记录 `late_after_grace`/`late_after_finalize`。
- [ ] 3.12 增加 TDX/QMT 独立 candle grace、calibration evidence ID 与 shadow observation window；`on` 在缺少 enabled source 的 accepted evidence、ID 或显式 grace 时 fail closed。
- [ ] 3.13 为每个 Node open bucket 建立不依赖 Redis due 的本地 cutoff/hard-horizon sweep；due/manifest 登记失败时标记 `redis_due_registration_failed`，到期经同一 `securityId` queue 丢弃并释放内存，Redis 恢复后只允许幂等清理残留结构，不补写 candle。

## 4. 统一冷热查询与 API

- [ ] 4.1 新增唯一 `MarketKQueryService`：历史日期读 MySQL、当日 `1m` 读 Redis、跨日合并排序并按 `source + security + period + timestamp` 去重。
- [ ] 4.2 自然日切换后立即停止读取旧日 Redis；`shadow/off` 不向产品查询暴露 Redis；非 `1m` period 保持 MySQL-only。
- [ ] 4.3 将 K API、Indicator 和 Chan 逐一迁移到统一边界，禁止各自实现冷热拼接，并做同 fixture 一致性测试。
- [ ] 4.4 增加 latest snapshot/current-day status API，明确 native/canonical、freshness、`provisional`/closed、最近丢弃原因和 degraded/off 响应；不维护分钟连续性/缺口 product state，缺失分钟保持缺失，invalid candle 不进入 K 响应。
- [ ] 4.5 closed candle/query contract 稳定包含 `closingSnapshot`，供未来 strategy change 使用；当前 API 不创建 signal context 或声称策略已接入。

## 5. Frontend、部署与监控

- [ ] 5.1 在 `mist-fe` 更新 API/types/query cache 和 K 页面，显示 valid provisional candle、latest snapshot、source、event/captured time、quality、freshness、closed、最近丢弃/degraded 状态与 product state；缺失分钟不补齐、不创建连续性状态，不得绘制 invalid candle。
- [ ] 5.2 在 `mist-deploy` 增加无 host public port 的 `mist-realtime-redis` service、独立 AOF persistent volume、health、`MIST_REALTIME_REDIS_URL` 和 backend 依赖；新增 closed/closingSnapshot bytes、最大订阅数、Redis memory/AOF、最小磁盘余量、capacity calibration ID 配置，新 flags 默认 `off`；本 change 不部署 `mist-queue-redis`，并记录未来 `MIST_QUEUE_REDIS_URL` 必须使用物理独立 service/volume。
- [ ] 5.3 增加 deploy config validation、Compose tests、diagnostics、shadow/on promotion 和 flag/image rollback；回滚不删除 Redis volume、不运行 migration、不改变 TDX/QMT mode。
- [ ] 5.4 在 `mist-monitoring` 落地 Redis health/command timeout、Security effective-source 初始化/unsupported-change审计失败、effective-source/subscribed counts、non-effective frame、closed commit error、closingSnapshot/closed bytes histograms、Node open count/oldest age/normal overlap/local-sweep backlog、expected/hard-limit failure、current-day/72h projected bytes、Redis used_memory/rss/fragmentation、AOF current/base bytes与 growth rate、rewrite state/duration/peak/failure、volume/host disk free、source/session lateness、grace miss、finalization lag/failure、due-registration failure、restart-open-state loss 和 discard/recovery metrics/alerts；与 transport owner/freshness 分类隔离，长期 label 只允许 `source + market + recordType + outcome/reason` 等低基数维度。
- [ ] 5.5 为 candle invalidation/discard/recovery 实现 versioned structured logs，记录 candle identity、bucket/session、event/captured time、epoch/sequence、OHLC、累计量/额与 baseline、queue/Redis 操作、恢复来源、连续丢弃数和 trace/error；native/Redis value/凭据不得整对象落日志，文本须脱敏限长。

## 6. 自动化验证

- [ ] 6.1 Unit 覆盖 canonical identity、Security/source mutation、effective-source初始化与immutable guard、unsupported change原子拒绝且零subscription control/零product-state mutation、订阅去重/allowlist ceiling/non-effective frame、`securityId` keyed queue、Node latest GC、无 eventTime、Node open overlap/backlog/hard limit/local sweep、无 per-frame Redis mutable write、provisional OHLC、baseline recovery、restart-open-state loss、due-registration failure、invalid reasons、乱序/重复、午休、A/HK close、fixed/fake Node `Clock`、跨分钟延迟归桶、cutoff、grace、finalizer升序/幂等、相对 TTL、uncertain commit reload、compact closingSnapshot allowlist/byte limits、72h projection，以及 structured log/metric cardinality。
- [ ] 6.2 Redis integration 覆盖 `enableOfflineQueue=false`、有界 retry/connect/command timeout、新 bucket 单次 due registration、due 登记失败后的 Node hard-horizon cleanup、恢复后不回放旧命令/不补写 candle、finalization `MULTI/EXEC`、closed `HSET`、watermark、cutoff race、并发 ingress不产生 per-frame full-record writes、commit outcome uncertain、AOF restart/rewrite、current/base/growth/peak measurement、自然日切换、TTL 和 manifest；使用隔离测试 Redis。
- [ ] 6.3 MySQL integration 只验证历史 K 查询兼容性；确认 migration `006` checksum、migration 集合及所有 protected tables 在 B1 盘中流程前后不变。
- [ ] 6.4 Integration 覆盖 Security 初始化/source mutation → 唯一 immutable effective-source mapping/unsupported change原子拒绝且零subscription control → snapshot → Node latest/open aggregation → Redis due/closed/watermark + compact closingSnapshot → query/frontend，以及 restart discard、due-registration failure/local cleanup、非 effective source防御性拒绝、Redis failure isolation和 capacity alarms；断言没有runtime source transition、完整 native进入closed records，也没有 Signal、AlertEvent、BullMQ、queue Redis 或 notification 副作用。
- [ ] 6.5 运行受影响仓库 lint、typecheck、全量 tests、Node/Python/Go build、Docker build、Compose smoke、golden SHA、`git diff --check` 与 OpenSpec strict validation。

## 7. 发布、HIL 与归档

- [ ] 7.1 记录发布前 protected tables row count/digest；先发布 Redis，再发布 backend/monitoring image，product flag 保持 `off`；验证 monitoring 与 structured log 后才允许 shadow。
- [ ] 7.2 切 `shadow`，交易时段分别以 TDX `600030.SH`、QMT `300502.SZ` 验证 native/canonical latest、freshness、Node open/provisional candle、compact closingSnapshot、异常/重启丢弃、AOF recovery；至少采集 3 个完整支持交易日（推荐 5 日）的 lateness/grace、record bytes、resident memory、AOF growth/rewrite peak和 72h projection evidence，且所有 protected tables 不变。
- [ ] 7.3 从 accepted evidence 分别确定 TDX/QMT grace、due scanner jitter、record byte limits、最大订阅数、Redis memory/AOF/disk budgets 和 capacity calibration ID；配置缺失、late/capacity threshold 超限时禁止 promotion。
- [ ] 7.4 切 `on`，验证双源 current-day query 只包含 valid provisional closed candle、缺失分钟不补齐、丢弃/restart loss 可观测、compact closingSnapshot 一致、capacity monitoring 和 frontend 展示；确认 closed record 无完整 native，且没有 strategy evaluation、Signal/AlertEvent、BullMQ、queue Redis 或 notification 副作用。
- [ ] 7.5 复核全部 protected tables row count/digest 与 pre-B1 baseline 一致。
- [ ] 7.6 演练关闭 productization flag 和 whole-image rollback，确认 transport 仍为 TDX/QMT `builtin`、历史 API 正常、Redis volume 保留。
- [ ] 7.7 将 SHA、workflow、artifact、fixture SHA、TDX/QMT calibration/grace、monitoring、HIL、restart、rollback 和 digest 写入 evidence；确认所有仓库 clean/upstream/CI 后 strict validate 并归档。

## Residual work（不计入本 change 完成条件）

- 在策略规则、prior context 和 activation state 正式完成后创建 `connect-realtime-strategy-signals` focused change；定义 `false/unknown -> true` episode、持续为真抑制、continuity unknown 的可识别重发、source-agnostic stable eventKey、按语义组织的 `libs/identity`、Signal/AlertEvent、Node→BullMQ primary 和 MySQL fallback。
- 在 realtime signal change 完成后创建 `deliver-strategy-notifications`，实现 channel consumer、WeCom/AstrBot、retry/dead-letter 与 delivery 状态推进。
- future BullMQ 必须使用 `MIST_QUEUE_REDIS_URL` 连接物理独立的 `mist-queue-redis` service/volume；不得与 B1 的 `MIST_REALTIME_REDIS_URL`、market-data cleanup、TTL 或容量预算共用实例。本 B1 不部署空置 queue Redis。
