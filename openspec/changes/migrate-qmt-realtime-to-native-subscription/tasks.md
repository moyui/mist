## 执行纪律

- [ ] 每个阶段开始前确认前置 gate，结束后提交“修改文件、验证结果、未决风险、下一阶段”中文报告并停止等待确认。
- [ ] callback fixture、subscription ID 或 unsubscribe 成功语义未通过 Windows HIL 时停止上线，不静默恢复周期 `get_full_tick`，也不把 current-K 冒充 native tick。
- [ ] 不修改 migration `006`、生产业务数据库、Redis volume、candle、strategy、Signal、AlertEvent、BullMQ、notification 或 MySQL migration。
- [ ] TDX native acquisition 仍只使用
  `subscribe_hq -> dirty -> get_market_snapshot`，`/tdx/bridge/poll|result`
  不变；同时删除 `/tdx/bridge/snapshot` 的 `producerSequence`、自动 POST retry、
  datasource producer dedup 和 success item ack/sequence，并把
  datasource→backend 迁移到统一 schema v2。
- [ ] TDX/QMT active formal frame 只允许 schema v2；不得保留 schema-v1
  runtime fallback、formal sequence 或 epoch/sequence fence。
- [ ] TDX/QMT 分别新建简化 `native-snapshot.converter.ts`，只共享 canonical
  类型、common envelope decoder 和 ingress；不得复用旧
  `realtime-native.adapter.ts` 或 generic provider-native mapping。
- [ ] canonical identity 固定为 `securityId + providerSymbol`；formal frame
  不恢复 standalone `symbol`，backend 不恢复 sequence/epoch ordering fence。
- [ ] TDX/QMT bridge 都只由操作员手工覆盖；deploy 不得自动安装、替换或删除任一 bridge。
- [ ] TDX/QMT Mist client 必须实现四个真实可调用的 Nest 内部 control 方法；
  不得保留空 stub，也不得在 `open/ready/reconnect` 自动调用。
- [ ] 本 change 不增加 scheduler、`Security.status` watcher、
  desired/effective-source coordinator、HTTP/GraphQL/controller、frontend、CLI
  或 diagnostic mutation caller；Windows HIL 只能通过 test-only in-process
  client harness 调用。

## 1. 基线、OpenSpec 与 evidence 模板

- `normalize-tdx-qmt-source-layouts` 必须已归档，且 stable
  `realtime-source-layout` 必须存在并作为本 change 的 `MODIFIED`
  baseline；任一条件不满足时停止，不进入产品代码实现。

- [ ] 1.1 `[mist]` 以 stable `realtime-source-layout` 为基线，复核本 focused change、其他 stable specs、相关未归档 changes 与 Theme B B1，消除冲突或明确依赖。
- [ ] 1.2 `[all repositories]` 记录 `mist`、`mist-datasource`、`mist-deploy`、`mist-fe`、`mist-monitoring`、`mist-skills` 的 branch、HEAD、upstream、dirty status、目标远端分支和生产 image/runtime 基线。
- [ ] 1.3 `[mist/mist-datasource]` 使用 rename-aware Git history 找出 QMT bridge 的当前及历史文件名，记录历史 command/result、当前 realtime polling、owner/lease 与 TDX realtime 的实际路径。
- [ ] 1.4 `[mist]` 建立脱敏 evidence 模板：官方文档 URL/访问日期、QMT/TDX terminal/runtime build、TDX installed path/SHA-256/build ID、QMT import artifact path/SHA-256/project/build ID/runtime fingerprint（平台不暴露 installed file 时明确 `platform_unavailable`）、方法、返回值、callback fixture、权限、journal、HIL 时间窗及 protected digest。
- [ ] 1.5 `[mist]` 记录通过 `pnpm` 安装的 OpenSpec CLI `1.6.0`，使用该固定
  版本执行 strict validation，不使用未锁定 `@latest`。
- [ ] 1.6 **阶段门**：确认 stable `realtime-source-layout` 与本 focused change 均通过 strict validation，提交只读基线与 OpenSpec review；未获确认不得修改产品代码。

## 2. QMT runtime probe 与 raw fixtures

- [x] 2.1 `[mist-datasource]` 编写 Python 3.6 只读 introspection probe，记录 `dir/getattr/__doc__/help` 的 `subscribe_quote`、`subscribe_whole_quote`、`unsubscribe_quote`、`get_market_data_ex` 和全部 `subscribe*all*|subscribe*whole*` 候选；`inspect.signature()` 失败只记 unknown。
  - Operator artifact:
    `tools/qmt_runtime_probe/mist_qmt_subscription_introspection_probe.py`;
    it writes one sanitized JSON, invokes no native method and records
    `nativeMethodsInvoked=[]/mutationExecuted=false`. Python 3.6 grammar,
    alias discovery, zero-call behavior and sanitization are covered by
    `tests/unit/test_qmt_runtime_probe.py`.
- [ ] 2.2 `[Windows QMT operator]` 记录 QMT/迅投、terminal、embedded Python、strategy runtime build、VIP/非 VIP 权限、可证明的 whole-list/active-subId/single-handle 限制和所有方法的实际可调用性；无法证明的限制记 unknown，不依据方法名猜测 alias。
- [ ] 2.3 `[Windows QMT operator]` 在交易时段使用 `300502.SZ` 捕获：
  - `subscribe_quote(..., period='tick', result_type='dict')` 一项 `{code:data}` callback；
  - `subscribe_whole_quote(exactDesiredSymbols)` 一项 callback；
  - 可获得时的 whole 多项 changed-symbol callback；
  - 两种 subscribe 的原始返回值；
  - `unsubscribe_quote(subId)` 的原始返回值/异常及 callback 停止观察；
  - 首次成功后、创建任何新 subscription 前，对同一个已释放 `subId` 再调用
    一次 `unsubscribe_quote`，记录第二次的精确返回/异常、callback 持续停止、runtime 可观察时的
    active-subscription/quota 释放，以及后续 subscription 是否复用该整数 ID。
- [ ] 2.4 `[mist-datasource/Windows QMT operator]` 将 accepted raw fixtures
  脱敏并锁定各自 raw SHA；保留完整 outer code map、inner tick 字段和原始
  类型。将 `time`（数值 timestamp）、`stime/timetag`（格式不同的 timestamp
  string）记录为同一个 provider business time 的候选表示，并记录实际存在性、
  候选顺序、parser、单位、时区、精度及同时出现时的一致性。
- [ ] 2.5 `[mist]` 基于 accepted production fixture 固定 QMT converter 的
  `eventTime` 有序候选、解析和一致性规则，并判定 callback 是否满足 QMT
  native contract；不得依据文档示例自行选择时间 alias。fixture 不满足时
  停止 change review，不实现 current-K 或 polling fallback。
- [ ] 2.6 `[mist/mist-datasource]` 在 contract/evidence 中固定 `latest-state native snapshot` 质量等级：native 字段与 `get_full_tick` 相同不构成 tick-complete 证明，whole changed-symbol callback count 只用于测量。
- [ ] 2.7 **阶段门**：操作员确认方法、exact integer subId（允许 `0`）、
  unsubscribe 精确成功返回类型和值、对已释放同一 subId 重复 unsubscribe 的
  `safe|unsafe|unknown` 分类、single/whole callback contract 及 production
  时间字段映射后再开发 runtime；未证明重复退订安全时 recovery 固定为
  context reload/rebuild，不猜测幂等或有害。

## 3. Datasource QMT control、registry 与 journal

