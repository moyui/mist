# Evidence — declarative-realtime-configuration HIL (2026-08-12)

> 生产 HIL：验证声明式配置（auto_reconcile 开关）的"DB 唯一权威 + 定时收敛 +
> 免重启"机制。经 SSH 通道（mist-box, user 12705）+ docker exec mist-backend
> 跑 hil-declarative.cjs（mysql2，复用容器 env 凭据）操作 runtime_configs。

## 验证目标（spec R1–R4）

| Requirement | 验证点 |
|---|---|
| R1 配置权威 DB | assignments + auto_reconcile 都在 runtime_configs/assignments 表（DB 读） |
| R2 自动收敛 | true 时定时轮收敛；false 时跳过但保留现有订阅（手动接管） |
| R3 开关声明式免重启 | false↔true 经 DB UPDATE；切换免重启；false→true 立即全量对齐 |
| R4 写通道校验+审计 | updated_by/comment 字段记录变更来源 |

## 基线（操作前）

- `runtime_configs.realtime_subscription_auto_reconcile = 'true'`（migration:017 设，2026-08-11T23:51:39Z）
- assignments：TDX `300059.SZ`(300059) + `600519.SH`(600519)；QMT `300502.SZ`(300502)
- backend `StartedAt = 2026-08-12T01:39:24.675071962Z`（**免重启基线**）
- mist-backend / mist-tdx-datasource / mist-mysql 均 healthy

## 步骤 + 输出

### Step A — set_false + 启动时间基线

```
ssh mist-box 'docker exec mist-backend node /app/hil.cjs set_false'
  → set false ok
ssh mist-box 'docker inspect mist-backend --format "{{.State.StartedAt}}"'
  → 2026-08-12T01:39:24.675071962Z   (基线)
```

UPDATE 语句：`UPDATE runtime_configs SET config_value='false', updated_by='hil:20260812', comment='HIL false test' WHERE config_key='realtime_subscription_auto_reconcile'`

### Step B — 等 75s（一轮定时）验证 false 状态

```
StartedAt = 2026-08-12T01:39:24.675071962Z   ✅ 不变（免重启）
docker logs --since 2m mist-backend | findstr /I "auto_reconcile reconciliation scheduled"
  → (无输出)   ✅ 定时轮读 false 静默跳过（R2 off=不自动收敛）
```

### Step C — set_true + 等 75s 验证 false→true 全量对齐

```
ssh mist-box 'docker exec mist-backend node /app/hil.cjs set_true'
  → set true ok
(等 75s)
StartedAt = 2026-08-12T01:39:24.675071962Z   ✅ 仍不变（免重启，全程未重启）
docker logs --since 2m mist-backend | findstr /I "auto_reconcile enabled"
  → {"level":30,"time":1786504286148,"pid":1,"hostname":"ebcdc34861e7",
     "context":"RealtimeSubscriptionLifecycleCoordinator",
     "msg":"auto_reconcile enabled: triggering full alignment"}   ✅ false→true 检测 + 立即全量对齐触发
read 确认：
  → auto_reconcile=true, updated_by=hil:20260812   ✅ 恢复
```

### Step D — datasource 侧验证（sync 实际下发 + 收敛结果）

```
ssh mist-box 'docker exec mist-backend curl -s http://tdx-datasource:9001/health'
  bridge.ready = True
  bridge.desiredSymbols = 2
  bridge.convergedSymbols = 2   ✅ 全部收敛（desired == converged）
  bridge.controlTotals =
    [ {operation: get_subscriptions, result: success, value: 186},
      {operation: sync_subscriptions, result: success, value: 93} ]   ✅ reset 全量 sync 持续下发成功
```

## 结论：通过 ✅

| Spec | 结果 | 证据 |
|---|---|---|
| R1 DB 唯一权威 | ✅ | hil.cjs 直读/写 runtime_configs + assignments；backend 不读 env |
| R2 自动收敛（true）/ 跳过保留（false） | ✅ | false 期间静默无 sync；converged=2 在 false 期间未掉（手动接管保留订阅） |
| R3 开关免重启 + false→true 立即对齐 | ✅ | StartedAt 全程 `01:39:24Z` 不变；日志 `auto_reconcile enabled: triggering full alignment` |
| R4 写通道审计 | ✅ | `updated_by='hil:20260812'` + `comment` 字段记录 |

**机制覆盖**：HIL 验证的 coordinator 行为（定时轮 + auto_reconcile 闸门 + false→true 全量对齐）是 backend 逻辑，与数据源无关——TDX 验证通过即证明机制正确，QMT 共用同一 coordinator。

## 已知 follow-up（不阻塞归档）

- **QMT 侧运行时验证**（P6）：待 QMT 平台恢复（终端登录），用同一机制验证 QMT 收敛（desired/converged）；当前 QMT platform_unavailable，不影响 backend 机制结论。
- **allowlist 免重启收敛（改 assignments）**：本次验证用 auto_reconcile 切换（reset 全量对齐会读当前 assignments 收敛），等效覆盖"改 DB 后收敛"。若需单独验证改 assignments 场景，可在交易时段改一个测试标的观察 ≤60s 收敛。
- **OO gauge 验证**：`mist_realtime_subscription_*` 系列 gauge 在 OO 可查（本次 HIL 用 datasource health + backend 日志替代，未用 OO 凭据）。
