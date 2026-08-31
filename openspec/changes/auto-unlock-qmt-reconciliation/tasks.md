# Tasks: auto-unlock-qmt-reconciliation

## 1. Bridge 透传 startedAt

- [ ] 1.1 `mist_qmt_realtime_bridge.py` `_make_register_frame()` 增加 `startedAt` 字段（复用 `STATE.started_at`，`"%Y-%m-%d %H:%M:%S"` 本地格式不变）
- [ ] 1.2 确认 bridge 模块加载 + `init()` 双赋值保证 `STATE.started_at` 恒非空

## 2. Gateway 存储与暴露

- [ ] 2.1 QMT realtime gateway owner 注册解析 `startedAt`，存入 `QmtOwner.started_at`
- [ ] 2.2 health 输出 `bridge.startedAt`（低基数，无终端路径等敏感信息）

## 3. 自动解锁判定

- [ ] 3.1 `subscription.py` 增加 `_earliest_unresolved_recovery_time()`（扫描 startup_recovery_intent 无对应 terminal 的最早时间 + native_intent 孤儿）
- [ ] 3.2 增加 `_attempt_auto_unlock()`：三层保护（reconciliation_required / earliest 存在 / startedAt 严格晚于 earliest）
- [ ] 3.3 时间解析：bridge `started_at`（`%Y-%m-%d %H:%M:%S` 本地）用 `ZoneInfo("Asia/Shanghai")` 硬编码 +8 解析为 UTC epoch，与 journal recordedAt（RFC3339 UTC）比较
- [ ] 3.4 在 `reconcile_startup()` 尾部调用，仅 per-startup 一次（phase degraded → completed 后不再重复）
- [ ] 3.5 更新 `reconcile_startup` 注释说明自动解锁路径

## 4. 单测

- [ ] 4.1 正例：startedAt > intentAt → 自动解锁（operator_observation 写入 + phase=completed + reconciliationRequired=false）
- [ ] 4.2 反例：startedAt < intentAt / == intentAt → 不解锁
- [ ] 4.3 journal 无 unresolved recovery → 不解锁
- [ ] 4.4 无 startedAt（旧 bridge）→ 不解锁（fail-closed）
- [ ] 4.5 已手动 observation 解锁后 → 不重复触发
- [ ] 4.6 解锁后 journal replay 不再产生 unknownCount（observation 分支重置 registry）

## 5. 指标与验收

- [ ] 5.1 `mist_datasource_auto_unlock_total{outcome}` counter
- [ ] 5.2 全仓 `uv run pytest`、`uv run ruff check .`、`uv run pyright` 通过
- [ ] 5.3 与 `integrate-production-realtime-subscription-lifecycle` 6.8 reconcile：确认该
      change 的 spec §4.5 表述更新为"unconfirmed 不自动重试；terminal restart 客观证据
      可自动解锁"，归档 delta 更新