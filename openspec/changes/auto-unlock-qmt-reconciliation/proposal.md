# Proposal: auto-unlock-qmt-reconciliation

## 背景

`realtime-subscription-restart-recovery` 的 spec §4.5 规定：QMT 启动恢复中
"unconfirmed attempt"（timeout/exception/durability_failed）跨重启禁止自动重试，
operator context-rebuild observation 是唯一解锁途径。

实际运维中该设计导致反复人工介入：
- subId=159 的 `startup_recovery_result outcome=timeout`（2026-08-27 15:50）后无
  `startup_recovery_terminal` → 每次 datasource 重启 replay journal 都触发
  `unknownCount=1` → `reconciliationRequired=true` → sync/subscribe 全拒
- 08-25、08-27、08-28 三次人工生成 observation 文件 + 重启，问题必然复发
- 根因：timeout 的 recovery intent 永久残留 journal，observation 是一次性消费

## 目标

让"终端进程已重启"这一**客观事实**自动解锁，不再需要每次人工介入。

## 核心思路（方案 A）

operator observation 的语义是 `recoveryMode=terminal_process_restarted`——"终端进程
重启过，所有旧 subId 必然随 SDK 进程消失"。这个证据可以由机器验证而非人工确认：

1. QMT bridge（跑在终端进程内）在 register frame 携带 `startedAt`（终端进程启动时间）
2. datasource 在 `reconciliationRequired=true` 时，比较 `bridge.startedAt` 与 journal 中
   最早的 unresolved recovery intent 写入时间
3. 若 `startedAt > recoveryIntentAt`（终端确实在恢复尝试之后重启过）→ 自动写入
   `operator_observation`（recoveryMode=terminal_process_restarted）→ 解锁

安全论证：
- 与现有 operator 解锁使用同一证据类型（terminal_process_restarted），只是由
  机器验证客观时间戳代替人工确认
- 不会误解锁"终端未重启"的情况（startedAt 不晚于 intent 时间）
- 保持 `reconciliationRequired` 的 fail-closed 语义：无证据不解锁

## 范围

- mist-datasource：QMT bridge register frame 增加 startedAt；gateway 存储/暴露；
  subscription.py 增加自动解锁逻辑
- 单测：时间比较正/反例、非 timeout 情形不解锁、journal 无残留不解锁

## 非目标

- 不改变 startup recovery 的重试语义（unconfirmed 仍不自动重试）
- 不改变 operator 手动 observation 的路径（保留为 fallback）
- 不处理 TDX（TDX 无 journal recovery 机制）