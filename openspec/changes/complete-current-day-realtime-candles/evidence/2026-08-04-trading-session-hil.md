# 2026-08-04 交易时段 shadow HIL

## 结论

本轮在 A 股上午及下午交易时段完成了最终候选版本部署、双 source 只读预检和 datasource WebSocket
手动订阅验证。最终 backend `3503b25143324f5520541bab657ad7d8b6d158af` 已由 deploy run
`30884565901` 以 `shadow` 完整健康部署；模式没有切 `on`。

- QMT run `30882148246` 返回合法 native/canonical snapshot，实时量额 profile 复核通过；此前 Redis
  中也观察到 QMT exact closed 分区，但 full HIL 没有在 baseline 之后证明目标标的新增 exact sealed
  field，不能用进程级 `sealedTotal` 或其他标的 key 代替。
- TDX 改用 `capturedAt` 后，run `30885030432` 返回合法 native/canonical snapshot，并在 backend
  diagnostics 中观察到 target `seriesCount=1`、`candidateCount=1`，不再卡在 event-time。该 run 等待两根
  target exact sealed candle 超时，未进入 restart/AOF 和后续门禁。只读 run `30885813279` 枚举到目标
  closed key，但 exact `HGETALL` 为空，因此 key 存在也不能算 sealed-record 证明。

因此手动订阅清理与双 source canonical/candidate 子门禁 5.4.1 已完成，父任务 5.4 仍未通过。目标标的
exact sealed record、受控 restart/AOF、非零 historical quantity profile 和最终 protected-table post
digest 必须保留为下一个真实交易窗口/收盘后门禁。生产继续保持 `shadow`，不得切 `on`。

## 收盘前最终 TDX 候选复验

- backend：`3503b25143324f5520541bab657ad7d8b6d158af`，包含 TDX `capturedAt` event-time 修复；
  datasource：`e2094dd5ec527f18487b746549d875795f174520`；monitoring：
  `881e593de6374e16329e446ca5694fb7aadece3e`。
- 部署 run `30884565901` 完整健康通过。部署时发现 monitoring 可变 `latest` 只做本地 inspect、不主动
  pull，曾误用旧镜像；最终固定 immutable tag `sha-881e593` 后通过。该部署问题不改变 candle 数据结论。
- run `30884701054`：手动 subscribe/canonical 通过，但验收脚本在盘中错误强制要求 completed
  historical bar；harness 后续改为“接口失败仍失败、盘中无 completed bar 记录 deferred”。
- run `30885030432`：14:44:30 subscribe passed，14:50:21 finally unsubscribe passed；native
  `Volume="1139801"`、`Amount="320452.16"`，没有 provider time；canonical
  `eventTime=capturedAt="2026-08-04T14:44:37+08:00"`、`cumulativeVolume="113980100"`、
  `cumulativeAmount="3204521600"`、`aggregationEligible=true`。target candidate 已观察，未观察 quantity
  rejection；historical 记录为 `available=false, unavailableReason="no_completed_bar"`。
- run `30885813279` 是不建立订阅、不重启的只读 preflight。它证明 exact key 枚举逻辑能定位
  `mist:realtime:v1:day:20260804:tdx:9:candle:1m:closed`，同时证明该 Hash 当时没有 field；不得把该结果
  写成 target candle 已封存。

## 真实样本离线回放

为避免下一交易日前阻塞代码验证，commit `466ac84` 固化了两个已脱敏真实样本：TDX run
`30885030432` 与 QMT run `30882148246`。Jest 自动化逐个回放
`schema-v2 wire -> provider decoder -> canonical snapshot -> ingress -> OpenCandleAggregator ->
CandleFinalizer Redis MULTI commands`，并验证：

- TDX `eventTime` 精确等于 envelope `capturedAt`；QMT `eventTime` 精确来自一致的 native
  `time/stime`。
- TDX `手/万元` 与 QMT `手/元` 分别生成预期的 canonical 股/元十进制字符串。
- 同一 wire frame 重复回放得到 `duplicate_or_late`，不会二次修改 candle。
- 单样本没有同日上一 committed baseline，所以首根区间 `v/a=null`；closing cumulative `cv/ca` 仍按
  真实值进入 compact sealed record。这是契约预期，不伪造一分钟 delta。

该自动化只证明确定性代码路径，不连接真实 Redis，也不证明 terminal ownership、真实订阅生命周期、
AOF 重启恢复、目标 exact Hash 可见性、历史对账或 protected-table post digest。上述门禁仍归 task 5.4。

## TDX event-time 评审决策与较早运行结果

项目负责人根据同一 TDX native 样本确认：当前 runtime 没有可读取的 provider business-time 字段，
V1 接受 datasource capture-time 口径。backend commit `fe6f989` 已删除 TDX native `AsOf` 读取，固定把
schema-v2 decoder 已校验的 `capturedAt` 映射为 canonical `eventTime`；QMT native time 规则不变。

