# 2026-08-04 交易时段 shadow HIL

## 结论

本轮在 A 股上午交易时段完成了最终候选版本部署和双 source 只读预检，但完整 HIL **未通过**。TDX 与 QMT 的 exact closed-candle key 均在 300 秒内没有新增两根 sealed 1m candle；因此 quantity profile、restart/AOF、收盘同源 historical 对账和 protected-table 前后零写入仍未取得闭环证据，task 5.4 保持未完成，模式保持 `shadow`，不得切 `on`。

这不是 quantity rejection：两个 source 的 `quantityProfileRejections=[]`，运行时为 `seriesCount=0`、`candidateCount=0`、`sealedTotal=0`，同时 `no_snapshot` discard 持续增长。当前证据指向“bridge/transport ready，但观察窗口没有 snapshot 进入 candle aggregator”。

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
