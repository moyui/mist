# 背景分析：QMT 订阅控制面被 reconciliation 阻塞时无专用告警

> 本文档为 `add-reconciliation-blocked-alert` 的背景来源。只记录问题现状与告警链路
> 盘点，不定案方案。日期：2026-08-25。

---

## 1. 实盘痛点（本次 incident）

2026-08-23 巡检发现 QMT journal 有孤儿记录（8-14 终端中断残留）导致
`reconciliationRequired=true`，订阅控制面（sync/subscribe/unsubscribe）被拒，
持续 **2 天未被发现**。数据：

- journal `native_intent=2998` vs `native_result=2997`，差 1 条孤儿
  （seq=2906, callSeq=2906, method=unsubscribe_quote, subId=723）
- 孤儿记录**永久存在**于 append-only JSONL journal，自动恢复无法清除
  （recovery 只处理有活跃注册的 bucket）
- `context-rebuild-observation.json` 是 one-shot（消费后删除），每次 datasource
  重启后都要人工重新生成 → 重启即复发
- incident 期间：实时行情接收正常（snapshot 持续流入）、回测正常——只有
  订阅控制面受影响，**无现有告警点名此状态**

## 2. 现有告警链路盘点（mist-deploy oo-alerts/rules.json，11 条）

| 规则 | 指标 / SQL | 能否捕获 reconciliationRequired |
|------|-----------|-------------------------------|
| A1_qmt_data_flow_stalled (P0) | `mist_datasource_snapshot_accepted_total` 5min 无样本 | ❌ 只测数据流。reconciliation 阻塞时 snapshot 仍流入 |
| A2_ws_disconnected | 日志 `realtime ws event=disconnected` | ❌ 连接层面，与本状态无关 |
| A3_subscription_not_converged (P1) | `mist_realtime_subscription_last_success_age_seconds >= 600` | ⚠️ **间接覆盖**：backend sync 持续被拒 → last_success_age 增长 → 最终触发。但窗口 ≥10min + 阈值 600s（最长 ~20min 才响），且不指明原因（不区分 journal 阻塞 / 连接问题 / 其他） |
| A4_pipeline_stalled | `mist_candle_sealed_total` | ❌ candle 封存层 |
| A5_datasource_unhealthy (P1) | `mist_datasource_startup_ok` | ⚠️ **语义最接近但缺失**：`startup_ok` 只在启动成功时置 True（main.py:242），phase=degraded 不反映为 0/gauge 变化 |
| A6_reject_skip_surge | `mist_datasource_snapshot_rejected_total` | ❌ 数据质量层 |
| A7_qmt_subscription_stall (P1) | `mist_datasource_subscription_stall_active` | ❌ 这是数据流 stall（PUSHING/escalated），与 journal reconciliation 是不同机制 |
| A8/A9_post_close_sync_* | `mist_post_close_sync_tasks_total` | ❌ 收盘同步 |

## 3. 指标缺口（核心）

datasource health JSON 已暴露完整状态：

```json
"subscriptions": {
  "ready": false,
  "journalHealthy": true,
  "reconciliationRequired": true,
  "startupReconciliation": { "phase": "degraded", "unknownCount": 1, ... }
}
```

但 `src/datasource/metrics.py` 只有：`accepted/rejected` counter、
`bridge_ready/owner_stale/ws_clients/startup_ok/stall_active` gauge、
`control` counter（operation/result/reason）、`stall_total`、
`owner_registration` counter、`age` observable gauge。

**没有** `reconciliationRequired` 的 gauge → 状态只存在于 health JSON，
OTel/OO 无法直接查询触发。

## 4. 备选方案对比（只盘点，未定案）

| 方案 | 改动 | 优点 | 缺点 |
|------|------|------|------|
| A：新增专用 gauge + A10 规则 | datasource metrics.py 加 `mist_datasource_subscription_reconciliation_required`（0/1, label source）+ rules.json 加 A10 | 点名原因、响应快（period 10min + 阈值 1）、交易时段过滤复用现有 receiver | 多一个指标/规则 |
| B：强化 A3（只调阈值） | 阈值 600→120s | 零新指标 | 仍不指明原因；误报面扩大（连接抖动也算） |
| C：复用/扩展 startup_ok | phase=degraded 时置 0 | 零新指标 | 语义混淆（startup_ok 还表达进程启动成功）；重启瞬时闪烁 |
| D：control counter 告警 | `mist_datasource_control_total{result=failure,reason=QMT_JOURNAL_RECONCILIATION_REQUIRED}` 计数 > N | 复用现有埋点，指示**持续被拒** | 计数只增不减，需要 rate/时间窗；规则语义较绕 |

## 5. 推荐方向（待定案）

方案 A 最小且语义直接：datasource 侧 1 个 gauge（在 `reconcile_startup` 与
解锁路径上置 0/1），OO 侧 1 条规则（A10_qmt_reconciliation_required, P1,
period 10, operator>=1, silence 30）。链路复用：OO → webhook →
`apps/notification` oo-alert-receiver（已有交易时段过滤）→ 微信。

方案 D 可作为补充（持续被拒的累积证据），但单独不足以即时告警。

## 6. 关联

- `capture-realtime-provider-anomalies`（14 项待办）：本 incident 属于
  "QMT provider 异常"的真实样本，runbook 可引用本文档
- `openspec/specs/monitoring-health-alerts/spec.md`：告警语义现有稳定规约，
  若采纳方案 A 需在此 spec 增加 reconciliation 指标/规则条目