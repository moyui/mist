# 实时链路完整巡检报告（2026-08-27）

> 检查时间：2026-08-27 ~09:50 CST（交易时段）
> 目标：检查四大指数缠论告警的完整流程是否正常，以及早上自动预检信号是否发出

---

## 一、总体结论

| 链路 | 状态 | 说明 |
|------|------|------|
| TDX 数据源 | ✅ 正常 | pushState=verified, snapshot 延迟 ~1.3s |
| QMT 数据源 | ✅ 正常 | running, snapshot 延迟 ~1.9s, reconRequired=false |
| Backend 订阅 | ✅ 正常 | 4 只指数 desired=active=converged |
| Candle 产品化 | ✅ 正常 | 1m candle 持续 sealed |
| Signal App | ✅ 正常 | 16 个 chan_bsp plan compiled, queue processed=40+ |
| **缠论信号产出** | ✅ 昨天正常 | 昨天 7 个 chan_bsp exit 信号全部 delivered |
| **缠论信号产出（今天）** | ⚠️ 0 个 | 评估在跑但未触发买卖点（正常结构未满足） |
| **盘前预检信号** | ❌ 未发出 | lifecycle mode=off → coordinator 静默 → 无预检日志/告警 |

---

## 二、盘前预检信号未发出——根因分析

### 2.1 根因

`.env` 中 `REALTIME_SUBSCRIPTION_LIFECYCLE_MODE=off`。

### 2.2 机制链

```
weekday_0915 cron（09:15 触发）
  → runWeekday0915Barrier() 
  → 检查 auto_reconcile（DB=true）→ 通过
  → enqueue(source, 'reset', 'weekday_0915')
  → 下一轮 scheduled reconciliation（60s 间隔）尝试执行
  → mode=off → observation store 返回 convergence='unknown', reason='lifecycle_disabled'
  → 无日志产出、无告警触发
```

### 2.3 证据

1. **后端 `RealtimeSubscriptionLifecycleCoordinator` 日志**：全天仅 1 条（今天 09:28 的 `QMT_SUBSCRIPTION_CONTROL_BUSY`），mode=off 下 coordinator 几乎静默
2. **weekday_0915 cron**：代码注册正常（`@Cron(CRON_SUBSCRIPTION_RESET_0915)` = `0 15 9 * * 1-5`），auto_reconcile=true，但 mode=off 抑制了实际执行
3. **OO 告警**：今天 09:00 只收到 1 条 `A2_ws_disconnected`（非交易时段被 dropped），无盘前健康检查告警
4. **策略信号**：今天 `strategy_signals` 表 0 条（signal app 在跑，processed=40，但无买卖点触发——结构未满足属正常）

### 2.4 .env 当前状态

```
REALTIME_PRODUCTIZATION_MODE=on          ← 已修复（昨天切）
REALTIME_SUBSCRIPTION_LIFECYCLE_MODE=off ← 待修复
REALTIME_STRATEGY_MODE=on
```

### 2.5 修复

将 `REALTIME_SUBSCRIPTION_LIFECYCLE_MODE` 改为 `on`，然后 force-recreate backend 容器。

---

## 三、缠论告警链路（昨天验证）

### 3.1 四大指数策略配置

| 证券 | Source | 5m 笔级 | 5m 段级 | 30m 笔级 | 30m 段级 |
|------|--------|---------|---------|----------|----------|
| 000001 上证指数 | qmt | ✅ id=7 | ✅ id=8 | ✅ id=9 | ✅ id=10 |
| 399006 创业板指 | qmt | ✅ id=11 | ✅ id=12 | ✅ id=13 | ✅ id=14 |
| 000688 科创50 | qmt | ✅ id=15 | ✅ id=16 | ✅ id=17 | ✅ id=18 |
| 880003 平均股价 | tdx | ✅ id=19 | ✅ id=20 | ✅ id=21 | ✅ id=22 |

16 个 chan_bsp 策略全部 enabled，plan 已编译。

### 3.2 订阅状态

```
000001 上证指数  qmt  ACTIVE  desired=True  active=True  converged ✅
399006 创业板指  qmt  ACTIVE  desired=True  active=True  converged ✅
000688 科创50    qmt  ACTIVE  desired=True  active=True  converged ✅
880003 平均股价  tdx  ACTIVE  desired=True  active=True  converged ✅
```

### 3.3 昨天信号产出

| 信号 ID | 策略 | Source | 周期 | 信号时间 | 告警状态 |
|---------|------|--------|------|----------|----------|
| 38 | 5m 笔/段级 | qmt | 5min | 10:40 | delivered ✅ |
| 37 | 5m 笔/段级 | qmt | 5min | 10:25 | delivered ✅ |
| 36 | 30m 笔/段级 | qmt | 30min | 10:00 | delivered ✅ |
| 35 | 5m 笔/段级 | qmt | 5min | 10:20 | delivered ✅ |