- [ ] 3.1 `[mist-datasource]` 实现 datasource 权威内存 registry，只有两个逻辑 bucket：nullable `whole{subId,symbols}` 与 `singles{providerSymbol:subId}`；`whole.subId/symbols` 必须成对存在，按 bucket 判断类型，不从 subId 数值或 symbol 数量推断。允许 datasource-private lifecycle metadata 标记 `retained-recovery`，但不得形成第三个 public bucket、改变 get response 或进入 backend-facing wire。
- [ ] 3.2 `[mist-datasource]` 实现 backend-facing 四种精确 request 与 `subscriptions_synced|subscribed|unsubscribed|subscriptions` response；`data` 只能是 `success` 或 `failure`。普通 failure 恰好为 `{symbol,reason}`；unsubscribe 以及 sync 取消阶段的 failure 恰好为 `{symbol,reason,subscriptionState}`，其中 state 只允许 `subscribed|unknown`。固定 success 语义：QMT full/single subscribe 返回 exact integer ID（允许 `0`）、QMT cancel-all/unsubscribe 返回 null、QMT get 返回 `whole{subId,symbols}|null + singles{providerSymbol:subId}`；TDX mutation 返回 null、TDX get 返回 current terminal bridge 的 fresh normalized native list。backend-facing response 禁止 raw provider payload、`Error/ErrorId`、full list、operation ID 和 retry metadata。每个 provider WebSocket 最多一个 outstanding request，并使用 source-local 固定 bounded timeout（不进入 wire negotiation）。
- [ ] 3.3 `[mist-datasource]` 实现 `sync_subscriptions` 顺序 best-effort reset：whole 在前、single 按 provider symbol 升序逐个取消；native 未确认时保留原 ID、继续剩余取消、阻止 replacement；只有 exact bool `true`（或显式配置且有独立 HIL 证据的整数白名单值）与 registry transition 都 durable 才删除 ID。exact bool `false` 固定为未确认，不允许通过 callback silence、live witness、K 线历史接口或 bridge poll heartbeat 提升为成功。confirmed unsubscribe 后 durability 失败时保留原 bucket entry 并私有标记 `retained-recovery`，立即停止剩余 mutation 和 replacement、设置 `reconciliationRequired`；全部 durable 成功后才创建 exact desired whole；多项 native 未确认时 backend-facing response 只取固定顺序第一项，journal 保存全部。
- [ ] 3.4 `[mist-datasource]` 实现 single subscribe/unsubscribe、
  whole/single 去重和 whole member 的 individual unsubscribe 拒绝；
  datasource 只处理收到的明确 control request，不自行推断
  `Security.status`、盘中 desired churn 或定时 mutation。
- [ ] 3.5 `[mist-datasource]` 新增：
  - `POST /qmt/bridge/subscriptions/poll`
  - `POST /qmt/bridge/subscriptions/result`
  - `POST /qmt/bridge/subscriptions/snapshot`
  poll request 顶层恰好为 `ownerId + leaseToken + generation`，response 顶层
  恰好为 `{command}`；`command=null` 或恰好为
  `{callSequence,method,symbol}`、
  `{callSequence,method,symbols}`、
  `{callSequence,method,subId,symbol}` 三者之一。datasource 在 call 首次暴露
  时分配 process-local、严格递增且不复用的正整数 `callSequence`；result
  request 顶层恰好为 owner lease identity、该 sequence 与一份
  `success|failure`。
- [ ] 3.6 `[mist-datasource]` 为三条 subscription route 复用现有 QMT
  `ownerId + leaseToken + generation` fence，constant-time 比较 token，
  lease identity 只位于 poll/result/snapshot request 顶层，不得在 command
  内重复；禁止 token 进入日志、journal、health 或 metrics，不得把 realtime
  collector `streamEpoch` 误作 owner 或 command 字段。
- [x] 3.7 `[mist-datasource]` 新增 datasource 单 writer journal，默认
  `F:\quant\MistAPI\datasource\state\qmt\subscription-journal.jsonl`，支持
  `MIST_QMT_SUBSCRIPTION_JOURNAL_PATH`；intent 必须 append+flush+fsync 后才能
  暴露 native command，accepted result 与 registry transition 必须
  append+flush+fsync 后才能报告成功。intent failure 不执行 native；
  subscribe-result failure 保留已观察 ID 并阻止 overlap；confirmed-unsubscribe
  result/transition failure 返回
  `QMT_JOURNAL_DURABILITY_FAILED/unknown`、保留原 bucket entry 并私有标记
  `retained-recovery`、阻止 replacement/后续 mutation且不自动重复 native。
  datasource single writer 同时负责 rotation/compaction：为
  `MIST_QMT_SUBSCRIPTION_JOURNAL_ROTATE_BYTES` 与
  `MIST_QMT_SUBSCRIPTION_JOURNAL_ARCHIVE_MAX_BYTES` 分别提供 exact default
  `67108864` 与 `536870912` bytes，并为
  `MIST_QMT_SUBSCRIPTION_JOURNAL_RESOLVED_RETENTION_DAYS` 提供 exact default
  `90` days；验证 exact positive integer、rotate 可容纳 max bounded
  record+anchor、archive max 至少为 rotate 两倍，非法配置在 control ready 前
  失败。在下一 append 越界前于 writer lock 内
  flush+fsync、first/last-sequence archive rename、SHA-256 manifest atomic
  publish、新 active `rotation_anchor` fsync；startup 确定性处理
  `.tmp/.rotating`。只对已有 durable confirmed-unsubscribe 或 proven context
  reload/rebuild terminal observation 的 fully resolved lifecycle 写并 fsync 保留
  subId/bucket/sequence/hash/archive digest 的 immutable
  `compaction_checkpoint` 后删除源 archive；resolved detail 超过 retention
  后，只能在 atomic+fsync 发布含 sequence range、resolved count、prior sealed
  digest 与 retired terminal/archive digests SHA-256 root 的 fixed-size rolling
  checkpoint 后删除旧 detail；unresolved/
  `retained-recovery` 完整 records 必须 pinned，pinned bytes 达上界时在
  intent/native 前 fail closed。
- [ ] 3.8 `[mist-datasource]` 明确本期不自动 replay journal/bridge log；
  unexpected datasource restart 后 fail closed 并要求操作员 reload context；
  后续 full sync 必须由 HIL harness 或未来 in-process caller 明确调用，不能假设
  operator endpoint。
- [ ] 3.9 `[mist-datasource tests]` 覆盖 exact request/response、generic 与
  unsubscribe failure 的字段排他性、`subscriptionState` enum、unknown
  fields，并逐一断言 poll request、`command=null`、三种 non-null command 和
  success/failure result 的 exact keys；command 中重复
  `ownerId/leaseToken/generation`、任意位置的 QMT `streamEpoch` 和其他 unknown
  fields 必须拒绝。另覆盖 single outstanding、process-local `callSequence`
  严格递增/不复用及 exact-positive-int 校验、A-timeout/B-poll/A-late
  确定性竞态中 A reject 且 B
  slot/registry 不变、B result 后续可接受、`subId=0`、正/负 integer subId、
  bool/float/string/None reject、duplicate、whole member 的
  `QMT_SYMBOL_OWNED_BY_WHOLE/subscribed`、unconfirmed cancellation 的
  `QMT_UNSUBSCRIBE_UNCONFIRMED/unknown` 与 ID retention、顺序 reset、部分
  native bool `true` 的直接成功、bool `false` 无条件未确认，以及 callback
  observation 的 process bound 与 ID reuse reset；
  native failure 继续取消且 replacement blocked、lost result 不 replay；
  分别注入 intent create/append/flush/fsync failure（零 native）、integer
  subscribe-result failure（ID retained/overlap blocked）、
  confirmed-unsubscribe-result/transition failure
  （`QMT_JOURNAL_DURABILITY_FAILED/unknown`、`retained-recovery`、
  reconciliation required、剩余 mutation/replacement blocked、无自动重复）；
  使用小阈值覆盖 rotation/compaction、每个 publish 边界的中断恢复、hash
  mismatch、byte-limit/retention 非 integer 或非正数、record 不可容纳、archive
  小于两倍 rotate、resolved retention 到期的 rolling sealed checkpoint、
  unresolved record 不随年龄消失、pinned-cap 在 intent 前 fail closed，并覆盖
  lease stale 和 restart reconciliation；snapshot route 还必须逐 code 覆盖
  provider-symbol syntax 与 current handle membership：non-member 在 datasource
  拒绝，member 不在 datasource 做 Mist business authorization。
- [ ] 3.10 **阶段门**：datasource control/registry/journal unit 与 route contract 通过后停止 review。

## 4. Python 3.6 QMT callback bridge

