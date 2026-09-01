# Tasks: auto-unlock-qmt-reconciliation

> 完成记录（2026-09-01 补账）：实现已在 mist-datasource master 合入并生产验证，
> 提交链 e61e4a7（auto-unlock 主体）→ 59be5e9（confirmed=True 计 resolved）→
> cdc2f58（owner 重注册重试解锁）→ 7f84edb（O(N²) 修复，生产部署 tag）。
> 完整链路见 `evidence/2026-09-01-deployment-verification.md`。

## 1. Bridge 透传 startedAt

- [x] 1.1 `mist_qmt_realtime_bridge.py` `_make_register_frame()` 增加 `startedAt` 字段（复用 `STATE.started_at`，`"%Y-%m-%d %H:%M:%S"` 本地格式不变）
- [x] 1.2 确认 bridge 模块加载 + `init()` 双赋值保证 `STATE.started_at` 恒非空

## 2. Gateway 存储与暴露

- [x] 2.1 QMT realtime gateway owner 注册解析 `startedAt`，存入 `QmtOwner.started_at`
- [x] 2.2 health 输出 `bridge.startedAt`（低基数，无终端路径等敏感信息）

## 3. 自动解锁判定

- [x] 3.1 `subscription.py` 增加 `_earliest_unresolved_recovery_time()`（扫描 startup_recovery_intent 无对应 terminal 的最早时间 + native_intent 孤儿）
- [x] 3.2 增加 `_attempt_auto_unlock()`：三层保护（reconciliation_required / earliest 存在 / startedAt 严格晚于 earliest）
- [x] 3.3 时间解析：bridge `started_at`（`%Y-%m-%d %H:%M:%S` 本地）用 `ZoneInfo("Asia/Shanghai")` 硬编码 +8 解析为 UTC epoch，与 journal recordedAt（RFC3339 UTC）比较
- [x] 3.4 在 `reconcile_startup()` 尾部调用，仅 per-startup 一次（phase degraded → completed 后不再重复）；另有 `/owner` 注册成功后 `attempt_auto_unlock()` 确定性重试点（cdc2f58，修 3.3 时序竞态：WS 先连时 startedAt 尚未注册）
- [x] 3.5 更新 `reconcile_startup` 注释说明自动解锁路径

## 4. 单测

- [x] 4.1 正例：startedAt > intentAt → 自动解锁（operator_observation 写入 + phase=completed + reconciliationRequired=false）
- [x] 4.2 反例：startedAt < intentAt / == intentAt → 不解锁
- [x] 4.3 journal 无 unresolved recovery → 不解锁
- [x] 4.4 无 startedAt（旧 bridge）→ 不解锁（fail-closed）
- [x] 4.5 已手动 observation 解锁后 → 不重复触发
- [x] 4.6 解锁后 journal replay 不再产生 unknownCount（observation 分支重置 registry）

## 5. 指标与验收

- [x] 5.1 `mist_datasource_auto_unlock_total{outcome}` counter
- [x] 5.2 全仓 `uv run pytest`、`uv run ruff check .`、`uv run pyright` 通过（master CI 绿；
      另修复 `_earliest_unresolved_recovery_time` O(N²) 扫描阻塞 event loop——47,059 条 journal
      实测 23.9s → 0.03s，7f84edb）
- [x] 5.3 与 `integrate-production-realtime-subscription-lifecycle` 6.8 reconcile：live spec
      `qmt-native-subscription-transport`（"Subscription journal is detailed and durable" 的
      "Startup recovery is not confirmed" 场景）已更新为"unconfirmed 不自动重试；terminal restart
      客观证据可自动解锁"，归档 delta 见本 change specs.md（手工合并 + `--skip-specs` 归档，
      CLI 1.6.0 对该超大 MODIFIED requirement 的全场景对账不可行）

## 生产验证

- 2026-09-01 凌晨：自动 operator_observation seq=47060 写入，unknownCount 8→0，
  sync_subscriptions 由全 failure 转 success（evidence 文档 §4）
- 2026-09-01 09:21 终端重启后 owner 重注册再次自动解锁，复跑盘前巡检
  数据源/Journal 维度转绿（对话会话实证）
