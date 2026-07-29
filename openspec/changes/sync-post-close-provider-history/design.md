## Context

`productize-current-day-realtime-market-data` 定义 Node.js bounded latest snapshot、Redis 当日 candle 和自然日查询边界，
但 Redis candle 永远不是 MySQL 历史来源。当前 `apps/schedule` 已存在却未进入 Docker image/
Compose，仍包含 EastMoney 多周期 cron，并在每次采集后调用 MySQL-only `runScan()`。另有
未注册的通用采集调度抽象由独立 cleanup change 删除。

TDX/QMT backend source 已能通过 datasource historical HTTP API 拉取 `Period.ONE_MIN` 并沿用
source-specific `K`/extension upsert。migration 013 是当前生产上限，本 change 不新增 schema。

### 当前决策状态（2026-07-29）

本设计已无限期暂停在讨论阶段。`apps/schedule` 作为可承载多类内部任务的应用包继续保留；
当前 EastMoney cron、采集后 `runScan()`、TDX/QMT post-close sync、readback digest 和 Redis
cleanup 均不在本轮修改。依赖完成不会自动恢复本 change；只有项目负责人再次明确授权后，
才能重开评审。下面的具体实现选择只作为未来候选，恢复工作前允许重写，不得直接按现有 tasks
开始实现。

## Goals / Non-Goals

**Goals:**

- 把 `apps/schedule` 正式部署为内部 post-close provider history sync worker。
- 对所有 enabled TDX/QMT source/security 独立拉取、验证、upsert、round-trip 和清理。
- 让失败项可重试至次日 08:00，并隐藏保留相应 Redis 恢复缓存最多 72 小时。
- 用 advisory lock、feature flag、dry-run、metrics 和 protected digest 支持安全生产发布。

**Non-Goals:**

- 不从 Redis candle 写 MySQL，不用 Redis 补 provider 缺口。
- 不恢复已退休的通用调度抽象，不保留 EastMoney 分钟 cron 或 schedule strategy scan。
- 不修改依赖归档后已接受的 schema-v2 realtime transport/bridge/frame，不重新
  引入 schema-v1 formal epoch/per-symbol sequence，也不实现盘中 collection。
- 不新增 migration，不改变 B2 只读 MySQL 日 K 的边界。

## Decisions

### 依赖与 ownership

实现前必须：

1. 归档 `productize-current-day-realtime-market-data`，冻结 Redis
   manifest/query contract；其 accepted baseline 必须已经消费
   `migrate-qmt-realtime-to-native-subscription` 的 schema-v2 formal frame、
   fixture/SHA 与 canonical identity；
2. 完成 `remove-orphaned-data-collection-scheduler`，删除未注册旧 owner。

新的 `PostCloseProviderHistorySyncService` 只存在于 `apps/schedule`。Mist backend 继续拥有 public
API 和 realtime evaluation；schedule 不挂载 realtime clients，也不暴露 public strategy API。

本 change 中“realtime 不变”始终以完成上述依赖后记录的 accepted schema-v2
baseline 为比较对象，而不是以本 change 最初编写时的 schema-v1 字段为对象。
historical `/v1/bars/query`、normalizer、source-specific persistence 和届时已
接受的手工 bridge 行为保持不变；post-close code、test 或 fixture 不得要求或
重新引入 formal `streamEpoch`、`sequence`、`sequenceScope` 或 per-symbol
sequence fence。provider-local bridge owner/lease fence 只按 accepted
baseline 保持不变，不得被误写成 datasource→backend formal frame 字段。

### Schedule runtime

Docker build 同时构建 `mist`、`schedule` 和现有应用产物；Compose 使用同一 Mist image，以
`node dist/apps/schedule/main` 运行独立 service。只在 Docker network 暴露内部 health，不映射
宿主业务端口。

`HISTORICAL_SYNC_ENABLED=false` 默认关闭自动 cron。manual workflow 支持明确的
market/tradingDay/source/security filter 和 `dryRun=true`；dry-run 可以调用 provider、normalize
和验证，但不得写 MySQL 或删除 Redis。

旧 `DataCollectionController` 的 EastMoney 1/5/15/30/60/daily/weekly/monthly cron 与
`runScan()` 顺序全部移除。首版 schedule 只负责 TDX/QMT post-close `Period.ONE_MIN`。

### 调度、trading day 与 retry

调度按 `Asia/Shanghai`：

- A 股首次 15:10；
- 港股首次 16:20；
- pending/failed item 每 10 分钟重试；
- 截止次日 08:00；
- delay、interval、deadline 全部可通过严格验证的环境变量覆盖。