- [ ] 4.1 `[mist-datasource]` 修改实际生产 QMT builtin bridge（含 rename 后当前文件），保留历史 polling，删除 realtime 周期 `get_full_tick`。
- [ ] 4.2 `[mist-datasource]` 实现 `subscribe_quote`、`subscribe_whole_quote`、`unsubscribe_quote` 三种单 native-call dispatch；bridge 原样回传 datasource 分配的 `callSequence`，运行时不存在、异常、返回值不安全均变成一份带相同 sequence 的 bounded failure。
- [ ] 4.3 `[mist-datasource]` callback 只验证 closure、按顶层 code entry 做 bounded/JSON-safe copy（单项失败只丢该项，不解析行情字段）、记录 `capturedAt/subscriptionId`、将剩余 `{code:data}` map non-blocking enqueue 并返回。
- [ ] 4.4 `[mist-datasource]` 实现 thread-safe global/per-symbol/bytes/age hard limit；one callback = one queue item = one `/subscriptions/snapshot` POST；POST 失败/过期直接有界丢弃，不 retry/replay。
- [ ] 4.5 `[mist-datasource]` 在 QMT captured log 输出含 `callSequence` 的 bounded control intent/result/build records；禁止 lease token 和 callback native 入日志，bridge 不直接写 datasource journal。
- [ ] 4.6 `[mist-datasource]` 保留脚本加载时生成的
  `ownerId="bigqmt-"+pid`，调整 owner 注册为 init 或 lease loss 时注册，
  正常 poll 是 heartbeat，避免每秒轮换 lease/generation；同一 QMT 进程内
  context reload 不强制更换 ownerId。
- [x] 4.6a `[mist-datasource]` 在现有 loopback history command channel 增加
  read-only `runtime_introspection`，返回 bounded build ID、artifact SHA
  （`__file__` 不可用时为 `unavailable`）、loaded-function runtime
  fingerprint、Python/context metadata 与 required native method
  availability；不得执行 subscribe/unsubscribe mutation。
- [ ] 4.7 `[mist-datasource tests]` 覆盖 Python 3.6 parse、无 `__file__`、
  method missing、signature unknown、poll owner identity 只出现在 request
  顶层、三种 exact command dispatch、command 无 lease/`streamEpoch`、
  `callSequence` success/failure 原样回传、result POST timeout 后不重放
  native call且可 poll 更高 sequence、callback 单/多 code、malformed entry、
  并发/重入、queue overflow、snapshot failure、unsubscribe 异常、
  历史/realtime 并行和无后台线程；bridge 只做 bounded/JSON-safe copy，不读取
  Mist business allowlist 或解析 `securityId`。
- [ ] 4.8 **阶段门**：生成 bridge artifact SHA；仍不自动覆盖 Windows QMT。

## 5. 统一 formal frame v2、两套 converter 与 Mist backend

- [ ] 5.1 `[mist-datasource]` 让 TDX/QMT 都只输出：
  `type/provider/timestamp + data{schemaVersion:2,capturedAt,native:{providerSymbol:nativeObject}}`。
  QMT 保留 callback one/multi-code map；TDX 使用 bridge request `symbol` 包装
  one-entry map，不修改 native value。
- [ ] 5.2 `[mist/mist-datasource]` 从两边 active formal frame、types、ready
  contract、health 和 tests 删除
  `payloadType/source/acquisitionProfile/streamEpoch/sequence/sequenceScope/symbol`；
  bridge→datasource 只保留 provider-local owner fence：TDX
  `leaseToken + streamEpoch`，QMT `ownerId + leaseToken + generation`。
- [ ] 5.3 `[mist]` 新增
  `apps/mist/src/realtime/realtime-native-map-frame.ts` common schema-v2 exact
  decoder：验证 expected connection provider、outer/data exact keys、
  RFC3339、native map 类型/cardinality/bytes hard limit，但不解析任何
  provider price/time/order-book/alias。TDX map 必须恰好一项；QMT entry
  validation 必须逐项隔离。
- [ ] 5.4 `[mist]` 对齐 TDX/QMT realtime source business allowlist
  `resolve(providerSymbol) -> securityId|null`；每个 entry 先完成
  provider-symbol、native object、business authorization/canonical identity
  校验，再进入
  converter。Mist backend 是 business authorization 与 canonical identity 的
  唯一 owner；未授权 entry 不得进入 converter，一个 QMT entry
  malformed/throw 不得阻塞其他项。Datasource current handle membership 只证明
  provider allocation，不能替代此 resolve。
- [ ] 5.5 `[mist]` 新建
  `sources/tdx/realtime/native-snapshot.converter.ts` 与
  `sources/qmt/realtime/native-snapshot.converter.ts`。二者入口都只接收
  `securityId/providerSymbol/capturedAt/native`，分别依据 accepted raw
  fixture 转换；不自行读取 allowlist，不互相 import，不使用 shared native
  alias table。TDX/QMT 的 `eventTime` 都只能由各自 provider-native fixture
  字段生成，不允许 receipt-time fallback。
- [ ] 5.6 `[mist]` 将 `CanonicalRealtimeSnapshot` 固定为
  `source/securityId/providerSymbol/eventTime/capturedAt/prices/cumulativeVolume/cumulativeAmount/quality/native`；
  删除模糊 `symbol` 与 `streamEpoch/sequence/sequenceScope`。`native` 必须
  readonly 完整保留；`acceptedAt` 只作为 runtime/freshness metadata，不能
  冒充 provider `eventTime`，也不能用于 candle 分桶、交易日归属或时间排序。
  `eventTime=null` 的 observation 可进入 latest，但必须不具备聚合资格。
- [ ] 5.7 `[mist]` 删除 active client 对两份旧
  `realtime-native.adapter.ts` 的依赖及旧 v1 adapter tests；不得包装、调用或
  先重建 v1 frame 再复用旧函数。
- [ ] 5.8 `[mist]` 定义共同 `RealtimeSubscriptionControl` in-process
  interface，并让 TDX/QMT realtime client 实现
  `syncSubscriptions/subscribe/unsubscribe/getSubscriptions`。每个方法必须
  发送 exact provider WebSocket request、匹配 exact response 并在 bounded
  timeout/disconnect 时 settle typed result；带 target 的方法还必须先通过
  Mist source business allowlist validation。每个 client 用一个 private
  `executeSubscriptionControl(request, expectedResponseType)` 管理唯一 pending
  Promise，不向 caller 暴露 generic raw send；每 source 只允许一个
  outstanding，busy 立即失败且不排无界队列。删除现有 ready/open/
  reconnect 自动 sync/retry；不得自动 `getSubscriptions`，也不得增加 production
  caller 或外部 mutation endpoint。
- [ ] 5.9 `[mist]` 将公共 `RealtimeSnapshotIngressService` latest 改为按
  canonical `securityId` 保存；source business allowlist 只做授权与 identity resolution，
  初始化时拒绝 TDX/QMT resolved `securityId` 重叠。当前不实现
  `effectiveSourceBySecurityId`、desired coordinator、运行期
  `Security.status` 观察或 latest cleanup；latest 上界由 resolved startup
  allowlist union 与 process lifetime 限制。
- [ ] 5.10 `[mist]` 精简 TDX/QMT provider runtime store：只保留
  connection/transport readiness、last accepted/captured、last error 与
  bounded reject counts；删除第二份 full snapshot、`lastSequence`、
  `currentStreamEpoch`、`RealtimeSymbolSequenceFence`、
  `epochMismatch/duplicate/outOfOrder` 及相关 client/diagnostic/tests。
  bridge owner/build 只从 datasource root/scoped HTTP health 读取，不复制到
  `realtime.ready` 或 backend runtime status；删除未形成运行链路的
  `realtime.stream_started`。
  diagnostic 必须通过 `providerSymbol -> securityId` 读取公共 latest；
  disconnect 保留 latest 但标记 stale。
- [ ] 5.11 `[mist/mist-datasource]` 两边都不新增 event identity、formal
  sequence、exactly-once、retry/dedup 假设；允许 provider 状态重复。术语与
  owner guard 必须区分 datasource `current handle membership` 和 Mist
  `source business allowlist`，不得在 datasource 建第二份 DB/env business
  authorization authority。
