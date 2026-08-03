## Context

schema-v2 native-map realtime transport 已把 TDX/QMT 数据转换为
`CanonicalRealtimeSnapshot`，ingress 当前以 latest-memory 为正式边界。市场数据 Redis 已进入
Compose，但 candle 闭环、精确量额、grace、due scanning、恢复和 HIL 尚未形成独立可验收能力。

## Goals / Non-Goals

**Goals:**

- 形成 `accepted snapshot → bounded Node open candle → sealed/discarded 1m → market Redis`。
- 保持 market sealing 不依赖 strategy、MySQL 或 notification。
- 固化量额 exact-decimal、security identity、资源上限和恢复观测。

**Non-Goals:**

- 不创建策略 trigger 或 queue，不读取策略定义，不写 Signal/AlertEvent。
- 不提供公共冷热 K 查询，不把 Redis candle 写入 MySQL。
- 不派生 5/15/30/60m，不持久化 Chan。

## Decisions

### 1. Node 持有 mutable open state，Redis 持有 sealed state

latest snapshot 和相邻 open bucket 保持有界 Node memory；Redis 只保存 sealed/discarded 结果、
watermark、due 和 manifest。该边界避免把高频 mutable snapshot 复制到 Redis。

### 2. 单 market series 串行、跨 series 并行

market-series identity 固定为 `(securityId,source)`，candle identity 固定为
`(securityId,source,bucketStartMs)`。accepted snapshot、expected-bucket due 和到期 finalizer 使用相同
`(securityId,source)` keyed execution boundary；不同 series 可以并行。Node latest/open state、volume 与
amount 独立 cumulative baseline、watermark、due、manifest 和所有 market Redis keys 都必须包含 source
维度，不允许同日 source 切换继承另一来源的 mutable/counter/terminal state。

canonical security identity 仍是 `securityId`，`source` 是市场序列维度和 provenance；
`providerSymbol` 只用于受控诊断/adapter provenance，禁止进入 Node/Redis identity、任何 Redis key、
jobId 或下游业务 identity。当前 allowlist 可以继续禁止同一 securityId 同时双源订阅，但该限制不能
作为省略 source 隔离的理由。

due 不是只有 open candle 出现后才注册。对每个在 1m bucket 开始时位于 active listener inventory 的
`(securityId,source)`，candle foundation 必须注册 `bucketEnd + grace` due；到期时有合法 open candle
则 sealed，有 open 但证据不足或完全没有 open candle 都提交 discarded watermark。理论空分钟的
discarded 只证明监听期间该 bucket 已终结且没有可用 K，不包含或伪造 OHLC、量额、价格。

listener 在分钟中途才新增且尚无 snapshot 时，不倒推当前或此前理论缺口，从下一个完整 bucket 开始
注册；若中途已有 accepted snapshot，则沿用普通 snapshot-driven current-bucket 聚合。bucket 开始时已
注册的 due 在 listener 中途移除后仍完成当前 bucket 终态，避免留下悬空 window。进程重启只从可恢复
current state 与后续 bucket 继续，不补造重启期间已错过的理论分钟，并记录 bounded recovery gap。
该 expected-bucket due 只属于 market foundation，不能依赖 strategy mode、Signal worker 或 queue。

V1 对 TDX/QMT 使用同一个 `REALTIME_CANDLE_GRACE_MS`，默认 `5000`，只接受 `1000..30000` 的整数；
不在没有 HIL 证据时增加 source-specific grace。due scanner 固定每 `1000ms` 扫描一次，不增加第二个
扫描频率配置。grace cutoff 固定为 `bucketEndMs + graceMs`：acceptedAt 晚于 cutoff 的 snapshot 不能
再修改该 candle。

bucket rollover 只负责把上一 bucket 移入 grace-pending 状态并打开下一 bucket，不得提交上一 bucket，
也不得漏登新 bucket 的 due。由于最大 grace 小于一分钟，每个 market series 的正常内存状态最多包含
当前 bucket 和一个上一 bucket；上一 bucket 在 cutoff 前仍可接收属于自身 identity 的合法 snapshot，
到 cutoff 后冻结。snapshot、due 与 finalizer 始终按完整
`(securityId,source,bucketStartMs)` 定位，禁止 due 通过“当前 series bucket”误取另一个分钟。

