# 2026-09-01：QMT auto-unlock 修复完整记录

> change: `auto-unlock-qmt-reconciliation`（方案 A：terminal-restart 客观证据自动解锁）
> 本文档记录从问题发现、根因分析、代码修复到生产验证的完整链条。

---

## 1. 问题背景

QMT 订阅控制面反复被 journal reconciliation 阻塞：subId=159 的
`startup_recovery_intent`（08-27 timeout 结局，无 terminal）永久存在于
append-only journal，每次 datasource 重启都触发 `unknownCount=1` →
`reconciliationRequired=true` → sync/subscribe 全拒。此前每次需人工放置
`context-rebuild-observation.json` 解锁（08-25/08-27/08-28 三次）。

## 2. 修复方案（已定案）

方案 A：bridge 在 register frame 携带 `startedAt`（终端进程加载时间，
`%Y-%m-%d %H:%M:%S` 本地 +8）；datasource 在 reconciliation 阻塞时比较
`startedAt(+8转UTC) > journal 最早 unresolved intent(UTC)`——严格大于时
自动写入与 operator 相同的 `operator_observation`（`recoveryMode=
terminal_process_restarted`）解锁。fail-closed：无证据/不晚于/无残留
不解锁；unconfirmed 仍不自动重试；手动 observation 路径保留。

### 关键决策（2026-08-28 用户拍板）

- **时区**：datasource 硬编码 +8（Asia/Shanghai）解析 bridge 本地时间，
  不用 bridge 传 UTC——bridge 改动最小（仅透传现有 `STATE.started_at`）。
- **解析实现坑**：naive `datetime.strptime().timestamp()` 按容器 TZ 解释，
  必须 `(parsed - 8h).replace(tzinfo=UTC).timestamp()` 才正确。

## 3. 实现过程中的四个问题与修复

### 3.1 heartbeat 丢 startedAt
`QmtCommandGateway.heartbeat()` 重建 owner 时未保留 `started_at` → 首次
心跳后变 None。修复：heartbeat 透传 `self._owner.started_at`。

### 3.2 startup_recovery_result(confirmed=True) 被算 unknown
`_restore_startup_state` 只认 `startup_recovery_terminal`，confirmed result
（无 terminal 的正常结局）导致 intent 被算 unknown。修复：预扫描
`startup_recovery_result confirmed=True` 的 subId 集合，intent 分支视为
resolved（`confirmed_result_subids`）。生产 journal 上 unknown 从 8 → 1
（仅剩真 unresolved 的 subId=159）。

### 3.3 auto-unlock 时序竞态（关键）
`reconcile_startup` 在 backend WS 连接时执行，但 bridge `startedAt` 要等
HTTP `/owner` 注册才写入 gateway——WS 先连时 `started_at=None` →
auto-unlock skip → phase=degraded 永不再试。修复：
- `_attempt_auto_unlock` phase guard 放宽为 `{running, degraded}`
- `/owner register_owner` 成功后调用 `controller.attempt_auto_unlock()`
  （确定性重试点，此时 startedAt 必然存在）

### 3.4 O(N²) 阻塞 event loop（致命）
`_earliest_unresolved_recovery_time` 对每条 native_intent 全量扫描配对
result——47,059 条 journal 实测 **23.9 秒**，阻塞 event loop → /health
超时 → 容器 unhealthy（healthcheck 连续失败 23 次）。修复：预构建
`native_result` callSequence set（O(N)），set 查找替代 any 全扫描，
**23.9s → 0.03s**（~800x）。

## 4. 生产验证（2026-09-01 凌晨）

| 指标 | 值 | 状态 |
|------|-----|------|
| reconRequired | False | ✅ |
| unknownCount | 0 | ✅ |
| phase | completed | ✅ |
| startedAt | 2026-08-31 21:29:26（bridge 提供） | ✅ |
| sync_subscriptions | success 22（之前全 failure） | ✅ |
| journal 尾部 | 正常 intent→result→transition 流 | ✅ |
| **自动 operator_observation** | seq=47060, digest=`ebcdd881...`（自动生成，区别于手动 `7e61f92f...`） | ✅ |

自动解锁真实生效：注入失败的全部环节已通过生产数据确认。

## 5. 部署镜像

- `59be5e9`（auto-unlock + restored confirmed_result 逻辑）
- `7f84edb`（O(N²) 修复，最终部署 tag `7f84edbb7c038f983dcff4215e2b854d64f1eeb1`）
- 部署方式：docker save → scp → docker load → compose force-recreate
  （SSH 下 ghcr pull 有 credential 限制，遵循 AGENTS.md）

## 6. 待交易时段验证

- 09:30 开盘后：QMT snapshot 流入 → candle sealed → signal 评估 →
  chan_bsp 信号 → notification 微信投递
- 确认订阅生命周期（09215 reset 前的 read-before-reset sync 正常）