- [ ] 5.12 `[mist/mist-datasource tests]` 覆盖 QMT one/multi map、TDX
  exact-one-entry、whole-frame envelope/cardinality failure、native 结构值
  透传、common decoder 不解析 provider 字段、`securityId/providerSymbol`
  identity、两套独立 converter、event-time fixture mapping、
  QMT 多候选同一业务时间/候选冲突、TDX provider-native-only time、
  null eventTime aggregation guard、measurement-time fallback rejection、
  per-entry partial rejection/converter exception containment、all-entry
  rejection、legacy/unknown fields reject、重复 state 再次接受、datasource
  non-member reject、member-but-business-unauthorized 在 backend 逐项 reject、
  source business allowlist reject/cross-source identity conflict、运行期 status/config 变化不
  自动 control/cleanup、disconnect stale、无 sequence fence、diagnostic
  readback、common ingress 和 no-current-K-as-native guard；另覆盖四个 client
  method 的直接调用、exact response matching、busy、timeout、disconnect
  以及 bridge-free exact `realtime.ready`；测试必须证明 backend 只设置
  `connected/transportReady`，bridge owner/build 仍由 datasource HTTP health
  单独取证，且 maintained protocol 不包含 `realtime.stream_started`
  unknown、late response reject、closed/not-ready 零 send、datasource
  non-leader typed failure/no retry、ready/reconnect 零 control send、无
  production caller 和无外部 mutation route。
- [ ] 5.13 **阶段门**：统一 schema-v2 contract、两套新 converter、内部
  control methods 与 backend ingress tests 通过后停止 review。

## 6. TDX control 对齐与 snapshot producer 链路删除

- [ ] 6.1 `[mist-datasource]` 保持 TDX `subscribe_hq -> dirty -> get_market_snapshot` 不变；修改实际 terminal bridge，删除 producer counter、`producerSequence` request 字段和 snapshot POST retry loop，每份 native snapshot 只尝试提交一次。
- [ ] 6.2 `[mist-datasource]` 从 `/tdx/bridge/snapshot` request model、gateway
  state 与校验、health/metrics/evidence 删除 `producerSequence`、
  duplicate/out-of-order producer rejection 及只服务该机制的代码；success
  只使用 HTTP 2xx，不返回 `accepted/sequence/retry` item response；datasource
  接受 snapshot 后直接包装统一 schema-v2 one-entry map，不分配 formal sequence。
- [x] 6.3 `[mist-datasource]` 保持 TDX control 走既有 terminal bridge；
  `unsubscribe/get_subscriptions` 以 bridge 内 native
  `get_subscribe_hq_stock_list` active list 为权威，不依赖返回 `-32601` 的
  datasource official HTTP RPC。
  三种 mutation 共用一个 source-local gate，并在 provider mutation 前调用
  现有 `set_desired/add_desired/remove_desired` 等价 transition：sync 建立
  exact target、subscribe 建立 union、unsubscribe 建立 difference；target
  failure 后不回滚。
- [x] 6.4 `[mist-datasource]` 实现 TDX `sync_subscriptions`：先在 gate
  内发布 exact normalized desired 并推进现有内部 `desiredRevision`，再将
  terminal-native list 规范化为固定 provider-symbol 顺序并执行
  bridge unsubscribe/list → subscribe/converge；bridge poll
  插入 clear/verify 时只能无 mutation 或按新 target 计算，允许旧 in-flight
  native call 造成短暂重复，但其 result 必须由现有 stale-revision fence
  拒绝并最终向新 target 收敛。
- [x] 6.5 `[mist/mist-datasource]` TDX 对外使用与 QMT 同名
  request/response；普通失败为 `{symbol,reason}`，unsubscribe/cancel-stage
  failure 与 QMT 使用相同 `{symbol,reason,subscriptionState}`。三种 mutation
  仅在 current owner/epoch/revision 的 fresh native list 达到 postcondition
  后返回 `success:null`；get 使用 datasource-private `nativeProbeRevision`
  read barrier 强制一次新 native list probe，再返回 normalized list，不增加
  QMT handle/state。TDX 目标仍在 list
  返回 `TDX_UNSUBSCRIBE_NOT_CONVERGED/subscribed`，list 不可验证返回
  `TDX_UNSUBSCRIBE_VERIFY_FAILED/unknown`；内部 `desiredRevision` 不得进入
  backend-facing response。
- [x] 6.6 `[mist-datasource tests]` 覆盖 TDX snapshot exact request 无
  `producerSequence`、one-attempt delivery、HTTP 2xx success 无 item
  ack/sequence、POST failure/no-response 不 retry、gateway 无 producer dedup、
  datasource 无 formal sequence，以及 already-absent、immediate
  payload/`ErrorId`/异常但 re-list 已移除时成功、post-list 仍存在、post-list
  failure/timeout/invalid、raw response 不外泄、bridge subscribe、reset
  cancellation-stage failure、eventual list convergence 和 one-outstanding
  control；另以确定性 barrier 覆盖 unsubscribe desired transition 与 HTTP
  verify 之间插入 bridge poll 时不产生 stale subscribe、旧 revision result
  rejection、failure 不回滚 target，以及成功后至少三个 poll/result 周期仍
  absent。
- [ ] 6.7 **阶段门**：确认 `mist_tdx_realtime_bridge.py` 只改变 snapshot
  producer-delivery 部分，`/tdx/bridge/poll|result` 与 native acquisition 无
  意外变化；formal schema 与 converter 的变化只发生在 datasource/Mist，并
  生成 TDX bridge artifact SHA。

## 7. 双仓布局、mode tooling 与 monitoring

- [ ] 7.1 `[mist/mist-datasource]` 对齐 `sources/{tdx,qmt}` 与 datasource
  provider 目录中 shared client/control/types/runtime/routes/health 责任；
  两边都具备同相对路径的 `native-snapshot.converter.ts`；provider-only
  manifest 明确 QMT journal/callback routes 与 TDX terminal-native
  list/unsubscribe/read barrier。
- [ ] 7.2 `[mist/mist-datasource]` 增加结构/能力 guard，验证四种 datasource
  operation 与四个 Mist in-process method 都有真实 request/response execution
  和测试，不使用动态 `supportedOperations`；另验证 application runtime graph
  没有 production caller。
- [ ] 7.3 `[mist-deploy]` 修复 source-scoped mode switch：`Source=qmt` 不重启 TDX datasource，`Source=tdx` 不重启 QMT datasource；backend 仅在其配置/contract 要求时 recreate。
- [ ] 7.4 `[mist-monitoring]` 增加统一
  `mist_realtime_subscription_control_total{source,operation,result,reason}`，
  `result` 只有 `success|failure`，所有成功样本固定 `reason="none"` 且保留四个
  labels，失败使用 documented bounded stable reason；`subscriptionState` 只供
  response/structured log/health 展示，不增加 metric label；增加
  datasource-known QMT handle counts、private retained-recovery aggregate、
  `reconciliationRequired`、journal active/archive bytes 与阈值、last
  rotation/compaction、pinned evidence、固定
  `rotation|compaction|hash|pinned_capacity` failure reason、formal frame
  decode、per-entry canonical accepted/rejected、source-business-allowlist identity
  rejection、snapshot freshness 与 restart reconciliation health；逐 source
  区分 intentional `off`、startup/session grace、closed-session freshness 与
  enabled-source control/subscription/freshness failure，任一 source `off` 不得
  停止另一 enabled source 的 metrics/alerts。
- [ ] 7.5 `[mist-monitoring]` 不增加 bridge telemetry wire；bridge-only overflow
  只写 bounded local log。metrics label 禁止
  symbol/subId/owner/lease/journal path/free-form error。增加 exact-label 与
  lifecycle contract tests：成功固定 `reason="none"`，失败固定 stable reason；
  QMT `off` 不发 QMT unavailable 且保留 TDX metrics，TDX `off` 对称保留 QMT
  metrics；enabled source 在 grace 内不报警、超过 grace 后按 control、
  subscription 或 freshness 分类报警，闭市不得仅因 freshness page。
