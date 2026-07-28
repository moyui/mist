## 1. 依赖与收盘同步基线

- [ ] 1.1 确认 `productize-current-day-realtime-market-data` 已归档，并记录 Redis schema、partition manifest、query rollover 和 TTL 的 accepted evidence。
- [ ] 1.2 先完成并归档 `remove-orphaned-data-collection-scheduler`；重新搜索证明未注册的通用调度抽象未被恢复或复用。
- [ ] 1.3 从各仓库最新 `master` 创建全新对应分支，记录 dirty/worktree/remote 状态、生产 SHA、migration `006` checksum、protected-table baseline 和现有 schedule/EastMoney cron inventory。
- [ ] 1.4 盘点 TDX/QMT `/v1/bars/query`、normalizer、canonical `k` 与 source extension upsert/unique key，确认不需要 migration 后再实现。

## 2. Provider 历史 contract

- [ ] 2.1 建立 TDX `600030.SH` 与 QMT `300502.SZ` 目标交易日 `Period.ONE_MIN` golden fixtures/SHA，覆盖空集合、任意条数合法非空集合、canonical 与 source-specific extension 字段；不固定预期根数或末根覆盖。
- [ ] 2.2 在 `mist-datasource` 增加 TDX/QMT target-day query contract tests：明确 symbol/date/period、时区、session、timestamp 排序唯一；成功空集合必须与 provider 错误、超时和 malformed nonempty result 区分，缺少分钟或 final bucket 本身不是 malformed。
- [x] 2.2a 在既有 QMT backend historical adapter 中支持 `time` 的 13 位 epoch-millisecond 值，保持 `stime` → `time` → row key 优先级、`QmtResponse.timestamp` 和 MySQL `k.timestamp` 不变，并增加无 `stime` 回归测试。
- [ ] 2.3 以依赖归档后记录的 accepted schema-v2 baseline 为准，保持
  historical API、届时已接受的手工 bridge 行为、formal realtime
  frame/fixture SHA、provider-local bridge fence 和 `builtin|off` 不变；不得
  要求或重新引入 schema-v1 formal `streamEpoch`、`sequence`、
  `sequenceScope` 或 per-symbol sequence fence。只有 code/fixture diff 与
  installed bridge path/SHA 证明 realtime artifact 未受影响时，才可引用既有
  schema-v2 transport HIL；TDX/QMT target-day historical API regression 仍须
  执行。
- [ ] 2.4 在 `mist` 建立 provider adapter/normalizer validation，禁止用 Redis candle 补洞或把 provider 间 native/extension 强行对齐。

## 3. Schedule 应用产品化

- [ ] 3.1 将 `apps/schedule` 纳入正式 build，使其与 backend 使用同一 Mist image、独立 command 和仅内部 health endpoint。
- [ ] 3.2 删除 schedule app 中 EastMoney 分钟/多周期采集 cron 和每分钟 `StrategyScanService.runScan()` wiring；保留不受影响的手工 backend scan 能力。
- [ ] 3.3 实现 `HISTORICAL_SYNC_ENABLED=false` 默认关闭、manual dry-run、market/source/security/tradingDay scope 和配置校验。
- [ ] 3.4 实现 active security 的全部 enabled TDX/QMT `SecuritySourceConfig` 展开，按 `tradingDay + market + source + security + providerSymbol + 1m` 建立独立 item。
- [ ] 3.5 实现可配置 A 股 15:10、港股 16:20 首次执行、10 分钟 item retry 和次日 08:00 cutoff；使用交易日/session 判断和可注入 Node `Clock`，operational TTL 使用 Node 计算的相对 `EXPIRE`/`PEXPIRE`，不得依赖 Redis `TIME` 或 MySQL `NOW()`，不在休市日伪造成功。
- [ ] 3.6 每个 market/tradingDay dispatch/retry cycle 使用 dedicated QueryRunner connection 持有 MySQL advisory lock，并在该轮 `finally` 释放；禁止跨 retry interval 或持有到 08:00，验证多实例竞争、每轮重新获取、连接/锁丢失 fail-closed 和无 migration。
- [ ] 3.7 增加 `HISTORICAL_SYNC_TDX_CONCURRENCY`、`HISTORICAL_SYNC_QMT_CONCURRENCY`、`HISTORICAL_SYNC_PROVIDER_TIMEOUT_MS`、`HISTORICAL_SYNC_MAX_ITEMS_PER_RUN` 与 `HISTORICAL_SYNC_CYCLE_TIMEOUT_MS`；按 source bounded dispatch，禁止 unbounded `Promise.all`，inventory 超 guard 时整轮 fail closed，不截断漏项。

## 4. 验收、权威 upsert 与精确清理