该提交随后已按上文最终候选完成部署并证明 canonical/candidate。下文 `f545c72`、`eventTime=null` 和
“无 candidate”仍是修复前生产运行的真实历史结果，不能改写成通过；sealed candle、restart/AOF 和
protected-table post digest 仍必须由后续真实 HIL 完成。

这些较早失败不是 quantity rejection：所有下午运行均为 `quantityProfileRejections=[]`，Redis AOF 为
enabled、last write `ok`，策略表没有因 shadow 流程写入。TDX provider-time 缺失已由最终候选采用
`capturedAt` 解决；当前剩余阻塞是双 source 目标标的 baseline 后 exact sealed 证明，以及尚未执行的完整
restart/AOF/historical/protected-table 后置门禁。

## 较早的下午手动订阅与 provider 数据证据

### 固定候选与部署

- backend 修复候选：`f545c72ca613e23634e1da4aec1d64758c6bba58`；只读取 datasource 正式
  `AsOf`，不接受测试遗留 `DateTime`，也不使用 `capturedAt` 或当前时钟补 event time。
- datasource：`e2094dd5ec527f18487b746549d875795f174520`。
- monitoring：`881e593de6374e16329e446ca5694fb7aadece3e`。
- shadow 部署：run `30881518215`，成功；未执行 migration，完整 health check 通过。
- QMT runtime：build `mist-qmt-realtime-bridge-v2.0`，artifact `unavailable`，runtime fingerprint
  `2c616197455b1a5009fcb21c248c099f64d3e9fc69362c745cebbd5728397f9d`。
- TDX runtime：build `mist-tdx-realtime-bridge-v2.1`，installed artifact SHA-256
  `750cabf97c5812423987cab70c25d385976b6edf1bad6419cf30a1bb1ddfce51`。

### QMT snapshot/profile（通过）

- snapshot-only run：`30882148246`，`result=snapshot-evidence-passed`。
- identity：`securityId=1`、`600519.SH`。
- 手动 subscribe：13:54:41 Asia/Shanghai，`result=passed`；finally unsubscribe：13:55:02，
  `result=passed`。
- native：`time=1785822889000`、`stime="20260804135449.000"`、`volume=28204`、
  `amount=3773928400`。
- canonical：`eventTime="2026-08-04T05:54:49.000Z"`、`cumulativeVolume="2820400"`、
  `cumulativeAmount="3773928400"`、`aggregationEligible=true`。
- 换算复核：`28204 × 100 = 2820400` 股；amount 保留 provider float 可观察元值。该结果与
  2026-08-03 pinned `手/元` profile 一致。
- datasource historical 只读请求成功，但 13:53–13:55 返回 provider fill 的固定价格与
  `volume="0"`、`amount="0"`；零值不能证明非零 historical reader profile，故 historical 门禁仍未完成。

QMT full runs `30880876697`（`300502.SZ`）和 `30881191518`（`600519.SH`）均成功经过
subscribe → canonical，并在 finally 成功 unsubscribe；进程级诊断在等待期封存了 3 根 candle、due 无
失败且无 horizon exceed。只读 preflight `30881808259` 进一步证明 Redis 中存在
`qmt:1`、`qmt:4` 的 exact closed/watermark/manifest keys。不过 full run 的 baseline 之后没有出现目标
exact key 的新 field，不能用别的标的的进程级 `sealedTotal` 冒充目标标的闭环。

### TDX snapshot/profile 与 event-time 阻塞

- native evidence run：`30881943989`。
- identity：`securityId=9`、`600030.SH`。
- 手动 subscribe：13:50:58 Asia/Shanghai，`result=passed`；finally unsubscribe：13:51:22，
  `result=passed`。
- native：`Volume="901517"`、`Amount="253641.50"`；native keys 共 26 个，其中没有 `AsOf`、
  `DateTime` 或其他 provider business time。
- canonical：`cumulativeVolume="90151700"`、`cumulativeAmount="2536415000"`；精确满足
  `Volume × 100`、`Amount × 10000`，复核当前 production runtime 为 `手/万元`。
- canonical `eventTime=null`、`aggregationEligible=false`；backend 不得使用 envelope
  `capturedAt="2026-08-04T13:51:07+08:00"` 冒充 provider event time。因此 TDX 本轮没有合法 candidate
  或 closed candle，这是已确认的 provider-time 门禁，不是 decoder alias 或 quantity failure。

### 订阅清理

本轮所有手动订阅都在 `finally` 清理，未把 HIL 编排留在产品启动路径：

- QMT `300502.SZ`：run `30880876697`，13:34:21 unsubscribe passed。
- QMT `600519.SH`：run `30881191518`，13:40:22 unsubscribe passed；run `30882148246`，
  13:55:02 unsubscribe passed。
