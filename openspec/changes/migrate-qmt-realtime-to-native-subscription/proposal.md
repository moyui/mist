## Why

当前 QMT realtime 由 datasource 每秒创建一次 `get_full_tick` command，QMT 内置 bridge 执行后只提交一次 result。该轮询链路没有使用迅投/QMT 官方 subscription callback，也不适合一个订阅建立后持续到达的 callback。

官方文档已经明确：

- `ContextInfo.subscribe_quote(..., period='tick', result_type='dict', callback=...)` 的 callback 形状为 `{code: {field: value}}`。
- `ContextInfo.subscribe_whole_quote(code_list, callback=...)` 每次推送发生变化的品种，callback 形状为 `{code: {field: value}, ...}`。
- single/whole callback 的单品种数据与 `get_full_tick` 返回对象属于同一 tick 结构。
- 官方数据结构表使用 `time/stime`，而 `get_full_tick` 页面示例还出现 `timetag`；外层 `{code: tickData}` 与逻辑 tick 字段已经确定，但 backend 的精确事件时间字段、类型、单位与时区映射必须由当前生产 runtime fixture/HIL 固定。
- “与 `get_full_tick` 结构一样”只表示 native snapshot 的逻辑字段相同。官方行情常见问题将全推描述为只保存最新值并把发生变化的增量部分推给下游，因此 callback 不证明每一笔交易所 tick 都被完整传输。
- 两种 subscribe 均返回 `int` 订阅号，并通过 `ContextInfo.unsubscribe_quote(subId)` 反订阅。

因此 QMT realtime 可以直接传输 callback 原始 `{code: tickData}`，不再在 callback 后调用 `get_full_tick` 或 `get_market_data_ex`。QMT 历史 `get_market_data_ex(..., subscribe=False)` 继续使用当前 command/result 链路，完全不变。

## What Changes

- QMT realtime acquisition 从每秒 `get_full_tick` 迁移为官方 callback。
- provider acquisition 层不修改 TDX；datasource→Mist formal transport 则在
  本 change 内把 TDX/QMT 一次统一为 schema v2，避免 QMT 只到 datasource
  而未接入 Mist，也避免长期维护 v1/v2 双协议。
- 同时支持：
  - `sync_subscriptions(symbols)`：顺序取消当前 whole 与全部 single ID，全部成功后调用一次 `subscribe_whole_quote(exactDesiredSymbols)`。
  - `subscribe(symbol)`：调用 `subscribe_quote(symbol, period='tick', dividend_type='none', result_type='dict')`。
  - `unsubscribe(symbol)`：取消对应 single `subId`；whole 成员变化通过下一次 `sync_subscriptions`。
  - `get_subscriptions()`：读取 provider-specific actual state。
- Mist 的 TDX/QMT realtime WebSocket client 都实现同一个 Nest 内部、
  in-process control interface：`syncSubscriptions(symbols)`、
  `subscribe(symbol)`、`unsubscribe(symbol)` 与 `getSubscriptions()`。这些方法
  必须真正发送上述 WebSocket request、等待匹配 response 并返回 typed result，
  不能只是未实现的 stub。
- 本 change 不给这些方法接生产调用方：WebSocket `open/ready/reconnect`、
  allowlist 初始化或变化、`Security.status` 变化都不得自动触发 control
  request；也不新增 HTTP/GraphQL/controller、frontend、CLI 或 diagnostic
  mutation 入口。当前 unit/contract/integration 与 Windows HIL 通过 test-only
  in-process harness 直接调用方法；后续独立 change 再由定时 coordinator 根据
  `Security.status=ACTIVE` 计算 desired set 并调用同一接口。
- datasource 内部只保存两个逻辑 bucket：nullable
  `whole{subId,symbols}` 与 `singles{providerSymbol:subId}`。`whole.subId` 和
  `whole.symbols` 必须成对存在，因为一个 whole ID 覆盖一组 exact symbols；
  每个 single symbol 则对应自己的 ID。两种 subscribe 返回值只要求
  `type(result) is int`，允许 `0`，不附加正负范围假设；
  不能根据 ID 数值或 symbol 数量推断 whole/single。
