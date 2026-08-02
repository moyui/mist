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

### 2. 单证券串行、跨证券并行

accepted snapshot 和到期 finalizer 使用相同 `securityId` keyed execution boundary。具体 queue
容量、超时和 shutdown 行为在实现前评审，不在本轮预设数值。

### 3. 量额使用 exact decimal 与统一 A 股单位

TDX/QMT 在各自边界验证 native 类型、精度和单位。A 股 `CanonicalRealtimeSnapshot`、open candle 和
sealed candle 的领域单位固定为 `volume=股`、`amount=人民币元`，并且只传规范十进制字符串或
`null`。aggregation/delta/reset 和单位缩放不使用 JavaScript `number`；OHLC 仍为有限数。

provider-native 与 Mist canonical 是两个明确阶段：

- QMT realtime `volume` 按官方股票 tick 契约为非负安全整数“手”，adapter 精确乘以 `100` 后输出
  股；`amount` 为非负有限 provider float“元”，adapter 只规范化 wire 上可观察到的值，不声称恢复
  provider 已丢失的十进制精度；
- TDX realtime `Volume/Amount` 必须保持 native decimal string。当前官方文档把 `Volume` 描述为
  “总手”，但仓库已有真实 runtime fixture 的 `Amount / Volume` 又表现为“股/元”，因此实施不得
  根据值动态猜测单位，也不得在 HIL 前写死未经证明的换算因子；
- TDX 目标 runtime 必须以固定 terminal/bridge identity、连续 snapshot 和同源 historical close
  对照，确认其 quantity profile 是“手/万元”还是“股/元”。确认后 adapter 使用唯一固定 profile：
  前者执行 `volume × 100`、`amount × 10000`，后者执行 identity；profile 变化视为破坏性 provider
  contract 变化，必须重新评审和 HIL；
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

上述“counter 没有更新”是本 change 的明确 V1 canonical 缺失语义；TDX/QMT 真实交易时段 HIL 必须
分别证明 native 缺字段/null 确实符合该假设。若真实 provider 会在有成交时遗漏 counter update，必须
暂停 `on` 并回到 provider/candle contract；策略投影层的 interval forward fill 不能用来掩盖错误 cumulative
counter 假设或把后续跳变量静默归入错误 bucket。

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
change 定义 scale/rounding 后再评估 `big.js` 等库。当前 app-local `k-decimal.util.ts` 只是待提取/
替换的实现候选，不能作为其他 app 的共享 API；最终共享 library 的目录和命名在实现 preflight 中
单独确认，market、strategy 和 realtime period builder 不得各自复制 parser/comparator。

### 4. Redis commit 与下游完全隔离

valid/discarded sealing 只提交 market state。未来 post-commit trigger 通过独立 port 接入；该 port
未安装时 candle 行为不变。

### 5. Realtime market state 按上海自然日日切

交易日 D 的 sealed/discarded、watermark、due 和 manifest 等 market-owned Redis keys 必须在写入时
设置统一的上海时间 D+1 00:00 绝对到期点。到期只作用于 market-data namespace；共享 endpoint 中
BullMQ 的 waiting/active/completed/failed keys 服从其 owning change，禁止 `FLUSHDB`、wildcard delete
或依赖 Redis key-expiration event 驱动业务逻辑。

Node latest snapshot 与 open-candle state 不需要午夜 timer。进程持续运行时，第一条属于新
tradingDay 的 accepted snapshot 在同一 per-security serialized boundary 内先丢弃旧日 mutable state，
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
- [Redis 故障导致状态不确定] → fail closed、暴露 degraded reason，不生成 guessed candle。
- [量额 provider 单位或 runtime profile 不清] → canonical 先固定股/元；使用固定 artifact、连续
  snapshot、`amountDelta/volumeDelta` 与同源 historical close HIL 证明 adapter profile，未确认的
  source/security 不得进入 candle productization。
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
4. shadow 完成双 source 支持交易时段、quantity profile、股/元换算及 historical seam 证据。
5. 用户审核 evidence 后决定是否切 on。
6. 回滚优先切 off，保留 Redis volume 和诊断证据。

## Open Questions

- TDX/QMT grace、hard horizon 和 memory/record limits 的具体值。
- restart 丢失 open state 时的 discard 粒度与 operator diagnostics。
- TDX 目标 runtime 的唯一 quantity profile，以及 QMT historical bar quantity profile 的 HIL 结果。
