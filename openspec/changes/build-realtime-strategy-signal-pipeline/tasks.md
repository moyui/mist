## 1. Baseline、所有权与 stash 复用门禁

- [ ] 1.1 记录六仓 branch、HEAD、upstream、dirty/worktree、active OpenSpec、当前 Compose、bridge
  installed path/SHA 和 production `schema_migrations`；确认 migration `001–013` 不修改。
- [ ] 1.2 建立 producer → wire → decoder → Node candle → market Redis → handoff → queue Redis →
  worker memory → evaluator → MySQL → monitoring/deploy 影响链和 owner matrix。
- [ ] 1.3 对五仓 safety stash 逐文件建立 `reuse|rewrite|discard` 清单；禁止整体 apply，禁止恢复
  MarketKQueryService、providerSymbol Redis key、securityCode job、boolean episode 和旧 completion。
- [ ] 1.4 从 stash 只提取候选 pure logic/tests 到临时审查 patch，逐项与新 specs 对照后再进入实现
  commit；记录原 stash hash 和最终采用/拒绝理由。
- [ ] 1.5 运行当前六仓基线、OpenSpec `--all --strict` 和 `git diff --check`，把已有失败、环境阻塞
  与本 change 回归分开记录。

## 2. Phase A：Exact decimal 与 canonical identity

- [ ] 2.1 从 stash 审计并选择性重用 exact-decimal normalize/compare/add/subtract 纯函数和边界测试，
  固化 `DECIMAL(36,8)`、非负、非指数、无需舍入的 canonical contract。
- [ ] 2.2 将 `CanonicalRealtimeSnapshot.cumulativeVolume/cumulativeAmount` 改为 canonical decimal
  string 或 null，增加 bounded quantity precision provenance；OHLC/indicator/Chan 保持 number。
- [ ] 2.3 在 mist-datasource TDX contract 中只接受 native decimal string `Volume/Amount`，数字形态、
  非规范、越界和超 scale fail closed；同步 OpenAPI/route/unit/integration tests。
- [ ] 2.4 在 backend QMT converter 中验证 safe-integer volume 和 finite provider-float amount，
  规范化可观察值并记录 provenance；unsafe/rounding/negative/null cases 明确测试。
- [ ] 2.5 更新四仓 canonical fixture 与同一 SHA sidecar，验证 datasource producer、backend decoder、
  deploy 和 monitoring copy 完全一致。
- [ ] 2.6 删除 active code/docs 中 schema-v1 `streamEpoch/sequence` 产品字段或恢复计划，证明它们不
  进入 canonical、candle、job、episode 或 signal identity。
- [ ] 2.7 在 Security 初始化和 source-config mutation 边界验证唯一
  `securityId → effective source + providerSymbol`；不支持 runtime source transition，非 effective
  frame 不进入 candle path。

## 3. Phase A：Node candle、Redis seal 与 replay

- [ ] 3.1 以 table-driven tests 固化 A 股 09:30–11:30、13:00–15:00 bucket、午休和自然日边界；
  V1 realtime strategy不启用港股。
- [ ] 3.2 实现以 `securityId` 为 key 的有界 Promise chain、pending/global hard limit、failure
  continuation、shutdown stop/drain 和 queue-overflow invalidation。
- [ ] 3.3 实现相邻 bucket Node open aggregator，使用 exact cumulative baseline/delta、counter reset、
  out-of-order eventTime、missing quantity和 provisional OHLC fail-closed语义。
- [ ] 3.4 定义只含 `securityId` 的 Redis closed/watermark/manifest key 和 due member builder；
  source/providerSymbol只进入 compact provenance，任何 key/value 均不包含 securityCode。
- [ ] 3.5 实现 due registration、source-specific grace、local hard-horizon sweep和可注入 Node Clock；
  due/manifest失败必须释放内存且不补写 guessed candle。
- [ ] 3.6 实现 valid/discarded finalizer：单个 MULTI/EXEC 完成 closed/watermark/due/manifest/TTL，
  Redis commit不确定时暂停该 security并产生 degraded reason。
- [ ] 3.7 closed record 保存 version、bucket、exact `v/a/cv/ca`、OHLC、source/providerSymbol、
  quality/precision和 compact closing snapshot；禁止完整 native/order book/securityCode/strategy state。
- [ ] 3.8 实现 restart open-state loss discard和 retained sealed replay reader；reader只遍历
  manifest-owned 72h partition、排序去重并执行 hard bar/deadline limit，不访问 MySQL。
- [ ] 3.9 将 candle sink 接到 ingress 的 transport-memory 更新之后；sink failure不得回滚 latest，
  不得直接调用 BullMQ、strategy、MySQL或notification。