- QMT `subId` 由 datasource 写入：

  ```text
  F:\quant\MistAPI\datasource\state\qmt\subscription-journal.jsonl
  ```

  journal 为单 writer、active append-only、archive immutable、flush+fsync，并详细保存 native 调用、返回、异常和 ID 生命周期；不写 MySQL 或 Redis。
- 本期 journal 只承担留证和人工恢复依据，不自动从 journal/QMT print log
  重建 crash 前的 live registry；datasource 意外重启后 fail closed，由操作员
  reload QMT context。后续 full sync 只能由明确的 in-process caller 发起；
  当前 change 的验证阶段由 test-only HIL harness 发起，生产自动恢复留给后续
  integration change。
- 新增独立 loopback-only 通道：

  ```text
  POST /qmt/bridge/subscriptions/poll
  POST /qmt/bridge/subscriptions/result
  POST /qmt/bridge/subscriptions/snapshot
  ```

- subscription control 每次只下发一条 native call；datasource 同时最多保存一个 in-flight call。协议不使用公开或内部 `operationId/commandId`，不自动 retry、replay 或补发。
- QMT subscription poll request 顶层恰好携带
  `ownerId + leaseToken + generation`；poll response 顶层恰好为
  `{command}`。非空 command 只携带 `callSequence`、method 和该 method 的
  exact command fields，不重复 owner lease identity，也不增加 `streamEpoch`。result
  request 再在顶层携带同一 owner lease identity、`callSequence` 与恰好一个
  `success|failure`。
- control result 只使用二选一：

  ```text
  success = provider-specific value | null
  generic failure = { symbol: string|null, reason: stableCode }
  unsubscribe/cancel failure = {
    symbol: string|null,
    reason: stableCode,
    subscriptionState: subscribed|unknown
  }
  ```

- `subscriptionState=subscribed` 只在 official/current state 能证明目标仍在订阅集合时使用；无法证明物理退订结果时使用 `unknown`。失败分支不使用 `unsubscribed`，因为已证明取消完成时直接返回 `success:null`。
- TDX 不依据 `unsubscribe_hq` immediate payload 判断取消结果：datasource
  必须先在同一个 source-local mutation gate 内从现有 transport desired
  移除目标并推进内部 `desiredRevision`，再调用并尽可能验证官方
  subscription list；目标已不在 list 时成功，仍在 list 时返回
  `TDX_UNSUBSCRIBE_NOT_CONVERGED/subscribed`，list 无法取得或解析时返回
  `TDX_UNSUBSCRIBE_VERIFY_FAILED/unknown`。失败不得把旧 desired 回滚回来。
- 当前 QMT runtime 已由 Windows HIL 固定：对仍有效的 `subId` 成功调用
  `unsubscribe_quote` 返回 exact bool `true`；对同一个已释放 `subId` 重复调用
  返回 exact bool `false`。datasource 仅把 exact bool `true`（以及显式配置且
  另有 HIL 证据的整数白名单值）视为成功；bool `false` 返回
  `QMT_UNSUBSCRIBE_UNCONFIRMED/unknown` 并保留原 ID。whole-owned symbol 返回
  `QMT_SYMBOL_OWNED_BY_WHOLE/subscribed`。
- QMT journal intent 必须在 native call 暴露前完成 append+flush+fsync。若
  confirmed unsubscribe 后 result/registry transition 无法 durable，datasource
  返回 `QMT_JOURNAL_DURABILITY_FAILED/unknown`，把原 ID 保留并标记为
  `retained-recovery`，阻止 replacement 与后续 native mutation；不把该 ID
  宣称为 confirmed-live，也不自动重复退订。当前 runtime 对已释放 subId
  再次 `unsubscribe_quote` 的行为必须由 Windows HIL 固定，官方文档未定义时
  不得猜测 idempotent 或 harmful。
- journal storage 恢复本身不解除 `reconciliationRequired`；同一进程内只有
  证明 context reload/rebuild 的 durable `operator_observation` 才可解锁。
  当前 change 不为此增加 HTTP/WebSocket/CLI/diagnostic mutation endpoint；
  当前 runtime 的重复退订返回 bool `false`，不得作为恢复成功证据；运维恢复
  固定为 reload/rebuild QMT context 后 restart datasource。
