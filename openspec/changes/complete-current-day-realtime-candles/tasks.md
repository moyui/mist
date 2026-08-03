## 1. Provider 与量额评审门禁

- [ ] 1.1 记录 TDX/QMT realtime quantity 的真实样本、单位、类型、缺失和异常分布。
  - [x] 1.1.1 确认 A 股 canonical quantity 固定为 `volume=股`、`amount=人民币元`；realtime provider
    adapter 在进入 canonical snapshot 前换算，MySQL `k` 不在本 change 迁移或回填。QMT realtime
    volume 按手精确乘 `100`、amount 保留 provider-float 可观察元值；TDX runtime profile 必须由
    固定 artifact 的交易时段 HIL 在“手/万元”与“股/元”之间证明，禁止运行时按值猜测。
- [x] 1.2 向项目负责人评审 canonical decimal grammar、precision/scale、TDX numeric rejection 和 QMT provider-float provenance。
  - [x] 1.2.1 确认内部统一使用 scale=8、与 `DECIMAL(36,8)` 同范围的 `Decimal8(bigint)`；V1 只允许
    parse/format/compare/add/subtract、经评审的非负整数单位缩放和范围检查，`×100/×10000` 只服务
    provider 单位换算；边界保持 decimal string/null，不引入第三方 decimal 库，不允许 raw bigint
    序列化，也不开放任意乘除/舍入。
  - [x] 1.2.2 确认可规范化的外部 decimal text 仅接受 `^[0-9]+(?:\.[0-9]{1,8})?$` ASCII 无符号
    fixed-point，无空白/sign/exponent/locale/省略位；先校验原始 scale 再去前导/尾随零，规范化后
    最多 28 位整数，
    `"001.2300" → "1.23"`，零唯一为 `"0"`。策略 create 可规范化一次；内部、持久化快照和 RPC/Redis
    只接受 canonical。provider-native grammar 仍待 1.1 的真实样本逐项确认。
  - [x] 1.2.3 确认所有获准外部 decimal text 在 regex/scale/bigint 前先限制为 37 个 ASCII 字符；该值
    直接来自 `DECIMAL(36,8)` 最长紧凑文本，超长前导零也拒绝。现有 HTTP 约 100 KiB body、datasource
    每 native object 64 KiB/depth 8、backend 1 MiB frame/256 entries 都只是整包防线，不能替代字段
    limit；QMT native number 不伪造 raw-text limit，adapter canonical 输出仍做相同范围检查。
- [x] 1.3 把接受的 quantity 规则写回 design/specs；未确认前不修改 producer、decoder 或 fixture。

## 2. Candle 语义评审门禁

- [x] 2.1 提交 A 股 bucket/session、baseline/delta、counter reset、乱序、午休、跨日和 restart 状态表。
  - [x] 2.1.1 确认 Node latest/open candle state 不使用午夜 timer；第一条新 tradingDay accepted
    snapshot 在 per-security serialized boundary 内先丢弃旧日 mutable state，再建立新日状态。
  - [x] 2.1.2 确认 volume/amount counter 独立维护：同日已有可信 baseline 时，snapshot 对应累计字段
    `null` 表示 counter 未更新，保持 baseline 且本次不增加 delta；显式相等 counter 产生零增量。尚无
    同日 baseline 时保持该字段不可用，不从零或昨日开始；OHLC 合法的 candle 可封存 quantity=null。
    candle owner 中的 carry-forward 只属于 snapshot cumulative state，封存时不能复制上一根 K 的区间量额；
    downstream strategy 投影层的同日 forward fill 由共享策略契约单独持有，不改写 Redis candle。真实 provider
    null/缺字段语义仍必须由 TDX/QMT 交易时段 HIL 证明，否则阻止 `on`。
  - [x] 2.1.3 确认 market-series identity 为 `(securityId,source)`，candle 再加入 `bucketStartMs`；Node
    state、量额 baseline、due/watermark/manifest 和 Redis key 全部隔离 source，`providerSymbol` 只作
    provenance。同日 source 切换不得继承旧来源状态。
- [x] 2.2 提交 valid/discarded、grace、hard horizon、due failure 和 shutdown 语义供项目负责人逐项确认。
  - [x] 2.2.1 确认 active listener 在完整 bucket 开始时注册 expected-bucket due；整分钟没有 snapshot
    时到期只写 discarded watermark，不伪造 K。中途新增且无 snapshot 从下一完整 bucket 开始，中途移除
    不取消已注册 due；重启不补造已经错过的理论分钟。
  - [x] 2.2.2 确认 V1 TDX/QMT 共用 `REALTIME_CANDLE_GRACE_MS=5000`，有效范围 `1000..30000`，scanner
    固定每秒；rollover 不提前封存，按完整 candle identity 保留 current + prior grace-pending。Redis
    commit 成功前不删除 candidate/推进 baseline/触发下游，失败幂等重试至固定
    `bucketEndMs + 60000ms` hard horizon；到期记录 `finalization_horizon_exceeded`，不得伪造 discarded。
  - [x] 2.2.3 确认 shutdown 只停止 scanner/registration/new acceptance 并对已 admission task 作一次
    bounded best-effort drain，不强制封存、删 due 或发事件；restart 只处理 current-day exact 证据，
    terminal+stale due 幂等清理且不重复 trigger，due+lost Node state 写
    `backend_restart_open_state_lost` discarded，无 due/terminal 只记 recovery gap；当前半分钟不生成有效 K，
    下一完整 bucket 恢复。