Redis terminal commit 成功前不得删除冻结 candidate、推进可信 baseline 或发出 post-commit trigger。
原子提交失败时，due scanner 每秒对同一 immutable candidate 幂等重试，hard horizon 固定为
`bucketEndMs + 60000ms`。到 hard horizon 仍未提交时释放该 candidate，暴露
`finalization_horizon_exceeded` 健康异常并保留市场缺口；不得把基础设施失败伪装成 discarded，也不
触发策略。实际无 snapshot、证据本身不合法或已知 restart open-state loss 才可以按对应 market reason
提交 discarded。

shutdown 不增加专用协议或配置。candle owner 先停止 due scanner、expected-bucket registration 与新
candle task acceptance，再让已进入 keyed queue 的任务受现有 Redis `3000ms` command timeout 约束尽力
排空，最后才断开 owned Redis client；进程终止期限可以截断排空。shutdown 不强制封存或删除
open/grace-pending candidate，不删除未完成 due，也不产生专用 terminal/trigger，避免把截断的一分钟
伪装为完整 K。

restart 只回放 bounded current-day due/terminal 证据：terminal 已存在而 due 残留时幂等清理 stale due，
不重复发出 post-commit trigger；due 存在、terminal 不存在且 Node open state 已丢失时，提交不含 OHLC/
quantity 的 `backend_restart_open_state_lost` discarded；due 与 terminal 均不存在的 elapsed bucket 只记
recovery gap，不补造 terminal。若重启发生在当前 bucket 中间，已登记 bucket 按 open-state loss
discarded，latest snapshot 仍可更新，但有效 candle aggregation 从下一完整 bucket 恢复。Signal owning
change 的 bounded startup compensation 负责发现已提交 terminal，B1 不实现第二套下游 replay。

当前 TDX/QMT allowlist 各自最多 5 个 entry，并禁止同一 securityId 同时双源，因此 V1 active market
series 上限为 10。Node 不增加脱离 inventory 的 candle-count 配置；正常最多持有 10 份 latest、20 个
current/prior candidate 以及每 series 的固定 baseline/due metadata。提高 provider allowlist 上限必须先
重新评审该容量推导。

keyed execution queue 的限制由 `libs/config` 持有：

- `REALTIME_CANDLE_QUEUE_MAX_PENDING_PER_SERIES` 默认 `8`，整数范围 `1..256`；
- `REALTIME_CANDLE_QUEUE_MAX_PENDING_GLOBAL` 默认 `256`，整数范围 `16..4096`，并且不得小于 per-series
  值。

snapshot admission overflow 必须使 matching candidate 进入 `queue_overflow` market-evidence discard
路径；尚无 candidate 时保留低基数诊断并由已登记 expected due 产生 no-valid-candle discard。due/finalizer
task admission overflow 不得污染 candle evidence或伪造 discard；due 保持未完成并在下一次 scanner
重试，最终仍受 hard horizon 约束。

due scan 和 current-day startup replay 的单次 Redis range command 固定最多返回 64 个 member；不得使用
无 `LIMIT` 的全量 `ZRANGEBYSCORE`、`KEYS` 或 wildcard scan。canonical Redis writer 在提交前强制
UTF-8 byte bounds：sealed candle JSON `<=2048`、due member `<=128`、manifest payload `<=1024`。
超限表示内部 serialization/contract failure，进入 degraded/hard-horizon 路径，不得伪装成 market
discard。

Redis 不增加业务 record-count cutoff 或 eviction。Compose 明确使用 AOF 与
`maxmemory-policy noeviction`；OOM/command failure 按已有 finalization failure 处理。以 10 个 series、每个
交易日 240 个 1m bucket 和 2048-byte closed payload 上限计算，closed JSON 上界约为 4.7 MiB/day；
Redis object overhead、discard/watermark/manifest、AOF 和共享 BullMQ 占用不靠该估算豁免，必须在
shadow/HIL 中观测 used memory、AOF size、due lag、record bytes 和增长趋势。