- TDX `600030.SH`：run `30881943989`，13:51:22 unsubscribe passed。

旧单条 probe workflow、`TDX_SUBSCRIBE_ALLOWLIST_ON_READY` 及其 deploy 配置已经删除；生产 backend
authoritative `sync_subscriptions` 缺口仍归独立 subscription-lifecycle change，不由本 HIL 偷渡修复。

## 固定候选与运行身份

- deploy contract：`c1a803ff895bdb40ffa4e1adf4c557b8e4a64f14`
- backend：`21b46d3ce6a39e05dd7aee100bf2ee94e55278fe`
- datasource：`e2094dd5ec527f18487b746549d875795f174520`
- monitoring：`881e593de6374e16329e446ca5694fb7aadece3e`
- 成功部署 run：`30872115915`
- 模式：`shadow`；Redis AOF enabled、last write `ok`、`noeviction`
- TDX：build `mist-tdx-realtime-bridge-v2.1`，installed/runtime artifact SHA-256 `750cabf97c5812423987cab70c25d385976b6edf1bad6419cf30a1bb1ddfce51`
- QMT：build `mist-qmt-realtime-bridge-v2.0`，artifact disposition `unavailable`，本轮 runtime fingerprint `55d14d2377c2d8701cbf95a212b9d6f2e198c5a7dc3b1fbf5433d156ce7da652`
- terminal artifact 只读检查 run：`30870745531`

## 通过的门禁

- TDX preflight：run `30872226421`，通过 exact images、bridge identity、backend transport/allowlist、shadow health 和 monitoring mode。
- QMT preflight：run `30872332428`，通过 exact images、build + runtime fingerprint、backend transport/allowlist、shadow health 和 monitoring mode。
- monitoring producer/consumer 配套部署：run `30871697409`。
- backend Redis connecting-phase 修复完整 CI/image：run `30871999647`；部署 run `30872115915`。
- 两次完整 HIL 均在等待 candle 前取得 protected-table 前置 digest；`k=4375`、`k_extensions_tdx=4371`、`k_extensions_qmt=4`、`strategy_signals=0`、`strategy_alert_events=0`。由于流程未进入重启与 post digest 阶段，不能据此宣称零写入闭环通过。

## 未通过的完整 HIL

### TDX

- run：`30872465907`
- identity：`securityId=9`、`600030.SH`
- key：`mist:realtime:v1:day:20260804:tdx:9:candle:1m:closed`
- window：2026-08-04 10:40:31–10:45:36 Asia/Shanghai
- baseline observation：`seriesCount=0`、`candidateCount=0`、`sealedTotal=0`、`no_snapshot=20`、`quantityProfileRejections=[]`
- result：等待两根新 sealed candle 超时。

### QMT

- run：`30872791011`
- identity：`securityId=4`、`300502.SZ`
- key：`mist:realtime:v1:day:20260804:qmt:4:candle:1m:closed`
- window：2026-08-04 10:46:58–10:52:02 Asia/Shanghai
- baseline observation：`seriesCount=0`、`candidateCount=0`、`sealedTotal=0`、`no_snapshot=44`、`quantityProfileRejections=[]`
- result：等待两根新 sealed candle 超时。

## 本轮暴露并修复的验收链缺口

1. monitoring 缺 candle mode metrics；补齐并发布 `3d1a912`。
2. Windows Docker template 对 OCI dotted label 解析失败；改为 JSON inspect（`adb2cc0`）。
3. TDX datasource 保存了 artifact SHA，但 public health DTO 丢字段；补齐 datasource `e2094dd`。
4. monitoring strict consumer 未接受新增 TDX artifact 字段；补齐 `881e593`，不将 digest 放入 metric label。
5. QMT 平台不提供 installed artifact SHA；HIL 改为强制 `unavailable + exact runtime fingerprint`（`ff36e32`）。
6. backend 在 ioredis connecting 阶段把首次 scanner 误计为失败；修复为等待下一次有界 scan（`21b46d3`）。
7. HIL 对既存 bounded recovery gap 错误要求为零；改为记录 baseline，并要求受控 backend restart 后计数严格增加（`ea1919f`）。
8. Windows PowerShell 5 将 Redis `[]` 包装成一个 null；修复 empty Hash 解析（`c1a803f`）。

## 下一步门禁

先只读定位为何两个 source 在 transport ready 时没有 snapshot 进入 ingress：补充 source status 中 last snapshot/freshness 的脱敏证据，并核对 terminal native callback、datasource WS frame、backend decoder acceptance 三段计数。不得把本次 `no_snapshot` 解释成 provider 量额口径结论，也不得为了通过 HIL 伪造 snapshot。恢复真实 frame 后重跑同一双 source full HIL；只有取得 sealed quantity、受控 restart/AOF、historical compare 和 post protected digest 后才可完成 task 5.4。
