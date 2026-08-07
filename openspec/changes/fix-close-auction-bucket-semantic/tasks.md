# 执行任务

## 1. 前置与基线

- [x] 1.1 复核 master HEAD 的 `resolveSession`、`registerDueIfFirst`、`processDueMember`、
  `applySnapshot` 当前行序，确认改动点。
- [x] 1.2 确认 `REALTIME_CANDLE_GRACE_MS` 生产配置值（default 5000ms），评估 `CLOSE_AUCTION_GRACE_MS`
  默认 60000ms 是否足够吸收 TDX/QMT 收盘帧延迟（dump 显示 15:00:57 到达，余量充足）。
- [x] 1.3 确认 blocked 证据的历史 failed 清理命令（运维项 D8，不阻塞本 change）。

## 2. producer session 改半开（apps/mist）

- [x] 2.1 `candle-bucket.util.ts`：`resolveSession` 改半开 `[09:30,11:31) ∪ [13:00,15:01)`；删除
  `CLOSE_DELAY_MIN` 及相关注释；更新文档注释（242 桶，11:30/15:00 终端桶语义）。
- [x] 2.2 新增导出 `isSessionTerminalBucket(bucket)`：bucketStart wall-clock = 11:30 或 15:00。
- [x] 2.3 `candle-bucket.util.spec.ts`：更新边界用例——11:30 in-session；11:31 null；15:00 in-session；
  15:01 null；15:02 null；删除旧 close-delay 扩 session 用例（15:01:30/15:02:00 in-session 的断言）。

## 3. config 新增收盘 grace（libs/config）

- [x] 3.1 `realtime-candle.config.ts`：新增 `REALTIME_CANDLE_TERMINAL_GRACE_LIMITS`（default 60000，
  min 0，max 180000）。
- [x] 3.2 `validation.schema.ts`：新增 `REALTIME_CANDLE_TERMINAL_GRACE_MS` Joi 校验。

## 4. product service due 加成（apps/mist）

- [x] 4.1 `realtime-market-data-product.service.ts`：`registerDueIfFirst` 对终端桶用
  `effectiveGraceMs = graceMs + terminalGraceMs` 算 due score 与准入。
- [x] 4.2 `processDueMember`：hard horizon 对终端桶放宽 `+ terminalGraceMs`。
- [x] 4.3 传入 `aggregator.applySnapshot` 的 options 用 `effectiveGraceMs`（按桶类型算），让
  `late_after_grace` 对终端桶放宽。
- [x] 4.4 spec：终端桶 due 加成；普通桶 due 不变；hard horizon 放宽；aggregator 准入放宽。

## 5. consumer session 对齐（libs/signal + apps/signal）

- [x] 5.1 `realtime-period.builder.ts`：`sessionPosition` 改 `wallMinute < 11*60+31` /
  `wallMinute < 15*60+1`（含 11:30/15:00 端点）。
- [x] 5.2 `realtime-period.builder.spec.ts`：11:30/15:00 接受；≥11:31/≥15:01 RangeError；现有盘中用例
  不动。
- [x] 5.3 `signal-strategy-market-data.adapter.ts`：`derivePeriodBars` 的 `sessionPosition` 同样对齐
  （`< 11*60+31` / `< 15*60+1`），防止历史 sealed 死桶 bar 在评估窗口加载时抛
  `realtime K is outside session`（生产证据：08-06 的 11 个 QMT 盘中 job 死于此处）。
- [x] 5.4 adapter spec：15:00 sealed bar 能派生；15:02 遗留死桶 bar 不炸窗口加载。

## 6. 接缝对齐测试

- [x] 6.1 新增跨侧断言：枚举 09:30→15:01 全分钟域，断言 242 桶 producer/consumer 对齐（每个非 null
  桶被 signal sessionPosition 接受）。
- [x] 6.2 枚举垃圾分钟（09:00–09:29、11:31–12:59、15:01–15:30）断言 resolver 返回 null。

## 7. 校验与验收

- [x] 7.1 `openspec validate --changes` 通过。
- [x] 7.2 `pnpm run lint:check` + `pnpm run typecheck` + `env TZ=UTC pnpm run test:ci` 全绿。
- [x] 7.3 `pnpm run ci:contracts` 通过。
- [x] 7.4 （可选，不阻塞）08-07 收盘后观察：failed zset 无新增 15:01/15:02 边界桶；15:00/11:30 正常
  完成；`CLOSE_AUCTION_GRACE_MS` 生效（15:00 桶 due ≈ 15:02）。
  ——2026-08-07 观察：A failed zset 空 ✅；D 15:01/15:02 无桶（死桶消灭）✅；
  C 15:00 桶 sealed + volume>0（36900，竞价量）✅（隐含 vwap 出界=量额不一致类异常，已记录）；
  B 11:30 桶存在但 v=0（竞价量归属语义 follow-up）；E QMT N/A。证据：
  `integration-20260806/evidence/2026-08-07-close-auction-observation.md`。
- [x] 7.5 （运维，待用户手动）清理历史 failed job（337 TDX + 5 边界），清理后 ZCARD=0。
  ——2026-08-07 用户手动完成（406→0，ZCARD=0）。