- [x] 2.3 提交 Node queue/memory、Redis record/retention/command/capacity limits 候选值与测量方式并确认。
  - [x] 2.3.1 确认交易日 D 的 market-owned Redis sealed/discarded、watermark、due 和 manifest keys
    统一在上海时间 D+1 00:00 到期；不保留 72h realtime K，不使用 broad cleanup，也不影响共享
    endpoint 中由 realtime strategy change 持有的 BullMQ keys。
  - [x] 2.3.2 确认 active series 最多 10；Node 不另设 candle-count cap，结构上最多 10 latest、20 个
    current/prior candidate。queue per-series/global pending 默认 `8/256`、范围 `1..256/16..4096` 且由
    `libs/config` 验证 global>=per-series；snapshot overflow 使 candle fail closed，due/finalizer overflow
    只保留 due 重试。
  - [x] 2.3.3 确认 due/startup Redis range command 固定 batch 64；sealed/due/manifest UTF-8 上限分别
    `2048/128/1024` bytes，超限是 infrastructure failure。Redis 使用 AOF/noeviction，不设业务 record
    count，shadow 观测 queue、due lag、record bytes、used memory、AOF 和增长趋势。
- [x] 2.4 将全部接受结论写回 design/specs 后，才开始 candle 实现。

## 3. Exact Decimal 与 Canonical Contract

- [x] 3.1 在 pure `libs/decimal`（project `decimal`、import `@app/decimal`）中实现 `Decimal8`：以原生
  `bigint` 保存 scale=8 定点值，提供
  parse/format/compare/add/subtract 和受限非负整数单位缩放，强制 `DECIMAL(36,8)` 输入与结果范围；
  只允许 provider profile 的 `×100/×10000`，不提供任意乘除/舍入，不新增
  third-party decimal dependency。实现独立 external-text normalize 与 strict canonical parse；原始
  scale 必须在裁剪尾随零前检查，并覆盖 whitespace/sign/exponent/locale/Unicode/省略位/负零测试。
- [ ] 3.2 更新 canonical snapshot quantity 类型及 TDX/QMT provider-specific converters；canonical
  输出统一为股/元，缺失/null 与非法已出现值分流，非 A 股 STOCK 不套用股票换算因子。
- [ ] 3.3 同步 OpenAPI、negative tests、四仓 fixture 和 SHA sidecars。
- [ ] 3.4 将 app-local `k-decimal.util.ts` 的合法消费者迁移到共享 primitive，并证明 candle、strategy
  evaluator 与 period builder 不存在重复 parser/comparator；检索并拒绝量额路径中的 `Number(...)`、
  `String(number)`、`BigInt(number)`、raw bigint JSON 和隐式 number/bigint 混算；修复现有 utility
  先裁剪尾随零再检查 scale、接受 trim/sign 以及 number compatibility 的契约偏差。

## 4. Node Candle 与 Redis Seal

- [ ] 4.1 实现可注入 Clock、session bucket resolver 和 per-market-series bounded execution chain；在
  `libs/config` 增加并校验 queue per-series/global pending，证明 global>=per-series。
- [ ] 4.2 实现按 `(securityId,source)` 隔离且按完整 candle identity 定位的 current + prior
  grace-pending candle aggregator、volume/amount 独立
  baseline/delta/reset、同日 null-counter hold、
  无 baseline 的 sealed null、乱序和 capacity fail-closed；覆盖 candle owner 不得跨日继承 cumulative
  baseline，也不得在 sealing 时用前一根 K 覆盖 raw null；rollover 不提交 prior bucket，跨 bucket
  late frame 不得回滚 current bucket。
- [ ] 4.3 实现 snapshot-driven 与 active-listener expected-bucket due registration/scanner、valid/discarded
  finalizer 和 atomic Redis state transition；覆盖完全无 snapshot、listener 中途增删与 restart gap；
  finalizer 必须精确匹配 due bucket，commit 失败保留 immutable candidate 并按秒重试，hard horizon 到期
  只记录基础设施 gap，不写 discarded 或 post-commit trigger；due/replay Redis command 固定 batch 64，
  禁止 unlimited range/KEYS/wildcard scan，并检查 sealed/due/manifest byte bounds。
- [ ] 4.4 实现 bounded manifest replay、上海 D+1 00:00 exact-key expiry、Node trading-day rollover 和
  restart/open-state diagnostics；证明 Redis/manifest identity 包含 securityId/source、不含 providerSymbol，
  prior-day/other-source state 不被读取且 BullMQ namespace 不受影响；覆盖 terminal+stale due、
  due+restart loss、无证据 recovery gap 和 mid-bucket restart。
- [ ] 4.5 将可失败隔离的 candle sink 接到 latest-memory acceptance 之后，证明无策略或 MySQL 副作用。
- [ ] 4.6 实现简单 shutdown 顺序：停止 scanner/registration/new task，按现有 Redis command timeout
  best-effort drain admitted queue，再断开 owned Redis；不得 force-seal、删 unfinished due 或增加专用
  shutdown 配置/事件。

## 5. 部署、监控与验收

- [ ] 5.1 完成共享 realtime Redis Compose/env/health/startup contract，启用 AOF/noeviction，配置 queue
  limits 且模式保持 off。
- [ ] 5.2 完成 candle/Redis/grace/discard/capacity/recovery monitoring 与低基数 tests。
- [ ] 5.3 运行受影响仓库完整基线、strict OpenSpec、fixture SHA 和 `git diff --check`。
- [ ] 5.4 以 shadow 完成 TDX/QMT 支持交易时段、restart/AOF、capacity 和 protected-table 零写入 HIL；
  固定 terminal/bridge identity，连续记录 snapshot，用规范化后的 `amountDelta/volumeDelta` 与同期
  price range、收盘同源 historical K 对照，证明唯一 quantity profile、股/元结果和 provider-float
  provenance。任一 source 未证明前不得切 `on`。
- [ ] 5.5 向项目负责人逐项审阅 HIL 与 limit 校准结果；未接受前不得切 on 或归档。