worker 使用交易日服务确定目标 trading day，不以“今天是工作日”代替交易所日历。每个
`market + tradingDay` dispatch/retry cycle 获取 MySQL `GET_LOCK` advisory lock；锁必须绑定
专用 QueryRunner connection，并在该轮枚举、受控处理和状态提交结束后的 `finally` 中释放。
不得跨 10 分钟 retry 等待或持有到次日 08:00。下一轮重试重新竞争锁；获取失败只表示另一个
owner 正在执行该轮，不算 provider failure。
schedule 的当前时间、首次执行、retry 和 cutoff 均使用与 backend 相同语义的可注入 Node
`Clock`；MySQL `NOW()`、Redis `TIME` 和 Redis/MySQL server clock 不参与调度或清理判断。
operational key 的 72 小时 TTL 由 Node 计算剩余时长并使用相对 `EXPIRE`/`PEXPIRE`。
Windows/NTP 与跨组件 clock-skew 属于后续 production operations readiness，不进入本 change。

### 工作项与 source-specific 范围

每轮从 MySQL 查询 active `Security`，展开所有 `enabled=true` 且 source 为 TDX/QMT 的
`SecuritySourceConfig`。工作项 identity 为：

```text
tradingDay + market + source + securityCode + providerSymbol + Period.ONE_MIN
```

不使用 source priority 折叠。同一 security 的 TDX 与 QMT 分别拉取、写入、验收和清理。
operational attempt/status 通过 `MIST_REALTIME_REDIS_URL` 放在 `mist-realtime-redis` 的独立
namespace，带 72 小时 TTL；它不是 market K 查询数据。本 change 不部署或连接 BullMQ/
`mist-queue-redis`。未来 notification queue 必须使用物理独立 service/volume，不能只靠 logical
DB 与 market data 隔离。

### Bounded dispatch 与 provider timeout

每轮 inventory 展开必须先受 `HISTORICAL_SYNC_MAX_ITEMS_PER_RUN` 限制。若 eligible item 数超过
guard，整轮 fail closed 并告警，不能截断列表后静默遗漏。实际 provider 调用按 source 使用小型
bounded concurrency limiter，不允许对全市场直接 `Promise.all`：

```text
HISTORICAL_SYNC_TDX_CONCURRENCY
HISTORICAL_SYNC_QMT_CONCURRENCY
HISTORICAL_SYNC_PROVIDER_TIMEOUT_MS
HISTORICAL_SYNC_MAX_ITEMS_PER_RUN
HISTORICAL_SYNC_CYCLE_TIMEOUT_MS
```

每个 request、normalize、MySQL transaction/readback 和 Redis cleanup 都必须有显式 item scope；
provider timeout 只使该 item pending，其他 item 继续。并发与 timeout 默认值在隔离测试和
manual dry-run 中校准，越界/非法配置启动失败。cycle 超过自己的 execution deadline 时停止
dispatch 新 item，等待在途 item 有界结束，记录剩余 pending，释放 advisory lock。

### Provider 请求与 normalized 验收

每项调用既有 backend source service，由其访问对应 datasource `/v1/bars/query` historical API，
请求完整 trading day 与 `Period.ONE_MIN`。不得调用 realtime frame、memory snapshot 或 Redis
candle 生成 provider input。

normalized result 必须：

- provider 请求成功返回空集合时，视为正常 no-op；schedule 不解释停牌、休市或无成交原因，
  不写 MySQL 占位 K、不生成 `null` K、不重试，并继续执行该 item 的精确 Redis 清理；
- provider 请求成功返回非空集合时，所有 timestamp 必须落在该 market 的有效
  session/bucket，且 timestamp 严格唯一、升序；
- 非空集合的 source/security/period identity 必须与工作项一致；
- 非空集合的数值、扩展字段和累计/单根单位必须通过既有 source validator。

provider 成功返回多少条合法 bar 就保存多少条；不校验预期根数、连续分钟或 final bucket
coverage，也不因停牌、半日市、临时休市或 provider 少返回若干分钟而判失败。provider 请求本身
失败，或非空集合 identity/排序/唯一性/session/字段无效时，item 才进入 pending 且不清理 Redis。
provider-specific 差异由 adapter 处理，不要求 TDX/QMT 结果彼此相等，也不使用 Redis 是否曾有
realtime candle 来否定 provider 的成功空集合。

### MySQL authoritative upsert 与 round-trip

非 dry-run 且 provider 返回非空集合时，在隔离的 item transaction/critical section 中沿用现有
`saveK` 和 extension upsert。同一 `security + source + period + timestamp` 的 provider 修订值
允许覆盖。失败 item 的自动 retry 或 operator 显式 manual rerun 都可带来修订值；成功 item 不为
主动寻找修订而自动重复拉取。写入后按本次返回的 source-specific unique keys 回读 canonical +
source-extension，计算稳定 count/digest 并与本次 normalized provider result 比较；同日既有但
不在本次返回 key set 内的行不删除，也不参与本次 round-trip。首版不把 provider 缺少某根解释为
删除指令。

