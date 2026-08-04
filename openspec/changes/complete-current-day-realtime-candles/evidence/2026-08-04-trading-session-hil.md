# 2026-08-04 交易时段 shadow HIL

## 结论

本轮在 A 股上午及下午交易时段完成了最终候选版本部署、双 source 只读预检和 datasource WebSocket
手动订阅验证，但完整 HIL **仍未通过**。下午证据已经把上午笼统的“没有 snapshot”拆成两个不同结果：

- QMT 能返回合法 native/canonical snapshot，实时量额 profile 复核通过，Redis 中也存在 QMT exact closed
  分区；但两次 full HIL 没有在 baseline 之后观察到目标标的的新 sealed candle，因此没有进入 restart/AOF、
  historical compare 和 post protected digest。
- TDX 能返回 fresh native/canonical snapshot，实时量额 profile 复核通过，但目标 runtime 的 native
  `get_market_snapshot` 没有 `AsOf` 或其他 provider business time；canonical `eventTime=null`，按既定
  fail-closed 契约不能进入 candle aggregator。

因此 task 5.4 保持未完成，模式保持 `shadow`，不得切 `on`。QMT historical 本次只取得 provider fill 的
零量额样本，不能据此完成 historical quantity profile 门禁。

这不是 quantity rejection：所有下午运行均为 `quantityProfileRejections=[]`，Redis AOF 为 enabled、last
write `ok`，策略表没有因 shadow 流程写入。当前剩余阻塞是 TDX provider time 缺失、QMT 目标标的
baseline 后无新 exact candle，以及尚未执行的完整 restart/AOF/protected-table 后置门禁。

## 下午手动订阅与 provider 数据证据

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
