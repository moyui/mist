# design — fix-close-auction-bucket-semantic

## 1. 背景与根因（2026-08-06 生产证据）

诊断转储 run 31084479412（`failed-jobs.json`）确认 5 条边界 failed job。**混合根因**：TDX 3 条死于
格式 bug（1421cb5 已修，旧镜像产物），仅 QMT 2 条死于 session 判定。337 个 TDX 历史 failed job 长期
掩盖了 session 问题（QMT 原生订阅 08-06 首次全天运转才暴露）。

根因链（代码级，均已在 master `1b564a1` 复核）：

1. **close-delay 意图被实现歪**：producer `candle-bucket.util.ts` 的 `resolveSession` 用
   `CLOSE_DELAY_MIN=2` **扩 session 边界**到下午 `[13:00, 15:02]`，意图是"吸收收盘延迟帧"。但
   `truncateToMinuteMs` 按 eventTime（provider 推送时刻）截断 → 15:01/15:02 的收盘后重复帧各自建独立桶。
   close-delay 的正确语义应是"延迟最后一根桶的封存"，而非"扩 session 建新桶"。
2. **死桶证据（Redis dump）**：TDX 300059.SZ 的 15:01/15:02 桶 `volume=0`，`cv`(累积量) 与 15:00 完全
   相同（271228300）→ 纯收盘后重复推送的死帧，不构成业务桶。而 15:00 桶 `volume=2288400`（15:00 cv
   − 14:59 cv = 集合竞价成交量），含真实收盘价，必须保留。
3. **consumer 把 4 个边界分钟一刀切**：signal `realtime-period.builder.ts` 的 `sessionPosition` 半开
   `[09:30,11:30) ∪ [13:00,15:00)`（240 桶），对 producer 的 11:30/15:00/15:01/15:02 统一抛 `RangeError`。
   其中 11:30/15:00 是有真实数据的合法终端桶，不该失败。
4. **接缝无对齐测试**：契约只传 `triggerTime`（= bucketStartMs），无"生产者桶宇宙 ⊆ 消费者可收集合"
   断言。signal spec 5 用例全在盘中，无边界用例。

### 1.1 数据语义

snapshot 带累积量 `cumulativeVolume`/`cumulativeAmount`（当日累积）。aggregator 用
`delta = current.cumulative − baseline.cumulative` 算每桶增量。因此：
- 死帧（收盘后重复推送）`delta=0`，对 OHLCV 无害，但产生噪音桶与失败 trigger；
- 集合竞价帧 `delta>0`（如 2288400），是真实成交量，必须计入正确的终端桶。

### 1.2 左标与 eventTime 语义

producer 左标：`bucketStartMs = truncateToMinute(eventTime)`，桶覆盖 `[bucketStart, bucketStart+1min)`。
eventTime 是 provider 推送时刻（非成交时刻）。集合竞价在 15:00:00 整点撮合，provider 在 15:00:xx 推送，
左标下落进 15:00 桶。这是左标对我们数据模型的正确行为（无需切右标）。

## 2. 已记录决策（owner 拍板，2026-08-06）

| # | 决策 | 理由 |
|---|---|---|
| D1 | **session 扩 1 分钟半开**：`[09:30, 11:31) ∪ [13:00, 15:01)`，242 桶 | 11:30/15:00 是合法终端桶（含收盘尾帧/竞价帧，dump 证明有真实 volume）；15:01+ 的死帧 session 外 null，不建桶 |
| D2 | **删除 `CLOSE_DELAY_MIN` 扩 session 逻辑** | 它是根因——扩 session 建了 15:01/15:02 死桶 |
| D3 | **收盘桶 due 加成**：11:30/15:00 的 due score 加 `CLOSE_AUCTION_GRACE_MS`（默认 60s） | 替代 close-delay 的"封存延迟"意图；15:00 桶总等待约 2 分钟（bucketEnd 15:01 + grace 5s + auction grace 60s ≈ 15:02:05），吸收迟到竞价帧 |
| D4 | **收盘桶累积 [端点, 端点+1min) 整分钟**，到 due 才 sealed | dump 显示 15:00 桶 `le=15:00:57`，是多帧累积；不是第一帧就 sealed |
| D5 | **14:59 走普通 grace**（due = 15:00 + 5s），不特殊处理 | 14:59 是普通桶，15:00 帧到来时 14:59 已接近 due，由扫描器正常封存 |
| D6 | **15:00 无帧 → expected-due 发 discarded trigger** | 与现有无帧桶行为一致；QMT 08-06 dump 已见此情形 |
| D7 | **consumer sessionPosition 对齐 242 桶** | 与 producer 完全一致；垃圾时间（≥11:31 / ≥15:01）仍 RangeError |
| D8 | **历史 failed job 运维清理**（337 TDX + 5 边界），不在本 change 自动化 | 一次性运维动作，与代码语义解耦 |
| D9 | **先跑观察，不追求与东财 240 根完全对齐** | 242 桶（比东财多 11:30/15:00 两根）是可接受的工程简化；未来再评估 |