### 3. 量额使用 exact decimal 与统一 A 股单位

TDX/QMT 在各自边界验证 native 类型、精度和单位。A 股 `CanonicalRealtimeSnapshot`、open candle 和
sealed candle 的领域单位固定为 `volume=股`、`amount=人民币元`，并且只传规范十进制字符串或
`null`。aggregation/delta/reset 和单位缩放不使用 JavaScript `number`；OHLC 仍为有限数。

provider-native 与 Mist canonical 是两个明确阶段：

- QMT realtime `volume` 按官方股票 tick 契约为非负安全整数“手”，adapter 精确乘以 `100` 后输出
  股；`amount` 为非负有限 provider float“元”，adapter 只规范化 wire 上可观察到的值，不声称恢复
  provider 已丢失的十进制精度；
- TDX realtime `Volume/Amount` 必须保持 native decimal string。2026-07-23 production promotion 的
  pinned `mist-tdx-bridge-v1.1` artifact 已证明目标 runtime profile 为“手/万元”：同一 snapshot 的
  `Average="28.44"`、`Volume="576508"`、`Amount="163965.55"`，按 `volume × 100` 股和
  `amount × 10000` 元换算后的累计均价与 `Average` 一致。adapter 因此固定执行这两个精确缩放；禁止
  运行时按值猜测或在不同 snapshot 间切换 profile；
- 仓库内 2026-06-29 的旧 external-HTTP fixture 来自不同 artifact/入口且表现为“股/元”，只保留为
  历史事实，不能覆盖当前 pinned production runtime contract。未来 bridge/runtime identity 变化时，
  quantity profile 必须重新走 HIL 和 reviewed OpenSpec delta；
- 本 change 不修改或回填 MySQL `k.volume/amount`。historical provider-native unit 到统一
  `StrategyBar` 股/元的转换由 backtest/realtime market-data reader owning changes 持有。

单位不作为每条 snapshot/candle 的可变字段传输。`source` 与固定 adapter contract 足以表达 precision
provenance；同一 source/runtime 不允许混用多个 quantity profile。V1 只承诺 A 股
`SecurityType.STOCK` 的股/元量额语义；其他证券类型不得借用股票换算因子进入 candle productization。

`volume` 与 `amount` 的累计 counter、baseline、delta 和可用性必须分别维护，不能要求两者同时出现：

- 同一 tradingDay 已存在该字段的可信 cumulative baseline 时，后续 accepted snapshot 对应字段为
  `null` 表示该 counter 没有更新；聚合器保持上一个 cumulative value，本次对该字段不增加 delta，
  不能把 raw `null` 直接转换成 decimal zero；
- 当前 non-null cumulative 与 baseline 相等时同样产生明确的零增量；后续 non-null cumulative 大于
  baseline 时只对差值做精确累加，小于 baseline 时仍按 counter-reset contract fail closed；
- 当前 tradingDay 尚未建立该字段的可信 baseline 时，`null` 不能被解释为从零开始，也不能继承前一
  tradingDay。该 candle 的对应 quantity evidence 保持不可用，并允许在 OHLC 等必需证据合法时以
  sealed `null` 保存；另一 quantity 字段按自身证据独立决定；
- 这种 forward hold 只存在于 snapshot → candle 的 cumulative counter state。sealed/history K 的
  `volume/amount` 仍是单个区间的 raw delta/fact，candle owner 必须保留当前 `null` 而不复制前一根 K。
  共享策略契约后续可以在不改写 raw K 的独立 projection 层按同交易日向前填充；该 downstream
  policy 不属于 candle aggregation，也不得被表述为 cumulative counter 未变化。显式 canonical `"0"` 始终是已
  确认的零区间量额。

上述“counter 没有更新”是本 change 的明确 V1 canonical 缺失语义。已有正常路径 evidence 足以实现
adapter；当前未自然出现的缺字段/null/非法分布由 deterministic negative tests 覆盖，并登记到
`capture-realtime-provider-anomalies` 的 dormant incident gate，不作为实现阻塞。最终 shadow/HIL 继续
观测真实缺失与跳变；若 provider 会在有成交时遗漏 counter update，必须暂停 `on` 并通过 reviewed
OpenSpec delta 修正 provider/candle contract。策略投影层的 interval forward fill 不能掩盖错误
cumulative counter 假设或把后续跳变量静默归入错误 bucket。

