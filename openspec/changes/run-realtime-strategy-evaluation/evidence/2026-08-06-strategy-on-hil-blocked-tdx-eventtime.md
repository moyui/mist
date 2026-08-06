# Strategy 6.5② on-HIL — BLOCKED：TDX eventTime 契约错位（发现并已修复，待部署）

> 2026-08-06 14:05-14:35 CST。`REALTIME_STRATEGY_MODE=on` 首轮 on HIL。
> 结果：**on 写入未发生（strategy_signals=0）——HIL 抓到一个真实生产 bug**；模式已回 shadow。

## 1. 时间线

| 时间 | 事件 |
|---|---|
| 14:05 | 切 `REALTIME_STRATEGY_MODE=on`（run 31076106879；workflow choice 缓存 422 → string input 修复 `a378fe2` 后放行） |
| 14:06 | `mist_signal_mode{on}=1`、worker/registry ready（definitions=3/plans=3）、handoff live_enqueue 15 success |
| 14:10 | `evaluation_last_outcome{failed}=1`、capability queue/evaluation=error、BullMQ failed=337 |
| 14:17 | 新增只读诊断 workflow `inspect-windows-signal-diagnostics.yml`（signal health + 有界日志 + BullMQ failed job 转储） |
| 14:20 | **根因定位**：`TypeError: Invalid closed-candle metadata` @ `decodeRealtimeClosedCandleRecordV1`（signal worker 读 sealed 记录失败） |
| 14:27 | 修复实施：TDX converter 规范化 eventTime → UTC Z（mist `1421cb5`，27 tests pass） |
| 14:33 | 模式回 shadow（on HIL 未通过，硬门禁） |

## 2. 根因链（证据闭环）

1. **wire 契约**（schema-v2，`realtime-native-map.decoder.ts`）：RFC3339 接受 `Z` 或 `±HH:MM` —— TDX bridge 发的 `capturedAt=2026-08-06T13:54:01+08:00` 是合规的。
2. **TDX converter**（`native-snapshot.converter.ts`）：`eventTime = input.capturedAt` 直接透传（08-05 评审的"TDX 无业务时间，用 capturedAt"例外），未做规范化。
3. **sealed 记录**：finalizer 把 eventTime 写入 `fe/le` → TDX 记录 `fe='2026-08-06T13:54:01+08:00'`（实测 exactClosedSnapshot）；QMT 记录 `fe='2026-08-06T05:36:00.000Z'`（QMT 走 native 业务时间 + `toISOString()`）。
4. **Redis sealed 契约**（`libs/realtime/realtime-candle-redis.contract.ts`）：`isRfc3339` 严格 `Z` + ≤3 位毫秒 —— `+08:00` 被拒 → `Invalid closed-candle metadata`。
5. 后果：所有 TDX `candle_finalized` job 在 worker 失败（实测 failed job：`candlefinal-v1-tdx-1-1m-*`、`candlefinal-v1-tdx-10-1m-*`）→ window groups=0 → 无评估 → on 模式零写入；QMT 侧记录合规（本轮 QMT 无匹配策略，故未暴露）。

**潜伏期**：queue failed=337 自 08-05 16:05 datasource 重部署（68e411bf，bridge v2.1）后累积——**shadow 模式下同样在失败**（worker 处理路径与模式无关），08-05 14:42 会话成功是因为当时 datasource 还是旧镜像。监控未告警（queue failed 无 alert）——monitoring observability 的后续缺口。

## 3. 修复（已提交，未部署）

`apps/mist/src/sources/tdx/realtime/native-snapshot.converter.ts`：
`eventTime = new Date(input.capturedAt).toISOString()` —— canonical 边界规范化到严格 Z（与 QMT converter 同模式）；`capturedAt` wire 原值保留作 provenance。27 tests pass（含 offset→Z、Z 透传、capturedAt 保留 3 个新断言）。**这是 producer 对齐既有 sealed 契约的合规修复，未改契约本身。**

## 4. 部署与重试（待负责人决定）

- [ ] mist backend 镜像重建（`pnpm run build:docker`）+ 部署（`deploy-windows-mist-stack.yml`）
- [ ] 部署后观察 shadow 下 TDX job 由 fail 转 success（queue failed 停止增长）
- [ ] 交易时段重跑 on-HIL：验证 transaction（短事务原子写 Signal+PENDING AlertEvent）、episode（activate/suppress 落库一致）、幂等（重复 trigger 不重复写、named dedupe）→ 通过后 owner 审核 + 归档

## 5. 证据索引

- failed job stacktrace：run 31076860746 artifact `failed-jobs.json`（本文件 §2 引用）
- TDX vs QMT sealed 记录 fe/le 格式：run 31075678182 / 31074655336 evidence `exactClosedSnapshot`
- signal health（on 模式）：run 31076576036 artifact `health.json`（windowGroupCount=0, evaluation failed）
- 契约代码：`realtime-native-map.decoder.ts`（wire 宽松）、`realtime-candle-redis.contract.ts`（sealed 严格）