- [ ] 7.6 `[mist/mist-datasource/mist-deploy/mist-monitoring]` 更新简体中文运维
  文档：说明当前只有内部 methods 与 test-only HIL harness、正常
  ready/reconnect 不发 control、没有 operator/product mutation endpoint；同时
  区分 native 未确认 retained ID 与 confirmed-unsubscribe durability failure
  的 `retained-recovery`；写明 journal storage 恢复不自动解锁、same-process
  只接受证明 context reload/rebuild 的 durable `operator_observation`；当前
  runtime 的重复退订返回 bool `false`，必须 reload/rebuild QMT context 并
  restart datasource；同时写明
  rotation/compaction 阈值、resolved detail 90-day default/rolling sealed
  checkpoint、SHA-256/中断恢复、pinned-cap maintenance、
  unexpected restart、TDX/QMT 双 bridge manual install、source-scoped
  restart、mode off 和 rollback；明确 intentional `off` 不等于普通健康或
  bridge-ready，明确 datasource HTTP root/scoped health 是 bridge
  owner/build/readiness 唯一权威，backend status 只表示
  `connected/transportReady`，不得等待 backend-cached `bridge.ready`；
  transport failure、该 source 不因 owner/snapshot absent 报警、另一 enabled
  source 仍受监控。不得把未来 `Security.status` scheduler 或不存在的 operator
  mutation endpoint 写成本期能力。
- [ ] 7.7 **阶段门**：双仓能力/布局、mode isolation 和 monitoring tests 通过后停止 review。

## 8. Contract、integration 与 CI

- [ ] 8.1 `[mist-datasource/Windows provider operator]` 建立并锁定独立 raw
  SHA 的 provider raw fixtures：QMT single callback one-code、whole
  callback one-code、whole callback multi-code，以及 TDX
  `get_market_snapshot` flat native；fixture 必须保留 provider 原始时间字段，
  不把 current-K fixture 标为 native tick，也不得把 raw fixture 或 raw SHA
  称为 datasource→Mist formal golden。
- [ ] 8.1a `[mist]` 在
  `test/fixtures/realtime/realtime-native-frame-v2.json` 建立 formal
  schema-v2 canonical golden，覆盖 QMT one/multi-code map 和 TDX one-entry
  map exact frame，并生成标准
  `realtime-native-frame-v2.sha256` sidecar；active golden test 不得继续以
  schema-v1 fixture 通过。
- [ ] 8.1b `[mist-datasource/mist-deploy/mist-monitoring]` 将 Mist canonical
  formal v2 JSON 与 sidecar 字节一致地 pinned 到既有三个 fixture 位置，
  更新各仓离线 CI、deploy `.gitattributes` 和 active 路径引用；各仓必须从
  本仓文件重算 SHA，跨仓验收必须比较四份 JSON 和 sidecar，archive 不重写。
- [ ] 8.2 `[mist/mist-datasource]` 验证
  `official QMT callback -> bridge wrapper -> datasource current handle
  membership -> unified v2 map -> common decoder -> Mist source business
  allowlist securityId resolve -> new QMT converter ->
  per-code common ingress keyed by securityId`。
- [ ] 8.3 `[mist/mist-datasource]` 验证
  `TDX dirty -> get_market_snapshot -> bridge request(no producerSequence,
  one-attempt) -> datasource one-entry v2 map -> common decoder -> new TDX
  converter -> common ingress keyed by securityId`；不得生成 formal sequence
  或使用旧 adapter/fence。
- [ ] 8.4 `[mist/mist-datasource]` integration 从 TDX/QMT client
  in-process methods 发起 control，覆盖 exact WebSocket request/response、
  callback burst/concurrency、multi-code partial acceptance、datasource
  non-member reject、member-but-now-unauthorized 在 Mist business allowlist
  逐项 reject 且不阻塞同帧其他 entry、whole
  reset、single overlay/unsubscribe、TDX/QMT unsubscribe failure 的共同 shape
  与不同 postcondition、QMT retained ID、sync cancellation-stage
  first-failure、TDX source-local gate 和 unsubscribe-target/HTTP/poll
  deterministic race、`callSequence` A-timeout/B-poll/A-late correlation、
  intent/subscribe-result/confirmed-unsubscribe-result durability fault、
  `retained-recovery` mutation block、journal rotation/compaction interrupted
  recovery、lease rejection、queue loss、datasource/backend restart 和
  explicit caller reconciliation；证明 ready/reconnect 不自动发送 control。
- [ ] 8.5 `[mist]` 实现 test-only HIL harness：通过 Nest application context
  构造一个正常 provider client、等待 ready、直接调用 typed methods、输出脱敏
  evidence 并尽力 cleanup；一次只选择一个 source。harness 不得进入 production
  module graph、container entrypoint 或 frontend/controller/diagnostic route，
  也不得另开绕过 client 的 raw WebSocket。evidence 必须分别记录 provider
  raw fixture SHA 与 Mist canonical formal schema-v2 SHA，并证明运行链路生成
  的 formal frame 与 canonical/pinned golden 一致；不得用 raw SHA 替代
  formal SHA。生产主机 wrapper 在 stop backend 前必须记录 running image ID、
  用 exact Docker root/`.env` 解析 Compose backend image、确认其等于 intended
  candidate full SHA，并在 **resolved image** 而非仅 running container 中检查
  HIL entrypoint；exact recovery image 必须已在本地，或 registry login +
  exact pull 已先成功。还必须预检相同 Compose environment 下的 recovery
  command 与 health URL；任一不满足时在 stop/provider mutation 前 fail closed。
  stop 后任意失败都必须使用 preflighted exact image 恢复 backend、等待 health
  并记录 cleanup/reconnect；恢复失败单独标为 production recovery incident。
- [ ] 8.6 `[all affected repositories]` 运行 unit、contract、integration、
  lint、typecheck、build、Python 3.6 guard、layout guard、
  `git diff --check` 与 clean-CI equivalent；`mist`、`mist-datasource`、
  `mist-deploy`、`mist-monitoring` 的本地 contract test 必须分别重算 formal
  v2 fixture sidecar SHA，并在跨仓 gate 比较四份字节与 SHA 一致。
  deploy contract tests 还必须覆盖 datasource direct bridge readiness 与
  backend `connected/transportReady` 两个独立门禁。
- [ ] 8.7 **阶段门**：保存本地 evidence，未经确认不发布 candidate。

## 9. 兼容发布准备

- [ ] 9.1 `[mist/mist-datasource/mist-deploy/mist-monitoring]` 构建
  backend/datasource candidate，并验证运行时只接受统一 schema v2、包含两套
  新 converter；candidate gate 必须确认 Mist canonical 与三个 pinned copy
  的 formal v2 JSON 字节一致、四份 `.sha256` 固定同一个 formal SHA，且
  active CI 不再用 schema-v1 golden 证明当前 contract。明确这是维护窗口
  切换，不承诺 schema-v1 compatibility 或 bridge-first 无报错。
- [ ] 9.2 `[mist-deploy]` 保持生产默认 `QMT_REALTIME_MODE=builtin`，准备显式 `off`、source-scoped restart 和 image rollback 命令。
- [ ] 9.3 `[operator]` 先将 QMT realtime 置 `off`，验证 monitoring 报告
  intentional QMT off、不发 QMT realtime-unavailable 且 TDX source-labelled
  metrics 仍存在；随后暂停 TDX realtime bridge/datasource snapshot traffic并
  进入维护窗口。分别手工备份并覆盖 TDX/QMT bridge，按 provider 记录安装路径、
  旧新 SHA-256 和 runtime build ID。TDX producer wire 删除不声明 rolling
  compatibility。
- [ ] 9.4 `[operator/mist-deploy]` 部署 datasource/backend candidate；TDX、QMT
  datasource 按各自 bridge/contract 步骤分别重启，backend 仅按需要 recreate，
  任何 source mode 工具不得顺带重启另一 datasource；记录正常 backend 在
  ready/reconnect 后没有发送任何 subscription control。部署 evidence 必须同时
  记录 intended full SHA、Compose `.env` resolved image 与 running container
  image ID；三者不一致时不得进入 HIL，也不得把“running container 暂时健康”
  当作下一次 `docker compose run/up` 会使用同一 image 的证明。
  candidate health 必须直接从 datasource scoped route 取得 bridge owner/build/
  readiness，并仅从 backend status 取得 `connected/transportReady`；不得要求
  backend status 返回 bridge 副本。
  - 2026-07-29 requalification: a later full-stack deploy had drifted the
    datasource to `ddbbdd0a...`. Normal correction run `30439521072` resolved
    intended `c8b140b...` to
    `sha256:5b844cb5add96085cd5a58de575f9029716a80ca1ad0f98f5f2af81412caac55`
    but rolled back because no TDX bridge owner registered. TDX recovery run
    `30439986842` also ended owner-missing. Maintenance deploy
    `30440335811` is image correction only and cannot complete 9.4 until a
    subsequent normal health-gated deployment proves resolved/running identity
    and normalized readiness.
  - QMT source-scoped mode/recovery runs
    `30440749753/30440938384` restored `builtin` and published the required
    durable context-rebuild observation. Final smoke `30441051512` proved
    `subscriptions.ready=true`, journal healthy, no reconciliation required,
    an empty registry and owner `bigqmt-29616`. TDX current probe
    `30440607292` remains blocked by the missing terminal bridge owner.