外部 decimal text 与 canonical decimal string 是两个阶段。允许执行规范化的边界输入仅接受
`^[0-9]+(?:\.[0-9]{1,8})?$` 形式的 ASCII 无符号 fixed-point 文本，不接受空白、`+`、`-`、指数、
省略整数/小数位、locale 分隔符或 Unicode 数字。边界必须先检查原始小数位不超过 8，再去除整数
前导零和小数尾随零，因此 `"001.2300" → "1.23"`、`"0.00000000" → "0"`，而
`"1.230000000"` 即使多余位全为零也必须拒绝。canonical 输出只有唯一紧凑表示：零为 `"0"`，非零
整数无前导零，小数存在时最后一位必须非零，规范化后最多 28 位整数。所有获准执行规范化的外部
decimal text 在 grammar、scale 校验和 bigint 构造前都必须先通过 `raw.length <= 37` 的 ASCII 字符
上限；37 直接来自 `DECIMAL(36,8)` 的最长紧凑文本，即 28 位整数、一个小数点和 8 位小数。超过
37 字符即使只包含可去除的前导零也拒绝。HTTP body、datasource native object 和 backend WebSocket
frame 的整包上限继续作为独立防线，不能替代字段上限。QMT native quantity 是 provider number，
因此不伪造 raw-text limit；其 adapter 输出仍必须落入同一 canonical 范围和最长 37 字符。

策略 create DTO 可以执行上述一次性规范化；持久化 rule、load/enable/realtime registration、Redis、
RPC domain payload 和 context snapshot 只接受 canonical 结果。MySQL `DECIMAL(36,8)` driver readback
可能返回固定 scale 文本，例如 `"1.00000000"`，必须由 owning persistence mapper 在构造 canonical
bar 前一次性规范化，不能要求 evaluator 或其他消费者兼容多种表示。provider-native string 是否符合
该输入 grammar 仍由各 provider 的真实样本和 adapter contract 决定，不能用共享 normalizer 猜测。

本 change 持有共享 `Decimal8` value primitive：内部使用原生 `bigint` 保存乘以 `10^8` 后的定点整数，
有效范围必须与 MySQL `DECIMAL(36,8)` 一致，即最多 28 位整数和 8 位小数。V1 只提供 canonical
decimal string 的 parse/format、compare、add、subtract、经评审的非负整数单位缩放和结果范围检查；
counter reset/zero detection 使用 compare 表达。每次 add/subtract/整数缩放后必须先检查范围，再格式化
或持久化。单位缩放只服务 provider adapter 的 `×100`、`×10000`，不开放任意策略数学表达式。

`Decimal8` 只能存在于进程内计算边界。通过输入规范化后的 JSON/HTTP、RPC domain payload、Redis、
canonical persistence mapping、rule/context snapshot 继续使用规范十进制字符串或 `null`，raw
`bigint` 不得进入序列化对象；`null` 不进入 `Decimal8`，也不直接等价于 decimal zero。只有已存在
可信 cumulative baseline 时，snapshot counter 的 `null` 才按上述 contract 表示“未更新”，并使本次
delta 保持不变。禁止通过 `Number`、`String(number)`、`BigInt(number)` 或隐式混合
`number`/`bigint` 完成量额转换，也不修改 `BigInt.prototype.toJSON` 或安装通用 JSON replacer/reviver。

原生 bigint/Decimal8 数学值可以有符号，但 `volume`、`amount` 及其策略阈值的领域边界只接受非负值。
cumulative counter 必须先 compare：当前值小于 baseline 时走 reset 分支，不能先产生负 delta 再补零；
任何准备写入 quantity boundary 的负结果均 fail closed，`-0` 也不是合法输入。

