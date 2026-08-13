# 2026-08-10 QMT 验证 — OTel/OO 驱动的 lifecycle 6.5 + 遗留项补验

> 方式：**OpenObserve 全链路验证**（不再依赖已退役的 monitoring/HIL preflight 工具链）。
> 对应：integrate-production-realtime-subscription-lifecycle 6.5、fix-close-auction 7.4-E 补验。

## 1. OO 验证结果（10:06-10:15 查询）

| 查询 | 结果 | 判定 |
|---|---|---|
| `qmt.snapshot.ingest`（qmt-datasource） | 184+ 持续增长 | ✅ O2a ingest 在流 |
| `candle.snapshot.process` by source/symbol | **qmt/300502.SZ × 232**（tdx 0） | ✅ QMT 单源实盘 |
| `candle.due.finalize` by source | qmt × 6 / tdx × 12 | ✅ QMT 封存；**tdx 空桶封存=断流在 OO 可见**（查错信号） |
| `mist_candle_sealed_total` | 4.0 增长 | ✅ 桶真实封存 |
| QMT 错误 spans | subscriptions/poll ERROR ×2497（503 期）+ ingest ERROR ×1（ownership_invalid） | ✅ 历史故障全部可追溯 |

## 2. lifecycle 6.5 证据（今日 QMT 修复过程）

- **datasource restart**：今日多次（clear workflow、Set Realtime Mode、部署 recreate）✅
- **deterministic false/unknown continuation + replacement block**：stale observation →
  `observe_rebuilt_context` 抛错 → `.processing` 残留 → 每次重启重复失败（deterministic block）✅；
  recover workflow 的 publish 步骤 "A QMT context rebuild observation is already pending" 拒绝 ✅
- **exact true cleanup**：新增 `clear-windows-qmt-context-observation` workflow（deploy 03c000a）
  清除 observation + journal 家族备份移动 ✅
- **durable context-rebuild recovery**：recover v2 smoke 通过（终端恢复）+ observation 消费路径
  验证（stale 拒绝 → 清除后恢复）✅
- **journal/checkpoint continuity**：journal 备份保留（journal-backup-*/）✅
- **no unrelated-source restart**：TDX datasource/backend 容器 identity 未被 QMT 操作触碰
  （deploy 失败诊断的 container identity 断言 + tdx finalize spans 持续）✅
- **根因补充**：真正的阻塞是 `QMT_REALTIME_MODE=off`（datasource 未挂 controller）——
  与 6.5 的 journal/observation 机制无关但同链路，已在 evidence-2026-08-10-o1-o2a-live-test-passed.md 记录。

## 3. 遗留

- **4b-E（QMT 15:00 桶）**：15:03 后 OO 验证（qmt due.finalize 15:00-15:02 时段 + sealed 增长；
  sealed gauge 为聚合无 source label，桶级证据以 due.finalize spans 为准）。
- **lifecycle 6.4 QMT 侧**（09:15 replacement）：09:15 已过（当时 QMT off）→ 最早下个交易日
  （08-11）补齐 QMT 09:15 观察。
- **strategy=on QMT 评估**：下午观察 strategy_signals（300502 新信号落库）+ OO evaluation 相关 spans。