- [ ] 9.5 **阶段门**：routes、owner lease、journal、control readiness 与
  protected pre-digest 正确，并且 candidate/recovery image preflight 已通过后，
  只允许进入 test-only HIL。不得把 QMT builtin ready、空 registry 或 HIL
  harness 临时订阅描述成 production lifecycle 已激活；image identity、
  entrypoint、registry/pull 或 recovery path 任一失败都必须在停止正常 backend
  前终止。

## 10. Windows HIL

- [ ] 10.1 `[Windows QMT operator/mist]` 停止或隔离正常 backend 的 QMT
  client，以 test-only Nest in-process harness 作为唯一 backend leader，直接
  调用 `syncSubscriptions/subscribe/unsubscribe/getSubscriptions`；不得使用裸
  WebSocket、HTTP/controller、CLI 或 diagnostic mutation endpoint。交易时段
  验证 exact integer ID（允许 `0`）、callback freshness/count、changed-symbol
  map、per-code decoder、whole reset 与 single overlay；用受控 fixture 证明
  non-member 在 datasource current handle membership 拒绝，而
  member-but-business-unauthorized 到 Mist 后逐项拒绝且不阻塞同帧 authorized
  member；注入/捕获未确认退订时
  验证 `QMT_UNSUBSCRIBE_UNCONFIRMED/unknown`、原 ID 保留和 replacement
  blocked；首次 accepted unsubscribe 后对同一个已释放 subId 再调用一次，
  记录精确返回/异常、callback 持续停止、可观察的 active/quota 释放和后续 ID
  复用；当前 runtime 首次成功固定为 exact bool `true`、重复已释放 ID 固定为
  exact bool `false`，后者不得作为 recovery success。固定当前 runtime 的
  `time/stime/timetag` 存在性、值类型、候选优先级、parser、单位、时区、
  精度及同时出现时的一致性；证明 canonical `eventTime` 可回溯到原始
  provider 值，且候选不可用/冲突时为 null、不会退回任何本机时间。
  - 2026-07-28 partial evidence: run `30323074581` used the Nest test-only
    harness with `300502.SZ/600519.SH`, returned whole subId `2` and single
    subId `3`, and captured fresh whole/overlay raw callbacks. Native
    `unsubscribe_quote` returned exact bool `false`; datasource correctly
    returned `QMT_UNSUBSCRIBE_UNCONFIRMED/unknown` and retained both handles.
    Current candidate run `30332275918` repeated the fresh whole/overlay
    capture and proved canonical `eventTime` from provider-native time.
    Run `30427618972` later captured exact bool `true` for successful
    cancellations and exact bool `false` for the same released ID; retained
    artifact run `30427924763` preserves the native result sequence. After
    deploying datasource `c8b140b07f9d053c547e1e696f5a1779d0368b12`,
    post-close run `30430369735` accepted both overlay subId `3` and whole
    subId `2` cancellations from exact bool `true`, durably recorded
    `confirmedBy=hil_boolean_true`, and ended with an empty registry plus
    `ready=true`. The overlay `600519.SH` also produced a fresh native fixture
    and canonical readback; the run remained red only because the post-close
    whole `300502.SZ` subscription produced no new callback within 90 seconds.
    Quota/ID reuse and the remaining membership-negative scenario keep this
    task unchecked.
  - [x] Unique Nest test-only leader, exact integer whole/single IDs, fresh
    whole/overlay callback and changed-symbol common-ingress readback.
  - [x] Unconfirmed unsubscribe returns
    `QMT_UNSUBSCRIBE_UNCONFIRMED/unknown`, retains the original handles and
    blocks clean replacement.
  - [ ] Current-handle non-member rejection plus member-but-business-
    unauthorized per-item backend rejection.
  - [x] Accepted unsubscribe returns exact bool `true`; the repeated released-ID
    call returns exact bool `false` and remains unconfirmed. Evidence:
    `30427618972/30427924763`; deployed acceptance and empty-registry cleanup:
    `30430369735`.
  - [ ] Callback stop, quota release and later ID reuse classification.
  - [x] Canonical QMT `eventTime` readback traced to provider-native time:
    current candidate run `30332275918` captured whole
    `2026-07-28T05:39:51.000Z` and overlay
    `2026-07-28T05:39:53.000Z`, with no measurement-time fallback.
  - [ ] **下一个交易时段补验（阻塞 10.1 完成）**：
    - 时间窗：选择下一个支持的 A 股连续竞价交易时段，优先
      `09:35-11:25` 或 `13:05-14:55`（`Asia/Shanghai`），避开集合竞价、
      午休和收盘后的无变化窗口；开始前记录实际日期、开始/结束时间和
      terminal/runtime build。
    - 前置条件：生产 `QMT_REALTIME_MODE=builtin`；datasource 根 `/health`
      中 `subscriptions.ready=true`、`journalHealthy=true`、
      `reconciliationRequired=false`；`/qmt/bridge/health` 有 current
      `ownerId` 且 `ready=true`；记录运行中的 datasource image digest、
      backend 40 位 SHA 和可用 recovery image。
    - 执行：以 `300502.SZ` 为 whole symbol、`600519.SH` 为 single overlay，
      运行 `run-windows-realtime-subscription-hil.yml` 的 `capture/qmt`
      非 preflight 模式；`intended_backend_sha` 必须填写当时 Compose
      实际解析的 backend 40 位 SHA，`snapshot_timeout_seconds=90`。
    - whole 通过标准：`subscribe_whole_quote` 返回 exact integer subId，
      90 秒内产生当次订阅后的 fresh native callback fixture；Mist canonical
      readback 的 `source/securityId/providerSymbol/eventTime/quality` 与该
      fixture 可追溯一致，`eventTime` 不得回退到 `capturedAt` 或本机时间。
    - overlay 通过标准：`subscribe_quote` 返回不同的 exact integer subId，
      90 秒内产生 `600519.SH` fresh native fixture 和 canonical readback；
      registry 同时精确包含 one whole + one single，不能只证明其中一条。
    - 清理通过标准：overlay 与 whole 的首次 `unsubscribe_quote(subId)`
      都返回 exact bool `true`，journal 各自保存 native intent/result 和
      `confirmedBy=hil_boolean_true` transition；最终
      `whole=null`、`singles={}`、`ready=true` 且无 retained recovery。
    - 恢复与证据：正常 backend 必须恢复健康；上传
      `realtime-subscription-hil.json`、两份 raw fixture、
      `qmt-unsubscribe-evidence.json`；工作流整体必须为 green。只有这些
      条件同时成立，才能把 10.1 的 fresh whole/overlay trading-session
      验证记为完成。
    - 现有边界：`30430369735` 只证明已部署版本的 overlay callback、
      canonical readback、两次 bool `true` 取消和空 registry 清理；由于运行
      在收盘后且 whole `300502.SZ` 未在 90 秒内产生新 callback，它不能替代
      本补验，也不得被改写为完整绿色 HIL。
    - 治理后边界：run `30430369735` 的 exact bool `true`、durable
      transition 与清理证据继续有效；但它之后发生过 datasource image drift。
      下一次交易时段必须在运行中的 exact `c8b140b...` 镜像、normalized
      readiness 与新 pre-digest 下重新证明 fresh whole + overlay。