## 3. 实现方案

### 3.1 `resolveSession` 改半开扩 1 分钟（candle-bucket.util.ts）

```ts
const MORNING_END_MIN = 11 * 60 + 31;   // 11:31 (半开，11:30 是最后桶)
const AFTERNOON_END_MIN = 15 * 60 + 1;  // 15:01 (半开，15:00 是最后桶)

function resolveSession(zoned: Date): CandleSession | null {
  const minutesOfDay = zoned.getHours() * 60 + zoned.getMinutes();
  if (minutesOfDay >= MORNING_START_MIN && minutesOfDay < MORNING_END_MIN) return 'morning';
  if (minutesOfDay >= AFTERNOON_START_MIN && minutesOfDay < AFTERNOON_END_MIN) return 'afternoon';
  return null;
}
```

删除 `CLOSE_DELAY_MIN` 及其注释。242 桶。

### 3.2 收盘桶判定 helper（candle-bucket.util.ts 导出）

```ts
export function isSessionTerminalBucket(bucket: CandleBucket): boolean {
  // bucketStart 的 wall-clock 分钟-of-day = 11:30(690) 或 15:00(900)
  const zoned = toZonedTime(new Date(bucket.bucketStartMs), TIME_ZONE);
  const minutesOfDay = zoned.getHours() * 60 + zoned.getMinutes();
  return minutesOfDay === 690 || minutesOfDay === 900;
}
```

### 3.3 config 新增 CLOSE_AUCTION_GRACE_MS（realtime-candle.config.ts）

```ts
export const REALTIME_CANDLE_TERMINAL_GRACE_LIMITS = Object.freeze({
  default: 60_000,   // 收盘桶额外 grace（集合竞价帧吸收窗口）
  min: 0,
  max: 180_000,
});
```

### 3.4 product service due score / hard horizon / 准入按桶类型（realtime-market-data-product.service.ts）

- `registerDueIfFirst`：`effectiveGraceMs = isSessionTerminalBucket(bucket) ? graceMs + terminalGraceMs : graceMs`；
  due score 用 effectiveGraceMs。
- `processDueMember`：hard horizon 对终端桶放宽 `+ terminalGraceMs`。
- 传入 aggregator 的 `applySnapshot` options：`effectiveGraceMs` 替代固定 `graceMs`，让 `late_after_grace`
  判定对终端桶放宽。

### 3.5 consumer sessionPosition 含端点（realtime-period.builder.ts）

```ts
// before: wallMinute < 11*60+30 / wallMinute < 15*60
// after:  wallMinute < 11*60+31 / wallMinute < 15*60+1
```

### 3.6 测试

- `candle-bucket.util.spec.ts`：更新边界用例（11:30 in-session；11:31 null；15:00 in-session；
  15:01 null；15:02 null）。删除 close-delay 扩 session 的旧用例。
- `realtime-market-data-product.service` spec：终端桶 due score 加成；普通桶不变；hard horizon 放宽。
- `realtime-period.builder.spec.ts`：11:30/15:00 接受；≥11:31/≥15:01 RangeError。
- 接缝对齐测试（新）：枚举 09:30→15:01 全分钟域，断言 242 桶 producer/consumer 对齐；垃圾分钟
  resolver null。

## 4. 验收

- `openspec validate --changes` 通过；
- Jest：producer + consumer + seam 测试全绿；
- 08-07 收盘后观察（可选，不阻塞）：failed zset 无新增 15:01/15:02 边界桶条目；15:00/11:30 终端桶
  以正常完成出现；`CLOSE_AUCTION_GRACE_MS` 配置生效（15:00 桶 due ≈ 15:02）。
- 无需交易时段 HIL（行为与盘中一致，只是边界桶从拒绝变接受）；on 模式门禁不受影响。

## 5. 明确不做（Non-goals）

- 不切右标（左标在 eventTime=推送时刻模型下正确，切右标是系统级重做，不值得）；
- 不把 15:00 竞价帧归并进 14:59 桶（242 桶方案，15:00 独立桶，无归并逻辑）；
- 不清理历史 failed zset（运维动作，D8）；
- 不改 trigger 契约 payload、Redis key 布局、Compose/部署。
