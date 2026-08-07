## Why

2026-08-06 生产转储（Inspect Windows Signal Diagnostics run 31084479412，`failed-jobs.json`）确认
`candle_finalized` job 在收盘边界确定性失败 —— 15:01/15:02 桶的 trigger 进入 Signal failed zset，
抛 `RangeError: finalized strategy trigger is outside A-share sessions`（QMT）或已被 1421cb5 修复的
TDX 格式错误（旧镜像产物）。337 个 TDX 历史 failed job 长期掩盖了 session 问题，QMT 原生订阅
08-06 首次全天运转才暴露。

根因是 **close-delay 的"封存延迟"意图被错误实现成了"扩 session 建新桶"**，而 producer 与 consumer
的 session 定义从未在接缝处对齐：

- mist producer `candle-bucket.util.ts` 的 `resolveSession` 按**含端点 + 收盘延迟**实现：
  上午 `[09:30, 11:30]`、下午 `[13:00, 15:02]`（`CLOSE_DELAY_MIN=2` 扩 session 边界），每日 244 桶；
  `truncateToMinuteMs` 把 15:01/15:02 的 provider 死帧各自建成独立桶。
- signal consumer `realtime-period.builder.ts` 的 `sessionPosition` 按半开区间写死：
  上午 `[09:30, 11:30)`、下午 `[13:00, 15:00)`，240 桶。
- 接缝契约只传 `triggerTime`（= bucketStartMs），不带 session 元数据；仓库无"生产者桶宇宙 ⊆
  消费者可收集合"的对齐测试。

### 生产证据（2026-08-06 Redis dump，TDX 300059.SZ）

收盘边界三桶（均为 provider 推送时刻 eventTime，左标）：

| 桶 bucketStart | volume | cv(累积量) | 说明 |
|---|---|---|---|
| 14:59 | 0 | 268939900 | [14:59,15:00) 集合竞价中，无成交 |
| **15:00** | **2288400** | **271228300** | ★集合竞价撮合帧，巨量成交 |
| 15:01 | 0 | 271228300 | 收盘后死帧，cv 不变（=15:00 的 cv） |
| 15:02 | 0 | 271228300 | 同上 |

- 15:00 桶 `cv − 14:59 桶 cv = 2288400` = 15:00 桶 volume → **15:00 桶含真实集合竞价收盘价**，
  必须保留。
- 15:01/15:02 桶 `volume=0` 且 `cv` 与 15:00 完全相同 → **纯收盘后重复推送的死帧，不构成业务桶**。
- 11:30 桶 `volume=40000`（cv 增量）→ **上午收盘后尾帧有真实成交**，需保留。

结论：close-delay 的"封存延迟"意图正确（吸收收盘帧），但实现（扩 session 到 15:02，让 15:01/15:02
各自建桶）产生了 2 个死时间噪音桶。数据语义为**累积量**（`cumulativeVolume`/`cumulativeAmount`），
aggregator 用 `delta = current.cumulative − baseline.cumulative` 算每桶增量，死帧 delta=0 无害但产
噪音桶与失败 trigger。

## What Changes

- **producer `resolveSession` 改半开扩 1 分钟**：上午 `[09:30, 11:31)`、下午 `[13:00, 15:01)`，
  **242 桶**（上午 121 + 下午 121）。删除 `CLOSE_DELAY_MIN` 扩 session 的逻辑。11:30 与 15:00 成为
  合法 session 终端桶（各自累积 [11:30,11:31) / [15:00,15:01) 的收盘帧）；15:01 及之后 session 外
  null，死帧不再建桶。
- **收盘桶 due score 加成**（替代 close-delay 的"封存延迟"意图）：11:30 与 15:00 这两个 session
  终端桶的 due score 不是 `bucketEnd + graceMs`，而是 `bucketEnd + graceMs + CLOSE_AUCTION_GRACE_MS`
  （默认 +60s，总等待约 2 分钟），让收盘竞价帧有足够时间到达后才封存。普通桶 due 不变。
- **收盘桶 hard horizon 对应放宽**：`bucketStart + 60s + FINALIZATION_HARD_HORIZON_MS +
  CLOSE_AUCTION_GRACE_MS`，避免终端桶被封存硬上限误杀。
- **aggregator 准入对收盘桶放宽**：`late_after_grace` 判定对终端桶使用加成后的 effective grace，
  否则 15:00:30 到达的竞价帧会被 `acceptedAt > bucketEnd + graceMs` 拒收。
- **consumer sessionPosition 对齐含端点**：`[09:30, 11:31) ∪ [13:00, 15:01)`，242 桶；11:30/15:00
  正常接受，≥11:31 / ≥15:01 抛 `RangeError`（保留垃圾防御）。
- **接缝对齐测试**：枚举 producer `resolveCandleBucket` 全分钟域（09:30→15:01，242 桶），断言每个
  非 null 桶的 wall-clock 分钟被 signal `sessionPosition` 接受；枚举垃圾分钟（09:00–09:29、
  11:31–12:59、15:01–15:30）断言 resolver 返回 null。
- 不改 Redis 数据布局、trigger 契约 payload、Compose/部署；Signal 评估/持久化路径不变（本 change
  只让 11:30/15:00 像普通桶一样被消费）。
- 历史 failed job（337 TDX + 5 边界）由运维一次性清理，不在本 change 自动化。

## Capabilities

### New Capabilities

无（不新增能力，修正已有 candle 产品的 session 语义）。

### Modified Capabilities

- `realtime-market-data-ingress`：producer bucket universe 从 244 桶修正为 242 桶；收盘桶 due 加成。
- `run-realtime-strategy-evaluation`：consumer session 对齐 242 桶。

## Impact

- 主要影响 `mist` 的 `apps/mist/src/realtime/candle/`（`candle-bucket.util.ts`、
  `realtime-market-data-product.service.ts`、`open-candle-aggregator.ts`）与 `libs/signal/src/runtime/`
  （`realtime-period.builder.ts`）。
- 消除每天约 12 个（3 系列 × 4 边界桶）确定性 failed job：failed zset 停止增长，诊断转储噪音消失。
- 11:30/15:00 终端桶首次能被策略消费（1m 窗口 + derived slot），含收盘竞价/收盘尾帧数据。
- 单仓双 app 改动，不涉及 datasource/deploy/monitoring/fe；无数据库 migration、无 trigger 契约变化。
- QMT 无 15:00 帧时（08-06 dump 已见），15:00 桶由 expected-due 机制发 discarded trigger，行为与
  其他无帧桶一致。