- QMT journal 由 datasource single writer 按 bounded active/archive byte
  threshold 执行 crash-safe rotation/compaction；archive 与 checkpoint 使用
  SHA-256，任何没有 durable confirmed-unsubscribe evidence 的 ID lifecycle
  必须完整保留。active rotate 默认 `67108864` bytes，含 active/archive/
  manifest/checkpoint 的总上界默认 `536870912` bytes，均可由明确环境变量
  覆盖；resolved per-ID detail 默认保留 `90` days，之后只允许折叠成保持
  SHA-256 continuity 的 fixed-size sealed range。非法配置 fail closed，
  unresolved/`retained-recovery` evidence 不按年龄删除。若 pinned evidence 已
  达到上界，control 在 native call 前 fail closed，不能等到磁盘写满后再处理。
- callback 只做有界安全复制、记录 `capturedAt`、携带 `subscriptionId` 入有界队列并立即返回；单个顶层 entry 不可复制时只丢该 entry，不解析行情字段。一次 callback 对应至多一条 queue item 和一次 snapshot POST。
- QMT snapshot 中 `native` 保留完整 callback map：

  ```text
  {
    "300502.SZ": { ...get_full_tick tick fields... },
    "600030.SH": { ...get_full_tick tick fields... }
  }
  ```

  不拆掉 code key，不把 Mist 字段写入 tickData，不在 bridge/datasource 做 canonical conversion。
- Mist backend 使用一个只解 formal envelope 的 common schema-v2 decoder；
  按 code 遍历 native map，逐项 strict validate，并通过 source business allowlist
  `resolve(providerSymbol)` 取得 canonical `securityId` 后调用对应 converter。
  单个 malformed code/converter exception 不阻塞同一 QMT callback 的其他
  code；TDX formal map 必须恰好一项。
- 术语固定为：datasource 只做 `current handle membership`，即检查 callback
  code 是否属于该 `subscriptionId` 的已有 whole/single 分配；Mist backend
  的 DB-backed `source business allowlist` 才负责业务授权与
  `providerSymbol -> securityId`。前者不是第二份 allowlist。
- datasource→backend realtime frame 统一为唯一 active schema v2。TDX/QMT
  都使用 `schemaVersion + capturedAt + native:{providerSymbol:nativeObject,...}`；
  外层 `type=realtime.native_snapshot`、`provider=tdx|qmt` 与 `timestamp`
  继续负责路由和发送时间。TDX 每帧通常只有一个 map entry，QMT 保留
  callback 原始 one/multi-code map。
- provider raw fixture 与正式 frame golden 分开管理：QMT/TDX 原始 callback
  或 snapshot fixture 由 `mist-datasource` 采集并以 raw SHA 固定；正式
  schema-v2 frame 继续遵循 `cross-repo-contract-assets` 的既有归属，由
  `mist/test/fixtures/realtime` 维护 canonical，
  `mist-datasource`、`mist-deploy`、`mist-monitoring` 保存字节一致的 pinned
  copy 和 `.sha256` sidecar。raw SHA 不能替代 formal frame SHA 或四仓一致性
  验收。
- schema v2 同时从 TDX/QMT formal frame 删除 `payloadType`、`source`、
  `acquisitionProfile`、`streamEpoch`、`sequence`、`sequenceScope` 与独立
  `symbol`。bridge→datasource 继续使用 provider-local owner fence：TDX
  使用 `leaseToken + streamEpoch`，QMT 沿用
  `ownerId + leaseToken + generation`。这些字段只承担内部 transport
  safety，不再成为 datasource→backend 行情顺序、去重或完整性承诺。
- QMT datasource 为每个暴露给 bridge 的 native control call 分配
  datasource-process-local、严格递增的正整数 `callSequence`；bridge result
  必须原样回传。该字段只用于拒绝 timeout 后迟到且已不属于 current slot 的
  result，不进入 backend wire，也不提供 retry、dedup 或 exactly-once 语义。
- Mist 新建两套独立且对齐的 source converter：
  `apps/mist/src/sources/tdx/realtime/native-snapshot.converter.ts` 与
  `apps/mist/src/sources/qmt/realtime/native-snapshot.converter.ts`。二者只共享 schema-v2
  envelope decoder、canonical 类型和公共 ingress，不复用、包装或继续导入
  现有 v1 `realtime-native.adapter.ts`；旧 adapter 及其 v1 frame 依赖在切换时
  从 active runtime 删除。TDX/QMT provider-native 字段映射仍各自实现，不做
  generic native adapter。