非空集合只有 count/digest 完全一致才完成 item；成功空集合不进入 MySQL transaction，直接作为
成功 no-op 完成。Redis 与 provider candle 的差异只写诊断 metric，不阻止 provider 权威数据，
也不阻止成功空集合完成。其他日期、source/security 和 protected tables 不得改变。

### 精确 Redis 清理与 TTL

完成的 item（非空结果已通过 MySQL round-trip，或 provider 成功返回空集合）从 B1 结构化
manifest 解析该
`tradingDay + source + securityId + providerSymbol` partition 的日级 closed-candle Hash、
sealing watermark/baseline checkpoint、due member 和 manifest 自身并精确删除。Redis 不存在
snapshot/latest/timepoint/mutable-open/pending-evaluation keys。不得使用全天
wildcard/`FLUSHDB`。manifest 或其中某个 key 已不存在时视为幂等清理成功；一个 item 失败不得
回滚或阻塞其他 item。

自然日切换后 B1 query 已停止读取旧日 Redis，所以清理延迟不会污染历史查询。只有 provider
请求失败、非空结果无效或非空结果持久化/回读失败的 item 才保留原 market-data keys 到既有
目标过期点；该 TTL 由 Node `Clock` 计算剩余时长并相对设置，同时产生 pending/expiry alert。
schedule status key 记录最后 attempt/error/deadline。TTL 到期仍未完成时必须告警，但不得把
Redis candle 补写到 MySQL。

### Health、metrics 与证据

内部 health 至少暴露 enabled、owner/lock、target day、last run、pending/verified/failed count、
next retry 和 deadline。monitoring 输出 source/market-labelled sync lag、attempt failure、
pending age、digest mismatch、cleanup failure 和 TTL-expiry-risk。

生产 evidence 对每个 source/security 保存 provider normalized digest、MySQL round-trip digest、
Redis manifest/cleanup 结果及 protected-table before/after。日志和 artifact 不得包含 native
secret/config credential。

实现前还必须记录 accepted schema-v2 formal fixture/SHA、installed TDX/QMT
bridge path/SHA 与 transport mode baseline。只有代码/fixture diff 和这些证据
共同证明 realtime artifact 未受影响时，才可引用已接受的 schema-v2 transport
HIL 而不重跑；TDX/QMT target-day historical API regression、golden fixture
与 post-close integration 不得省略。任何 realtime artifact 实际变化都必须
回到对应 realtime change 重新 qualification，不能由本 change 静默吸收。

## Risks / Trade-offs

- [provider 在收盘后仍修订数据] → 失败 retry 或 operator 显式 manual rerun 可覆盖同一唯一键；
  首版不为发现修订自动重复已成功 item。
- [provider 成功返回空集合] → 作为正常 no-op，不写占位 K、不重试，并照常精确清理对应 Redis
  partition；分析层自行处理缺失交易日。
- [多实例重复执行] → 每个 dispatch/retry cycle 使用 dedicated connection 持有 MySQL advisory
  lock，cycle 结束即释放；item upsert 与清理均幂等。
- [一个标的阻塞全市场] → item 独立状态/重试/清理，失败不阻塞其他 item。
- [全市场 fan-out 压垮 datasource/DB] → source-specific bounded concurrency、provider timeout、
  max-item guard 和 cycle execution deadline。
- [Redis 已 TTL 但 provider 仍失败] → 提前暴露 expiry-risk 告警；绝不以 Redis candle 伪造历史。
- [schedule image 意外运行旧 cron] → repository guard 证明 EastMoney cron 和 `runScan()` 不再被
  schedule runtime 引用。
- [provider digest 与数据库 decimal/bigint 表示不同] → digest 在统一 normalized serialization
  后计算，并覆盖 source extension 字段。

## Migration Plan

1. 获得新的明确实施授权，重新核对当时的 active changes、migration 上限和生产拓扑；随后才可
   使用隔离 `MIST_TEST_MYSQL_URL` 和 Redis 跑 dry-run/upsert/rollback tests。
2. 构建包含 schedule 的 image，部署 Redis/backend/schedule，保持
   `HISTORICAL_SYNC_ENABLED=false`。
3. 对 TDX `600030.SH`、QMT `300502.SZ` 执行 manual dry-run，记录 provider count/digest。
4. 在 shadow/manual apply 中验证 MySQL round-trip 与精确 Redis cleanup；确认非目标 protected
   digest 不变。
5. 启用 A/HK 自动 cron，观察到次日 08:00 retry deadline 之后再完成 promotion。
6. 回滚时关闭 flag 并回退 image；不运行 migration、不删除 Redis volume、不改变 realtime mode。

## Open Questions

无。首版同步所有 enabled TDX/QMT configs，只请求目标交易日 `Period.ONE_MIN`；成功结果允许
为空或只包含 provider 实际返回的合法 bars，不要求固定根数与 final coverage。