- [ ] 4.1 对成功非空 provider normalized result 只验证 item identity、timestamp 唯一有序、均在对应 session、required field/numeric/source extension 合法；provider 返回多少条合法 bar 就接受多少条，不验证 expected count、分钟连续性或 final coverage。成功空集合按 no-op 完成，不写占位 K、不重试，只有请求失败/超时或 malformed nonempty result 才保持 pending。
- [ ] 4.2 复用 source-specific historical persistence，对 provider 实际返回的目标交易日 bars 执行 authoritative upsert；失败 retry 或 operator 显式 manual rerun 可修订同一唯一键的 canonical 与 extension 值，成功 item 不为发现修订自动重复拉取。
- [ ] 4.3 在写入后只按本次 provider 返回的 source-specific unique key set 回读，按稳定序列化计算 canonical+extension count/digest 并完全比较；同日既有但未返回的 rows 不删除、不参与本次 digest，单次缺失不解释为删除指令。
- [ ] 4.4 非空结果 round-trip 成功或 provider 成功返回空集合后，读取结构化 partition manifest，精确幂等删除该 source/security/day 的 closed-candle Hash、sealing watermark/baseline checkpoint、due member 和 manifest keys；manifest/key 不存在视为已清理，确认没有 Redis snapshot/latest/timepoint/mutable-open/pending-evaluation keys，禁止 broad pattern delete。
- [ ] 4.5 确保失败 item 的旧日 Redis 对产品查询不可见但物理保留至既有 72h TTL；cleanup/retry 不阻塞其他成功 item，TTL 到期前告警。
- [ ] 4.6 记录 Redis 与 provider 数值差异的诊断指标，但不得因此拒绝权威 provider 历史或用 Redis 写 MySQL。

## 5. 部署、监控与操作流程

- [ ] 5.1 在 `mist-deploy` Compose 中增加 `mist-schedule`，配置同 image 独立 command、MySQL/`mist-realtime-redis`/datasource dependencies、`MIST_REALTIME_REDIS_URL`、internal health，且不发布业务端口；本 change 不增加 BullMQ/`mist-queue-redis`。
- [ ] 5.2 增加 schedule env/config validation、manual dry-run workflow、scoped retry、diagnostics 和 flag/image rollback；部署默认 `HISTORICAL_SYNC_ENABLED=false`。
- [ ] 5.3 在 `mist-monitoring` 增加 per-cycle owner/lock、inventory guard、source concurrency/in-flight、provider timeout、cycle deadline、last attempt/success、pending、retry、provider validation、round-trip、cleanup、deadline 和 oldest retained key metrics/alerts。
- [ ] 5.4 更新当前简体中文 operator docs：启动/health、dry-run、enable、重试、cutoff、精确清理、failure recovery、protected digest 和 rollback；不回写 archive/evidence 历史。

## 6. 隔离验证

- [ ] 6.1 Unit 覆盖 config/date/session、全部 enabled config 展开、market schedule、retry/cutoff、per-cycle advisory lock 获取/释放、bounded concurrency、provider/cycle timeout、max-item guard、成功空集合 no-op、任意条数合法非空结果、provider failure、malformed nonempty validation、stable digest 和 item-scoped cleanup。
- [ ] 6.2 使用隔离 Redis 验证 manual dry-run 无写、非空成功与空集合成功均精确幂等清理、失败保留、并行 item 隔离、day rollover 与 72h TTL。
- [ ] 6.3 使用 `MIST_TEST_MYSQL_URL` 验证空库与已有数据环境的 TDX/QMT upsert、失败 retry/manual rerun 修订覆盖、bounded 并发、source extension 和 count/digest round-trip；确认成功 item 不自动重复、未运行 migration 且 `006` 未变。
- [ ] 6.4 Integration 覆盖 schedule → TDX/QMT history → MySQL → next-day historical query → exact Redis cleanup，并覆盖成功空集合不写 MySQL 但照常清理 Redis，验证 schedule 不创建 signal/alert。
- [ ] 6.5 运行受影响仓库 lint、typecheck、全量 tests、Node/Python/Go build、Docker build、Compose/health smoke、golden SHA、`git diff --check` 与 OpenSpec strict validation。

## 7. Shadow、生产启用与归档

- [ ] 7.1 发布 backend/schedule/monitoring candidate，保持 sync flag off；记录 pre-run protected tables row count/digest 和 Redis partition manifest。
- [ ] 7.2 在收盘后对 TDX `600030.SH`、QMT `300502.SZ` 分别执行 manual dry-run，验证真实 provider target-day response 的 identity、排序、session 与字段；不以根数/末根覆盖判失败，并确认无 MySQL/Redis mutation。
- [ ] 7.3 在隔离目标/明确授权下执行 scoped write verification：只有目标 trading day 的 `k` 与对应 source extension 可变化，round-trip digest 后只清理对应 Redis item。
- [ ] 7.4 启用自动 schedule，验证 A/HK 首次执行、失败 retry/cutoff、per-cycle advisory lock 获取/释放、bounded concurrency/provider timeout/max-item guard、restart recovery、多源独立完成与告警。
- [ ] 7.5 演练 `HISTORICAL_SYNC_ENABLED=false` 与 whole-image rollback；不回滚数据库、不删除 Redis volume、不切换 TDX/QMT transport mode。
- [ ] 7.6 刷新生产 baseline，记录 SHA/workflow/artifact、provider result/digest、cleanup manifest、protected digest 与 rollback evidence；所有仓库 clean/upstream/CI 后 strict validate 并归档。
- [ ] 7.7 归档后重新审计 `add-strategy-portfolio-backtesting`：B2 仅日线且只读 MySQL，重新确定 migration 编号并只选择性移植已审计 checkpoint commits。