- 两套 converter 都只接收已经解析的
  `securityId + providerSymbol + capturedAt + native`。canonical snapshot
  固定为
  `source/securityId/providerSymbol/eventTime/capturedAt/prices/cumulativeVolume/cumulativeAmount/quality/native`；
  不再保留模糊 `symbol`、formal epoch/sequence 或 event identity。provider
  event time 无法由 accepted fixture 证明时保持 `null`，不使用 backend
  receive time 伪造。
- QMT `time`、`stime`、`timetag` 只作为同一个 provider business time 的
  不同候选表示：`time` 是数值 timestamp，`stime/timetag` 是格式不同的
  timestamp string。bridge/datasource 完整透传，生产 fixture/HIL 再固定当前
  runtime 的候选优先级、解析格式、单位、时区和精度。TDX 遵循同一原则：
  canonical `eventTime` 只能来自 accepted provider-native fixture。
- 后续 realtime candle 的分桶、交易日归属和时间排序只能使用 canonical
  `eventTime`。`capturedAt`、datasource 外层 `timestamp`、Mist
  `acceptedAt` 以及 journal/control 时间都只是链路测量字段，不能作为聚合
  fallback；`eventTime=null` 的 latest-state observation 可以进入公共 latest，
  但不得进入聚合。
- 公共 `RealtimeSnapshotIngressService` 只保存一份按 canonical
  `securityId` keyed 的 latest；本 change 继续把 source business allowlist 作为
  snapshot 授权与 canonical identity 的 safety ceiling，并在初始化时拒绝同一
  `securityId` 同时出现在 TDX/QMT allowlist。它不实现 current-desired
  coordinator、`effectiveSourceBySecurityId`、`Security.status` 动态观察或
  latest cleanup；这些都属于后续 subscription-lifecycle integration。
  source runtime store 只保存
  connection/transport readiness、accepted/captured time 与 bounded
  rejection diagnostics，不再保存第二份 snapshot、sequence fence 或
  duplicate/out-of-order state。bridge owner/build 只保留在 datasource
  root/scoped HTTP health/control state，不复制到 backend runtime status；
  `realtime.stream_started` 不属于维护协议。本 change 不执行 runtime source switch。
- QMT callback transport 明确定义为有损 `latest-state native snapshot`：允许相同状态再次出现，也允许中间状态未被观察；不宣称 `tick-complete`，不在连接中断后补发。
- TDX snapshot transport 同样明确为有损 `latest-state snapshot`：从
  `/tdx/bridge/snapshot` request 删除 `producerSequence`，删除 terminal bridge
  snapshot POST 自动重试、datasource producer-sequence 去重和 success
  response 中的 item ack/sequence。一次 `get_market_snapshot` 结果只尝试提交
  一次；HTTP 2xx 即完成，提交失败允许丢失，重复 native 状态也允许再次进入。
- 上述 TDX 内部 transport 简化不改变
  `subscribe_hq -> dirty -> get_market_snapshot` acquisition；但本 change
  同时把 TDX datasource→backend formal frame 迁移到统一 schema v2，并删除
  datasource formal sequence 与 backend epoch/per-symbol sequence fence。
  TDX/QMT 都按有损 latest-state observation 处理。
- TDX/QMT 对 backend 都提供 `sync_subscriptions`、`subscribe`、
  `unsubscribe`、`get_subscriptions`，Mist 两个 WebSocket client 则通过同一
  Nest 内部 callable interface 暴露它们；不在 ready 协议动态广播
  `supportedOperations`，也不强行统一 provider-native success value。
- backend↔datasource control 沿用 provider-specific WebSocket，一次只允许一个 outstanding request，不使用 ack、operation ID、revision、CAS、result retention 或共同 subscription state union。
- TDX `subscribe` 继续走既有 bridge；`unsubscribe/get_subscriptions` 走官方
  HTTP RPC；`sync_subscriptions` 由 datasource 顺序编排 HTTP clear/list 与
  bridge subscribe。三种 mutation 共用一个 datasource source-local gate，
  并在 provider 调用前分别建立 current desired 的 union、difference 或 exact
  replacement；复用现有内部 `desiredRevision` fence，不把 revision 暴露到
  backend wire。TDX control poll/result wire schema 与 native acquisition
  不变，仅简化 `/tdx/bridge/snapshot` request 和 delivery policy。