### 3.4 完整链路验证（昨天）

```
TDX/QMT snapshot → backend ingestion ✅
  → candle productization ✅ (mode=on, 4 只指数 sealed 1m candle)
  → BullMQ handoff ✅ (processed=272, failed=0)
  → strategy evaluation ✅ (lastEvaluatedAt, windowGroups=8)
  → chan_bsp exit signals ✅ (7 个信号)
  → alert events ✅ (7 个 delivered)
  → notification ✅ (wechat webhook configured)
```

---

## 四、Candle 产品化（昨天切 on 后验证）

### 4.1 切换操作

```
.env: REALTIME_PRODUCTIZATION_MODE=off → on
mist-backend: docker compose up -d --force-recreate mist-backend
```

### 4.2 验证结果

- `candle ingest_gated reason=mode_off` 消失
- `candle finalize source=qmt/tdx result=sealed` 持续产出
- Redis sealed candle key: `mist:realtime:v1:day:20260826:qmt:8:candle:1m:closed` 等 4 只指数
- signal app: processed=272, failed=0, windowGroups=8, derivedBars=2800

---

## 五、QMT 数据源状态

### 5.1 Health

```
realtimeMode: builtin
state: running, conn: 1, leader: mist-backend-qmt
pushState: None（重启后正常）
stallDetected: None
lastSnapshotAge: ~1.9s
bridge ready: True, ownerAge: ~0.5s
reconRequired: False
journalHealthy: True
phase: completed, unknownCount: 0
```

### 5.2 QMT Journal Recovery

- 8-14 中断残留孤儿 intent（seq=2906, callSeq=2906, subId=723）已通过 observation 文件解锁
- 今天重启后 `unknownCount` 重新变为 1（observation 文件 one-shot），已再次解锁
- `context-rebuild-observation.json` 已消费删除

---

## 六、TDX 数据源状态

### 6.1 Health

```
realtimeMode: builtin
wsConnected: True
pushState: verified
lastSnapshotAge: ~1.3s
desiredSymbols: 1, convergedSymbols: 1
stallDetected: False
bridge ready: True
```

### 6.2 控制面

```
get_subscriptions success: 636+
sync_subscriptions success: 633+
```

---

## 七、Signal App 状态

### 7.1 Health

```
realtimeMode: on
registry: ready=True, 16 strategies, 16 executionPlans
marketData: state=ready, windowGroups=4（今天）/8（昨天）
queue: processed=40（今天）/272（昨天）, failed=0
evaluation: lastEvaluatedAt=09:40（今天）/13:35（昨天）
```

### 7.2 今天 0 个信号的原因

评估在跑（lastEvaluatedAt=09:40），但无买卖点触发——缠论结构未满足（不是每个 5 分钟窗口都产生信号）。属于正常行为。

---

## 八、K 表数据状态

### 8.1 今日 K 表（DB）

今天 `strategy_signals` 表 0 条（无 chan_bsp 信号触发）。这是评估正常运行但结构未满足的结果。

### 8.2 Redis Candle

- 今天 sealed 1m candle 正常产出（qmt:8/11, tdx:12）
- 昨天 sealed candle 已过期（retention=72h）

---

## 九、OO 告警链路

### 9.1 现有告警（11 条）

```
A1_tdx_data_flow_stalled (P0)
A1_qmt_data_flow_stalled (P0)
A2_ws_disconnected
A3_subscription_not_converged (P1)
A4_pipeline_stalled
A5_datasource_unhealthy (P1)
A6_reject_skip_surge
A7_tdx_subscription_stall (P1)
A7_qmt_subscription_stall (P1)
A8_post_close_sync_failed
A9_post_close_sync_unready_surge
```

### 9.2 盘前告警缺失

- 无 A10 reconciliation blocked 告警（待 `add-reconciliation-blocked-alert` change 实施）
- lifecycle mode=off 导致 coordinator 静默 → 无盘前健康检查产出

---

## 十、待修复项

| 优先级 | 项 | 说明 |
|--------|-----|------|
| **P0** | `REALTIME_SUBSCRIPTION_LIFECYCLE_MODE=off → on` | 恢复盘前预检 + lifecycle coordinator 正常运行 |
| P1 | `add-reconciliation-blocked-alert` | 新增 A10 告警规则（reconciliationRequired gauge） |
| P2 | QMT journal one-shot observation | 每次重启需重新生成，考虑持久化方案 |