- [ ] 10.2 `[Windows QMT operator]` 验证 callback burst、queue bound、
  malformed-one-code isolation、old lease rejection、严格递增
  `callSequence` 及可控延迟下 A-timeout/B-poll/A-late reject 且 B 保持可完成；
  通过受控 fault harness 分别证明 intent durability failure 零 native、
  subscribe-result failure 保留 ID、confirmed-unsubscribe-result failure
  保留 `retained-recovery` 且返回
  `QMT_JOURNAL_DURABILITY_FAILED/unknown`、阻止 replacement/后续 mutation并
  不自动重复；使用小阈值验证 rotation/compaction、各 publish 边界中断恢复、
  unresolved pinned 与 cap 前 fail closed，并演练 journal 恢复后
  context reload/rebuild proof 的 durable `operator_observation`；不得使用
  repeated unsubscribe bool `false` 解锁。演练 context reload/restart、
  retained ID failure 和 planned/unexpected
  datasource restart runbook。
  - [x] Datasource CI run `30322477897` on exact
    `0b43a521187adbed737a932f4942849d88fe2295` passed deterministic unit and
    integration coverage for queue/lease/callSequence/late-result, durability,
    rotation, compaction, 90-day folding and interrupted publish boundaries.
  - [x] Production recovery runs `30322786851/30322918489` proved the durable
    context-rebuild `operator_observation` closes
    `reconciliationRequired`.
  - [x] Windows controlled-fault run `30330119132` against exact datasource
    `333830977c1b3a1c6e2bf5437a2819cbb8094b6a` passed 78 tests with zero
    failures; archived JUnit SHA
    `5f14c967f3fd7af4b7d3ac867033b7d15622d8ec29fd3bb932d12c1a32de9920`.
  - [x] Recovery run `30330469662` replaced owner
    `bigqmt-24108 -> bigqmt-42196`, published durable observation sequence
    `40`, cleared retained handles, and post-smoke run `30330585275` proved
    `ready=true/reconciliationRequired=false`.
  - [ ] Current-candidate requalification: datasource CI run `30428635434`
    covers the `c8b140b...` code line, but exact-image Windows controlled
    faults must be rerun after the maintenance deployment is independently
    confirmed. Historical green runs remain retained and are not relabelled as
    current-image evidence.
- [ ] 10.3 `[Windows TDX operator/mist]` 停止或隔离正常 backend 的 TDX
  client，以同类 test-only Nest in-process harness 作为唯一 leader 调用四个
  TDX control methods，并执行受影响链路 HIL：验证 bridge snapshot
  body 无 `producerSequence`、每份 snapshot 只 POST 一次、失败不 retry、
  HTTP 2xx 不返回 item ack/sequence、datasource 输出 schema-v2 one-entry
  map、新 TDX converter 与 common ingress readback，且不存在 formal
  sequence/fence；同时验证四种 datasource API、mutation `success:null`、
  fresh terminal-native list、bridge unsubscribe/subscribe 及最终 list
  postcondition，覆盖 read barrier、already-absent、
  `TDX_UNSUBSCRIBE_NOT_CONVERGED/subscribed` 和
  `TDX_UNSUBSCRIBE_VERIFY_FAILED/unknown`；unsubscribe `success:null` 后继续
  至少三个完整 bridge poll/result 周期，证明 target symbol 始终 absent 且
  没有旧 desired 触发的反向 subscribe，并证明 public response 不包含内部
  `desiredRevision`。不重新定义未变化的 TDX provider native acquisition
  字段；同时验证 canonical
  `securityId/providerSymbol`、按 `securityId` latest readback、duplicate state
  可再次接受、diagnostic 无 epoch/sequence，并证明 TDX canonical
  `eventTime` 只来自 accepted provider-native fixture，不能来自 callback
  收到、datasource 发送或 backend 接收时间。验收核销必须把以下证据分别列出，
  不得以一次绿色 workflow 互相替代：raw capture SHA；typed-control exact-state
  与 cleanup；运行时 formal-frame/converter/common-latest readback；live
  no-`producerSequence`/one-attempt/no-retry/no-item-ack；unsubscribe 后三个完整
  poll/result 周期；两个 unsubscribe failure 分支；canonical `eventTime`
  readback。旧 runtime smoke 在本 change 的正常 dormant `desiredSymbols=0`
  状态不得被当作 freshness failure；需要 live quote 时必须先由唯一 test-only
  caller 显式建立 desired。
  - 2026-07-28 partial evidence: run `30323295927` proved fresh whole/overlay
    raw capture, typed-control exact state
    `[] -> [600030] -> [600030,603127] -> [600030]`, three complete
    post-unsubscribe reads with `603127` absent, and cleanup `[]`. The live
    Current candidate run `30332459772` repeated the exact state, three-cycle
    absent and cleanup evidence and proved canonical `eventTime=null` when
    the accepted raw callback has no provider-native time field. The live
    one-attempt/no-retry/no-item-ack fault and both unsubscribe failure
    branches remain separate missing evidence, so this task stays unchecked.
  - [x] Fresh raw whole/overlay capture SHA, Nest typed-control exact state,
    common-ingress latest readback and cleanup.
  - [x] Mutation `success:null`, fresh native-list postconditions and three
    complete post-unsubscribe cycles with the overlay absent.
  - [x] Windows deterministic/contract run `30327309989` on exact datasource
    `3d130f72040675eb06305abe6dd4dbfcd4e024f9`: 43 tests, zero failures;
    JUnit SHA
    `08c13d01a0a3841eb714af0289c8a9c2a7d26f2c52672bcd23d889a0cf518e2a`.
    This proves empty 2xx response, `producerSequence` rejection, the static
    single snapshot POST/no-retry guard and datasource failure/state branches,
    but does not replace a live terminal fault.
  - [ ] Live snapshot one-attempt/no-retry/no-item-ack evidence.
  - [ ] `TDX_UNSUBSCRIBE_NOT_CONVERGED/subscribed` and
    `TDX_UNSUBSCRIBE_VERIFY_FAILED/unknown` live failure evidence.
  - [x] Canonical TDX `eventTime` readback proving null when the accepted raw
    callback has no provider-native time field: current candidate run
    `30332459772` returned `eventTime=null`,
    `eventTimeAvailable=false` and `aggregationEligible=false` for both
    `600030.SH` and `603127.SH`.
  - [ ] Quality-governance requalification: prior TDX HIL is historical after
    the exact `LastClose` converter and normalized readiness changes. Re-run
    raw `LastClose` -> formal v2 -> `prices.lastClose` -> common ingress,
    typed control and three absent cycles on the current candidate. Runs
    `30439521072/30439986842` additionally prove that the TDX terminal bridge
    owner is currently missing, so no current TDX HIL can be credited yet.
- [ ] 10.4 `[operator]` 验证 source-scoped mode switch、backend restart、QMT
  terminal/context reload、rollback、old callback rejection 和 protected
  post-digest；验证 QMT `off` 不产生 QMT unavailable 且不停止 TDX metrics，
  TDX `off` 或 TDX bridge rollback 不停止 QMT metrics，并覆盖 enabled source
  startup/session grace 与 closed-session freshness；restart/reconnect 只更新
  readiness，后续 read/mutation 必须由 harness 明确调用。