- `QMT_REALTIME_MODE=builtin|off` 保持；切换工具只重启目标 datasource，并按需重建 backend，不得无条件重启另一 source。
- 发布采用维护窗口：先将 QMT realtime 置为 `off`，操作员分别手工覆盖受影响的
  TDX/QMT bridge，再更新 datasource/backend；正常 backend 启动后不得自动
  建立订阅。交易时段由 test-only in-process HIL harness 作为唯一 backend
  leader 调用内部方法，完成受影响链路验证并在退出前尽力
  `syncSubscriptions([])`；生产订阅激活等待后续 integration change。

## What Does Not Change

- QMT 历史 `get_market_data_ex(..., subscribe=False)`、`:9002/v1/bars/query`、历史 command/result 和返回结构不变。
- 不在 callback 中执行 HTTP、DataFrame 转换、Redis/MySQL I/O、canonical conversion、strategy、notification 或批量查询。
- 不修改 migration `006` 或任何 migration，不访问生产业务数据库。
- 不实现 current-K refresh、candle、strategy、Signal、AlertEvent、BullMQ、notification、Redis→MySQL 或 B2 portfolio backtesting。
- 不实现运行时 QMT↔TDX source switch；启动时配置校验仍保证同一个
  `securityId` 不会同时进入 TDX/QMT realtime allowlist。
- 不实现根据 `Security.status=ACTIVE` 自动订阅/退订、定时 reconciliation、
  current-desired/effective-source coordinator 或 control mutation 的产品入口。
- 不自动安装、覆盖、删除 QMT/TDX terminal bridge。
- 不恢复 legacy/experimental realtime transport。

## Capabilities

### New Capabilities

- `qmt-native-subscription-transport`：定义 whole/single subscription、逐 native-call control、callback map snapshot、subId journal、bounded queue、退订和质量边界。

### Modified Capabilities

- `realtime-market-data-ingress`：TDX/QMT 统一使用 schema v2 native map，
  backend 使用 common envelope decoder、allowlist canonical identity、两套
  全新 source converter 和按 `securityId` keyed 的公共 ingress；删除
  sequence/epoch runtime fence，不在本 change 引入 current-desired
  coordinator。
- `bigqmt-datasource-bridge`：历史 command polling 不变；新增独立 subscription control/snapshot routes。
- `datasource-runtime-safety`：固定单 in-flight control、callback 边界、有界队列、TDX/QMT snapshot at-most-attempted、无 retry 和 Python 3.6。
- `datasource-provider-contract`：保留 QMT/TDX native 差异及 QMT 历史契约。
- `backend-datasource-integration`：对齐四种能力、简单 success/failure control
  result 与两个 Mist client 的 Nest 内部 callable interface；明确没有自动
  control 或生产 mutation caller。
- `realtime-source-layout`：用代码与测试守卫两边能力/目录责任，不依赖动态 capability 广播。
- `monitoring-health-alerts`：统一 TDX/QMT control result 指标，固定成功
  `reason="none"`，覆盖 journal/snapshot failure，并保留逐 source intentional
  `off`、另一 source 继续观测及 startup/session grace 语义。
- `mist-production-baseline`：增加统一 frame v2、QMT subscription transport
  HIL（不声明 production lifecycle）、TDX
  control、TDX snapshot transport 简化、两套新 converter、双 bridge 手工
  覆盖与 source-scoped rollback HIL；TDX native acquisition 字段不重新定义，
  但必须验证新 TDX converter 与 schema-v2 端到端链路。

## Dependencies

- `normalize-tdx-qmt-source-layouts` 是本 change 的 OpenSpec 硬前置。其 delta
  必须先归档并同步为 stable `realtime-source-layout` capability，当前 change
  才能对该 capability 使用 `MODIFIED Requirements`。当前基线已归档至
  `openspec/changes/archive/2026-07-25-normalize-tdx-qmt-source-layouts/`；
  若 stable spec 缺失或回退，必须停止本 change 的实现。
