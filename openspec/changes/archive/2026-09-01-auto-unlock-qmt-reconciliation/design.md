# Design: auto-unlock-qmt-reconciliation

## 数据流

```
QMT 终端进程（XtItClient.exe）
  → mist_qmt_realtime_bridge.py（进程内运行, STATE.started_at = 进程启动时间）
  → TCP register frame（新增字段 startedAt）
  → datasource gateway（QmtCommandGateway / realtime gateway owner）
  → subscription controller（reconcile_startup 后检查自动解锁条件）
  → journal.append("operator_observation") → _clear_startup_recovery_state()
```

## 关键实现点

### 1. bridge register frame（mist_qmt_realtime_bridge.py）

`_make_register_frame()` 增加：

```python
"startedAt": STATE.started_at,  # "%Y-%m-%d %H:%M:%S" 本地时间（QMT 终端本地）
```

现有 `STATE.started_at` 在模块加载（行 134）与 `init()`（行 141）双赋值，恒非空；
bridge 由终端进程内加载执行（ownerId=`bigqmt-<pid>` 即终端 PID），
`started_at` 语义 = 终端进程加载 bridge 时刻。

### 2. gateway 存储 startedAt

QMT realtime gateway 的 owner 注册路径解析新增字段，存入
`QmtOwner.started_at`，并通过 health 暴露（`bridge.startedAt`）。

### 3. 自动解锁判定（subscription.py）

在 `reconcile_startup()` 完成后、`reconciliation_required = true` 时：

```python
QMT_TERMINAL_TIMEZONE = timezone(timedelta(hours=8))  # 硬编码 +8，项目拍板：QMT 终端恒 Asia/Shanghai

def _attempt_auto_unlock(self) -> None:
    if not self.reconciliation_required:
        return
    if self.journal.last_record is None:
        return  # 无 journal，不解锁
    # 找最早的 unresolved recovery intent 时间
    earliest = self._earliest_unresolved_recovery_time()
    if earliest is None:
        return  # 无 recovery 残留，不解锁
    # bridge startedAt（本地 +8）→ UTC epoch，严格晚于最早 unresolved intent 才解锁
    started = self.journal.register_started_at  # 从 gateway owner 透传
    if started is None or started <= earliest:
        return  # 终端未重启，不解锁（fail-closed）
    self.journal.append(
        "operator_observation",
        {
            "affectedJournalSequence": self.journal.record_sequence,
            "recoveryMode": "terminal_process_restarted",
            "operatorEvidenceDigest": "<sha256 of started_at+sequence>",
            "observationTime": now_iso(),
            "physicalSubscriptionsAssumedReleased": True,
        },
    )
    self.registry = QmtSubscriptionRegistry()
    self._clear_startup_recovery_state()
```

判定逻辑的三层保护：
- `reconciliation_required` 必须为 true（无阻塞不动作）
- journal 必须有 unresolved recovery intent 且时间可解析
- `bridge.started_at > earliest_unresolved_intent_at` 严格大于（等于不算）

### 4. 时间解析（方案 X 简化版：datasource 默认 +8）

- recovery intent 的 `recordedAt` 是 RFC3339 UTC
- bridge `started_at` 是 `"%Y-%m-%d %H:%M:%S"` 本地（QMT 终端本地）
- datasource 硬编码 +8 时区（Asia/Shanghai）解析：

```python
from zoneinfo import ZoneInfo
started_utc = datetime.strptime(
    started_at, "%Y-%m-%d %H:%M:%S"
).replace(tzinfo=ZoneInfo("Asia/Shanghai")).timestamp()
```

- 理由（项目拍板 2026-08-28）：QMT 终端恒部署在中国时区（+8），
  datasource 不需要感知终端实际时区；改动最小——bridge 只需透传现有字段，
  所有解析逻辑留在 datasource（Python 3.12，`zoneinfo` 可用）。

## 单测用例

1. ✅ startedAt > intentAt → 自动解锁（生成 observation 且 phase=completed）
2. ✅ startedAt < intentAt → 不解锁（reconciliationRequired 保持 true）
3. ✅ startedAt == intentAt → 不解锁（严格大于）
4. ✅ journal 无 unresolved recovery → 不解锁
5. ✅ 无 startedAt（旧 bridge）→ 不解锁（fail-closed）
6. ✅ 自动解锁与手动 observation 互斥（手动已解锁后不再触发）
7. ✅ 解锁后 journal 出现 operator_observation 且 sequence 递增
8. ✅ 重启后 journal replay 不再出现 unknownCount（observation 已生效？——否，
   注意：observation 是 journal 记录，replay 时会走 `operator_observation` 分支
   重置 registry → 不清算 unknown）

## 注意事项

- `_earliest_unresolved_recovery_time()`：扫描 `startup_recovery_intent` 中无对应
  `startup_recovery_terminal(confirmed=True)` 的最早写入时间；也考虑
  `native_intent` 孤儿（无 result）作为残余来源
- 自动解锁只应发生一次 per startup：`_startup_phase` 从 degraded → completed
  后不再重复
- 指标：`ds_metrics.set_reconciliation_required` 已有；新增
  `mist_datasource_auto_unlock_total{outcome=auto_unlocked|skipped}` 低基数 counter