V1 除上述精确非负整数单位缩放外，不提供任意 multiplication、division、average、ratio 或 rounding，
因此不引入 decimal third-party dependency。未来 VWAP、比例或其他需要舍入策略的计算必须由 focused
change 定义 scale/rounding 后再评估 `big.js` 等库。当前 app-local `k-decimal.util.ts` 只是待替换的
实现候选，不能作为其他 app 的共享 API。实现 preflight 已确认共享 primitive 位于 pure
`libs/decimal`、Nest project `decimal`，且只通过精确 alias `@app/decimal` 导入；该 library 不提供 Nest
module，不导入 TypeORM、Redis、HTTP、env 或其他 Mist application/library。market、strategy 和 realtime
period builder 不得各自复制 parser/comparator。

### 4. Redis commit 与下游完全隔离

valid/discarded sealing 只提交 market state。未来 post-commit trigger 通过独立 port 接入；该 port
未安装时 candle 行为不变。

### 5. Realtime market state 按上海自然日日切

交易日 D 的 sealed/discarded、watermark、due 和 manifest 等 market-owned Redis keys 必须在写入时
设置统一的上海时间 D+1 00:00 绝对到期点。到期只作用于 market-data namespace；共享 endpoint 中
BullMQ 的 waiting/active/completed/failed keys 服从其 owning change，禁止 `FLUSHDB`、wildcard delete
或依赖 Redis key-expiration event 驱动业务逻辑。

Node latest snapshot 与 open-candle state 不需要午夜 timer。进程持续运行时，第一条属于新
tradingDay 的 accepted snapshot 在同一 per-market-series serialized boundary 内先丢弃旧日 mutable state，
再建立新日状态；进程重启天然从空内存开始。没有新交易日 snapshot 时，旧对象可以暂时占据内存，
但不得再被读取或更新，下一次有效输入必须先完成日切换代。

Redis 到期后，昨日 realtime K 不再承担历史、恢复或审计职责。下一交易日需要的 historical K 只
能来自 MySQL provider history；缺失时由下游 `insufficient_history` 处理，不能延长 Redis TTL 或跨日
fallback。BullMQ 跨日 waiting job 由 realtime strategy change 判定过期，不依赖昨日 candle 存活。

### 6. 模式与 HIL 分层

`off` 保持 memory-only；`shadow` 写入隔离 Redis 以校准 grace/capacity；`on` 仅在自动化、双 source
交易时段 HIL、restart/AOF recovery 和 rollback evidence 全部通过后启用。

## Risks / Trade-offs

- [grace 过短丢弃迟到数据] → 先 shadow 采样并经用户确认具体值。
- [Redis 故障导致状态不确定] → candidate 在固定 hard horizon 内按 exact identity 幂等重试；到期
  fail closed、暴露 `finalization_horizon_exceeded`，不生成 guessed/discarded candle。
- [bridge/runtime 变化导致量额 profile 漂移] → 当前 adapter 固定使用已接受的 production artifact
  profile；部署 identity 变化后以 shadow/HIL 重新校验，禁止运行时猜测或自动切换。
- [内存或 Redis 无界增长] → 所有 collection、record、retention 和 command 都必须有硬上限。
- [共享 Redis 日切误删 BullMQ] → 只使用 market-owned exact keys 与各 key 的绝对到期点，禁止
  database-wide、prefix-wide 或 wildcard cleanup。
- [单位缩放或新增乘除导致溢出/截断] → `×100/×10000` 使用 Decimal8 精确整数缩放并逐次范围检查；
  V1 仍禁止任意乘除、平均、比率和舍入，需要时通过新 change 明确 scale、rounding 和 library 选择。
- [bigint 直接进入 JSON 导致序列化失败或产生隐式兼容] → 所有边界先 format 为 canonical string，
  并用 boundary tests 拒绝 raw bigint。

## Migration Plan

1. 逐项评审 exact-decimal、identity、bucket、grace、discard 和 capacity。
2. 以 mode off 完成代码与跨仓契约。
3. 部署 market Redis，保持 mode off。
4. shadow 复核双 source quantity profile、股/元换算、真实缺失分布及 historical seam 证据。
5. 用户审核 evidence 后决定是否切 on。
6. 回滚优先切 off，保留 Redis volume 和诊断证据。

## Open Questions

- 无实现前置问题。QMT historical bar 的 reader 单位转换仍由其 owning change 评审，不属于本 change。