- [ ] 3.10 增加 candle primary、late/grace、reset、午休、restart、due failure、Redis failure、
  capacity、TTL/manifest和 no-side-effect tests。

## 4. Phase A：Market Redis 部署、监控与验收门禁

- [ ] 4.1 在 mist-deploy 完成无 host port、AOF、独立 bind mount和health的
  `mist-realtime-redis`，backend env/depends/start order/default mode保持 off。
- [ ] 4.2 增加 Compose/PowerShell contract tests、health/diagnostics、volume保留和整镜像回滚测试；
  此阶段不得部署 queue Redis或strategy mode。
- [ ] 4.3 在 mist-monitoring 增加 Redis command/health、open count/age、due/finalizer、discard、
  lateness/grace、record bytes、memory/AOF/disk和72h projection低基数指标。
- [ ] 4.4 运行 mist、datasource、deploy、monitoring受影响全量自动化、fixture SHA、Docker build、
  strict OpenSpec和 diff check。
- [ ] 4.5 以 product mode off 部署 matching image，记录 protected-table counts/digests并验证盘中
  Redis/MySQL策略表零写入。
- [ ] 4.6 分别对 TDX/QMT shadow至少采集三个完整支持交易日，校准 grace、record/memory/AOF/disk
  hard limits并完成 restart/AOF recovery evidence。
- [ ] 4.7 只有 Phase A 自动化、双 source HIL、capacity、rollback和protected digest全部验收后，
  才允许 candle mode on并进入 Phase B。

## 5. Phase B：Paired V1、field catalog 与 migration

- [ ] 5.1 只读审计 production/current strategy versions：legacy rule、数字 decimal threshold、
  identity、period/source和current-version ownership；记录数量且不自动改写。
- [ ] 5.2 根据真实 `schema_migrations` 确认下一 migration编号；若不是本地 `001–013` 基线，停止
  并设计 repair-forward，不重写已应用 migration。
- [ ] 5.3 编写 paired-rule migration/preflight/postflight/readback：`rule→entry_rule`、
  nullable `exit_rule`、bounded `lookback_bars`、`signal_kind` 和 source-agnostic logical-candle
  unique index；同步 ORM/entity/schema safety tests。
- [ ] 5.4 更新 DTO/service/controller/frontend types，公共 V1 只接受 entryRule、optional exitRule和
  lookbackBars；删除 legacy rule，不增加 schema enum、alias、双写或 String(number)兼容。
- [ ] 5.5 建立共享 field catalog，注册 k/indicator/security 和稳定 Chan Phase B fields；只有
  `k.volume/k.amount` 使用 decimal type，其余数值字段使用 finite number。
- [ ] 5.6 收紧 validator：字段/类型/operator/lookback必须兼容，decimal threshold只接受 canonical
  string；create/update/load/enable/manual scan/backtest/realtime registration复用同一逻辑。
- [ ] 5.7 扩展 pure evaluator为 known/unknown结果，支持 paired entry/exit、current/prior context、
  exact decimal comparisons和crossesAbove/crossesBelow，无副作用。
- [ ] 5.8 更新 bounded evaluation context builder、manual scan和现有 signal-level backtest，使
  同 fixture产生一致 paired result；本 change不增加 portfolio engine或portfolio字段。
- [ ] 5.9 更新 strategy editor为独立 entry/exit JSON与lookback输入，保留 decimal strings；
  不修改 K 页面、不新增 realtime dashboard/portfolio workspace。
- [ ] 5.10 在隔离真实 MySQL运行 migration、rollback/readback、named unique conflict和protected
  table digest；旧镜像不兼容时记录匹配版本回滚而非声称只回滚镜像。
- [ ] 5.11 只有 migration、backend/frontend全量基线、real-MySQL和schema audit通过后才进入 Phase C。

## 6. Phase C：Queue Redis 与可靠 handoff

- [ ] 6.1 增加受支持的 BullMQ依赖和独立 strategy queue module；连接、timeout、retry/backoff、
  retention、pending capacity和diagnostics均有硬上限，strategy mode默认 off。
- [ ] 6.2 定义版本化 job reference和pure ID builder，只使用
  `tradingDay+securityId+bucketStartMs`；payload禁止securityCode/history/rule/native/epoch/
  sequence/notification。
- [ ] 6.3 在 candle post-commit边界实现 bounded非阻塞 handoff port；buffer/queue failure不得
  回滚market Redis，必须产生可补偿结果。
- [ ] 6.4 基于 manifest实现有界 reconciler cursor/batch/command timeout/deadline，按securityId+
  bucket排序并幂等补投相同job。
- [ ] 6.5 在 mist-deploy新增物理隔离的 `mist-queue-redis` service/volume/AOF/health/env/start order，
  contract tests证明不与market Redis共享endpoint、volume、cleanup或capacity。