- `relocate-cross-repo-contract-assets` 固定了 realtime golden fixture 的
  Mist canonical、datasource/deploy/monitoring pinned copy、标准 `.sha256`
  sidecar 与独立 CI contract。本 change 将 active formal golden 从 schema v1
  升级到 schema v2 时必须沿用该 contract；维护窗口不允许四仓测试资产或
  sidecar 长期分叉。
- 官方行情函数、数据结构和[行情常见问题](https://dict.thinktrader.net/innerApi/question_answer.html)页面共同构成 callback envelope、tick 逻辑字段和 `latest-state` 质量边界的设计 contract。
- TDX control 继续以官方
  [`subscribe_hq`](https://help.tdx.com.cn/quant/docs/markdown/ctx.stock.md/mindoc-1h1104d65vr68.html)、
  [`unsubscribe_hq`](https://help.tdx.com.cn/quant/docs/markdown/ctx.stock.md/mindoc-1h112vh7jtsms.html) 与
  [`get_subscribe_hq_stock_list`](https://help.tdx.com.cn/quant/docs/markdown/ctx.stock.md/mindoc-1h1137r4k2mas.html)
  为 contract；取消订阅文档样例的说明文本与 `ErrorId` 存在矛盾，因此 mutation 的公共成功以最终 list postcondition 为准，原始返回只进入 bounded local log/evidence。
- 生产 runtime fixture/HIL 只验证当前版本是否符合官方 contract、JSON 类型、单/多 code 行为，并固定 `time/stime/timetag` 这一组同义 business-time 候选的实际存在性、优先级、类型、单位、时区、精度和 backend 映射；不再决定是否采用 callback 架构。
- Theme B B1 在消费新统一 v2 fixture、设置 freshness grace 或 capacity 前，
  等待本 change 的 TDX/QMT v2 fixture、`securityId + providerSymbol`
  canonical identity、single latest ingress 与 callback 延迟/丢弃基线；
  B1 必须另行删除 transport epoch/sequence 假设，并以 canonical
  `eventTime` 作为唯一 candle 分桶/交易日/时间排序输入；任何本机观测时间
  都不得补位。
- 收盘后 provider history sync 已无限期延期，当前不存在 active implementation change。未来若由
  新 owner 重新授权，其“不修改 realtime”边界只能相对于届时已接受的 schema-v2 baseline 表述，
  不能恢复 formal epoch/per-symbol sequence；historical API 与 bridge 行为必须重新审计。

## Impact

- `mist-datasource`：QMT subscription gateway/journal/Python 3.6 bridge，删除旧
  realtime polling；TDX 增加 datasource control API，并从 terminal snapshot
  bridge、route 和 gateway 删除 `producerSequence`、snapshot retry/dedup
  链路；两边统一输出 schema-v2 native map；维护 provider raw fixtures 与
  formal schema-v2 golden 的 pinned copy。
- `mist`：TDX/QMT Nest 内部 control client、共同 schema-v2 envelope decoder、两套全新
  source converter、`securityId + providerSymbol` canonical identity、
  single latest ingress、精简 source runtime store、tests/OpenSpec；删除
  active schema-v1 decoder/adapter、重复 snapshot store 与 formal
  epoch/sequence fence；不增加 scheduler、`Security.status` watcher、
  controller 或 frontend caller；维护 formal schema-v2 canonical fixture 与
  `.sha256` sidecar。
- `mist-monitoring`：统一 control、journal 和 datasource-visible snapshot
  monitoring，并更新 formal schema-v2 pinned fixture、sidecar 与 contract
  test。
- `mist-deploy`：source-scoped mode switch、维护窗口、HIL、手工 bridge 与
  rollback 文档，并更新 formal schema-v2 pinned fixture、sidecar、
  `.gitattributes` 与离线 contract test。
- `mist-fe`、`mist-skills`：无产品代码影响。

## Validation Status

本 change 按仓库现有 `spec-driven` schema 维护，并使用本机通过 `pnpm`
安装的固定 OpenSpec CLI `1.6.0` 执行 strict validation。2026-07-26 本次
artifact 修正后，focused validation 通过，`--all --strict` 为 52/52 通过；
同时执行 requirement/scenario、术语残留、Markdown fence、尾随空白和
`git diff --check` 检查。