- [ ] 10.4a `[operator/mist-deploy]` 与
  `containerize-tdx-qmt-datasources` task 5.4 共用同一窗口和 manifest：记录
  两个 datasource Compose container/image/digest、QMT bind mount、WinSW
  absence、Compose DNS 与 TDX `host.docker.internal:17709`；在 mutation cleanup
  后分别 source-scoped restart QMT/TDX，证明另一 datasource 与应用 container
  未 recreate、QMT journal/checkpoint 连续、bridge 重新注册且 reconnect 不
  自动发 control；执行联合 container/bridge/journal/realtime soak。两个 change
  必须分别给出结论，不能互相借用不相关证据。
  联合 manifest 必须分别保存 datasource scoped bridge health 与 backend
  `connected/transportReady`，不得用 backend-cached bridge state 代替前者。
  - 2026-07-28 partial evidence: TDX source-scoped restart run `30323653971`
    recreated only `tdx-datasource`, preserved every unrelated container and
    the QMT journal checksum, and executed no native mutation; the later
    datasource delta was QMT-only. Current datasource deploy run
    `30329944621` pinned
    `333830977c1b3a1c6e2bf5437a2819cbb8094b6a` at digest
    `sha256:75df301e77db8fe1b9ef5c1089e3aaaf2d7be1fd67b4d4a3b59bd1bcb26f1947`.
    After durable context rebuild cleanup, QMT restart run `30330637703`
    recreated only `qmt-datasource`, preserved every unrelated container,
    kept journal SHA `7278121a...85bc`, retained owner `bigqmt-42196`, and
    executed no native mutation. Current protected pre/post runs
    `30331886288/30334690762` matched all six row counts and content digests.
    TDX owner soak run `30332675452` passed 35 samples with one owner, build
    v2.1, revision `4/4` and no failure, but it is source-only. The migration
    verdict remains `partial`; the dual-source joint soak remains required,
    so this task stays unchecked.
  - 2026-07-29 current-image correction evidence: normal deploy
    `30439521072` resolved the required c8 image/digest but rolled back on
    missing TDX owner; recovery `30439986842` did not restore the owner.
    Maintenance deploy `30440335811` is recorded as a controlled,
    health-skipped image correction and cannot replace source readiness,
    restart isolation, current protected digests or joint soak evidence.
  - [x] TDX source-scoped restart isolation and unrelated-container
    stability.
  - [x] QMT controlled cleanup and source-scoped restart isolation.
  - [ ] Dual-source container/bridge/journal/realtime joint soak.
  - [x] Current protected pre/post digests
    `30331886288/30334690762` match for all six protected tables.
- [x] 10.5 `[mist]` 按
  `mist-deploy/docs/runbooks/realtime-native-subscription-off-session-verification.md`
  收集非交易时段 evidence；只声明 owner/control/journal/restart/已有 fixture，
  manifest 固定 `sessionClass=off-session` 与 `freshnessProven=false`，不能冒充
  realtime freshness。交易时段与最终 task 勾选统一从
  `realtime-native-subscription-joint-acceptance.md` 进入。
  - 2026-07-28 evidence: off-session dual-source smoke `30336591652`;
    QMT controlled faults `30330119132`; TDX controlled faults
    `30327309989`; QMT/TDX source-scoped restart evidence
    `30330637703/30323653971`; terminal artifact disposition
    `30339307252`; final repository/fixture/CI/sanitization review in
    `off-session-final-review-2026-07-28.md/.json`. The review explicitly
    keeps `freshnessProven=false`.
- [ ] 10.6 **阶段门**：HIL/evidence 经 review，且联合 manifest 中
  `containerize-tdx-qmt-datasources` 与本 change 均为通过后才能接受发布。
  - 2026-07-28 current verdict: `partial`. QMT positive subscription,
    controlled faults, durable recovery and source-scoped restart evidence
    exist, and QMT exact bool `true` success plus repeated released-ID bool
    `false` behavior is now fixed by `30427618972/30427924763`; TDX live
    negative/no-retry evidence and the dual-source joint soak remain open. The
    final sanitized review is complete. QMT and TDX
    canonical `eventTime` boundaries plus the current protected post-digest
    are now proven. The joint release gate is therefore `blocked`.
  - 2026-07-29 governance verdict remains `partial/blocked`: exact QMT bool
    semantics are retained, while current-image normalized readiness,
    QMT whole/overlay, TDX LastClose/live faults, protected digests and the
    joint soak must be requalified under the shared acceptance entry.

## 11. Theme B B1 与 post-close 刷新

- [ ] 11.1 `[mist]` 以四仓一致的 formal schema-v2 golden 作为 transport
  input，并用 accepted QMT/TDX raw fixtures 固定两套 converter mapping，刷新
  B1 downstream realtime fixture 及其独立 SHA；B1 fixture identity 使用
  `securityId + providerSymbol`，不得继续包含 formal epoch/sequence，也不得
  把 raw、formal 或 B1 downstream 三类 SHA 混用。
- [ ] 11.2 `[mist]` 重新校准 QMT latest-state freshness grace 与 capacity，明确 callback transport 有损且不 tick-complete。
- [ ] 11.3 `[mist]` 保持 B1 边界：latest snapshot 仅 bounded Node memory，Redis 只保存 open candle 与 daily closed-1m-K；本 change 不实现 candle。
- [ ] 11.4 `[mist]` 将 runtime source-switch requirement 留在未来 change/blocked 项，不在本 focused change 实现。
- [ ] 11.5 `[mist]` 在 B1 change 中删除 transport epoch/sequence 假设，将
  canonical provider `eventTime` 固定为 candle 分桶、交易日归属和时间排序
  的唯一输入；`capturedAt`、formal `timestamp`、`acceptedAt`、backend
  processing/current time 均不得补位，`eventTime=null` 不进入聚合。另行定义
  重复 latest-state 的累计量处理；本 focused change 只记录阻塞，不实现
  candle。
- [x] 11.6 `[mist]` 刷新 active `sync-post-close-provider-history` 的 proposal、
  design、task 2.3 与 `datasource-provider-contract` delta：将 historical
  API/bridge“不变”明确为相对于依赖归档后已接受的 schema-v2 baseline，
  删除对 formal epoch/per-symbol sequence 的正面依赖并禁止重新引入旧 v1
  字段。只有 diff、formal fixture/SHA 与 installed bridge evidence 证明
  realtime 未受影响时才可引用既有 schema-v2 transport HIL；仍须运行
  TDX/QMT historical API regression，并 strict validate focused、B1 与
  post-close 三个 active changes。

## 12. 收尾、回滚证明与归档

- [ ] 12.1 `[operator/mist]` 在 HIL harness 仍拥有 leader connection 时演练其
  `syncSubscriptions([])`，随后执行 `QMT_REALTIME_MODE=off`、分别手工恢复旧
  TDX/QMT bridge、对应 terminal/context reload 和 image rollback；保留失败
  ID/journal/log。若 harness 已不可用，必须记录 cancel-all 未执行，不得假设
  另有 operator mutation endpoint。
- [ ] 12.2 `[operator]` 证明 QMT rollback 不修改 TDX mode/service，TDX bridge rollback 不修改 QMT mode/service，且两者都不回滚数据库、不删除 Redis volume，protected digest 不变。
- [ ] 12.3 `[all repositories]` 复核 branch/upstream、dirty status、diff 与
  全量 CI；单独列出 provider raw evidence SHA 和 formal schema-v2 golden
  SHA，逐字节比较
  `mist/test/fixtures/realtime` canonical 与 datasource/deploy/monitoring
  三个既有 pinned 路径的 v2 JSON，并确认四份 `.sha256` sidecar 文件名、
  内容和重算结果完全一致。任何 active v1 golden/path reference、缺失 pinned
  copy 或 raw/formal SHA 混用都阻止归档。同一 manifest 还必须固定 deploy
  SHA、datasource image tag/digest、container IDs、state mount、
  source-scoped restart/soak 与两个 change 的独立结论；当前 steady-state
  deploy workflow 不得重新出现 `datasource_root/remove_legacy_winsw`。
  - [x] 2026-07-28 off-session portion: six-repository identity audit,
    four byte-identical formal v2 copies and sidecars, exact-ref Mist,
    datasource and deploy CI, and sanitized manifest review are recorded in
    `off-session-final-review-2026-07-28.md/.json`.
  - [ ] 2026-07-29 governance portion: OpenSpec strict validation now covers
    57 specs and the formal v2 SHA remains unchanged. Current heads and the
    c8 image digest are recorded in
    `quality-governance-requalification-2026-07-29.md/.json`, but normal
    deployment readiness, current protected digests, trading HIL and the joint
    soak remain open.
  - [ ] Trading-session portion: required dual-source freshness soak and final
    pass verdicts remain open, so task 12.3 itself stays unchecked.
- [x] 12.4 `[mist]` 使用已记录的 OpenSpec CLI `1.6.0` 完成 focused 与
  `--all --strict` validation；CLI 缺失时不得归档。
- [ ] 12.5 `[mist]` 刷新 production baseline、Theme B 阻塞状态和中文运维入口；
  baseline 对 approved TDX 或 QMT `off` 都记录 affected source、双 source
  effective mode、operator action、backup identifier、reason、精确 recovery
  command/procedure 和另一 enabled source monitoring，且不把 `off` 记为物理
  退订证明或长期默认；经用户确认后归档 change。