- [ ] 6.6 增加 enqueue success/timeout/overflow/disconnect/reconnect/duplicate/crash-window/
  reconciler-resume/retention-expiry tests，并证明market sealing不受影响。

## 7. Phase C：内存 worker、周期、Chan 与 registry

- [ ] 7.1 实现 per-security有界ordered worker和evaluated-through cursor；job作为target wake-up，
  逐根处理cursor到target的retained sealed candles。
- [ ] 7.2 实现 immutable generation-tagged registry，把 target code在加载时唯一解析为securityId；
  invalid identity/source/period/rule/lookback/retention标记realtime-ineligible。
- [ ] 7.3 为每个 `securityId+period` 建立共享 hard-limit ring window；正常路径只append/evict，
  cold/restart只执行一次有界Redis replay，禁止MarketKQueryService和MySQL K warmup。
- [ ] 7.4 实现1/5/15/30/60 A股session对齐period builder、exact quantity sum、完整组成分钟检查和
  replay determinism；派生bars只留内存。
- [ ] 7.5 选择性移植stash Chan adapter，使用临时ordinal运行现有Phase B并输出latest/count、
  algorithm version和fingerprint；证明无Chan persistence或新买卖点字段。
- [ ] 7.6 worker persistence前重新核验definition enabled/current version/registry generation；
  registry reconciliation和disable/version/day/security cleanup均有界。
- [ ] 7.7 增加多策略共享窗口、out-of-order/retry、gap、lookback不足、capacity、registry race、
  period边界和Chan deterministic tests。

## 8. Phase C：显式三态 episode 与 Signal/AlertEvent

- [ ] 8.1 定义 `EpisodeState=unknown|false|true` 和不含source/generation的episode key；实现
  day/version/disable/security cleanup和hard-limit failure。
- [ ] 8.2 实现 unknown/false→true candidate、true→true suppression、complete false reset、
  incomplete/error→unknown；不得用Map.has隐式替代状态。
- [ ] 8.3 构建有界immutable contextSnapshot，包含definition/version/signalKind、registry generation、
  triggering bar、decimal provenance、window/fingerprint、current/prior indicator/Chan、
  episode continuity和job/record version；排除完整native/rule history/Redis value。
- [ ] 8.4 strategy shadow运行完整context/evaluator/episode路径但策略表零写；off不连接queue；
  非法mode组合fail closed且不改变transport/candle。
- [ ] 8.5 strategy on在一个MySQL transaction写typed live Signal和linked PENDING AlertEvent；
  只把named logical-candle unique conflict当幂等成功。
- [ ] 8.6 只有shadow成功或on commit/精确dedupe后推进episode/cursor；其他evaluation/DB错误交给
  BullMQ retry。
- [ ] 8.7 增加全部episode transition、restart unknown、entry/exit分离、source provenance但identity
  无source、transaction rollback、dedupe/non-dedupe和disabled/version race tests。

## 9. Monitoring、发布与真实 HIL

- [ ] 9.1 增加queue depth/age/retry/failed、handoff/reconciler lag、replay/window/period gap、
  Chan/evaluation latency、episode bounds、decimal rejection和transaction outcome metrics/logs。
- [ ] 9.2 扩展strategy health，使queue/replay/window/episode/capacity/persistence failure阻止
  promotion，但不改变transport、candle或未来delivery health。
- [ ] 9.3 运行六仓受影响lint/typecheck/full tests/build/contracts、真实MySQL、两个隔离Redis、
  Compose/PowerShell、fixture SHA、strict OpenSpec、retired-name search和diff check。
- [ ] 9.4 以strategy off部署matching版本组，固定images、migration、Compose、bridge SHA和
  database baseline；验证rollback保留两个Redis volume及已提交events。
- [ ] 9.5 只有Phase A/B证据验收后切strategy shadow，至少观察三个完整支持交易日，验证双source
  handoff/reconcile/restart、1/5/15/30/60、window/Chan/episode/capacity且策略表零写。
- [ ] 9.6 校准queue/retry/retention/reconcile/window/episode/alert thresholds；任一硬上限或
  lookback retention不足时阻止strategy on。
- [ ] 9.7 在支持交易时段切strategy on，验证typed Signal+PENDING AlertEvent transaction、
  source-agnostic dedupe、restart unknown、contextSnapshot和protected-table预期变更。
- [ ] 9.8 证明没有WeCom/微信/AstrBot delivery；通知必须另建focused change。
- [ ] 9.9 演练strategy off、candle off和整镜像rollback，附上所有CI/MySQL/Redis/Windows HIL/
  capacity/restart/reconcile/digest evidence后才允许归档。
