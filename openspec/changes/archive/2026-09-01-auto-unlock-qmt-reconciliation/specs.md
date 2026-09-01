# Specs Delta: auto-unlock-qmt-reconciliation

> 归属勘误（2026-09-01 补账时修正）：attempt-once / operator-observation-unlock
> 语义的权威 requirement 是 live spec `qmt-native-subscription-transport` 的
> **"Subscription journal is detailed and durable"**（由
> `2026-08-24-integrate-production-realtime-subscription-lifecycle` 合入），
> 而非 `realtime-subscription-restart-recovery`（后者 R1-R5 无此 requirement）。
> 本 change 采用手工合并 + `--skip-specs` 归档（该 MODIFIED requirement 场景
> 过多，CLI 1.6.0 全场景对账不可行；live spec 修改见下）。

## Modified Requirement

### qmt-native-subscription-transport / "Subscription journal is detailed and durable"

仅改动其中一个场景，其余场景不变：

**Scenario: Startup recovery is not confirmed**（末条 AND 修订）

Before:
```
- **AND** only the approved operator context-rebuild observation MAY later resolve the failed lifecycle
```

After:
```
- **AND** an approved operator context-rebuild observation MAY later resolve the failed lifecycle — written by the operator through the one-shot file path, or written automatically by the datasource under objective terminal-restart evidence
```

## Added Requirement（同 capability，新增场景）

**Scenario: Objective terminal-restart evidence auto-unlocks**

```
- **WHEN** reconciliation is blocked by an unresolved recovery lifecycle and the QMT bridge `startedAt` (terminal process start time, terminal-local +8) is strictly later than the earliest unresolved recovery intent in the journal
- **THEN** the datasource MAY durably append the `operator_observation` itself (`recoveryMode=terminal_process_restarted`, `physicalSubscriptionsAssumedReleased=true`) and clear the block without operator action
- **AND** it MUST NOT auto-unlock when the start time is absent (older bridge) or not strictly later than the earliest unresolved intent, when the journal has no unresolved recovery intent, or when the lifecycle is not currently reconciliation-blocked
- **AND** the unlock decision SHALL be exported as `mist_datasource_auto_unlock_total{outcome}`
- **AND** unconfirmed attempts MUST NOT receive another automatic startup attempt either way
```

Rationale: `terminal_process_restarted` is the same evidence class the
operator observation asserts. When the datasource can verify it objectively
(bridge runs inside the terminal process and supplies its start time), the
manual step becomes an automated fail-closed check — unconfirmed attempts are
still never retried, and no unlock happens without the terminal-restart proof.

## New metric

`mist_datasource_auto_unlock_total` counter with `outcome` label
(`auto_unlocked` | `skipped_*`) — low cardinality, no journal sequence or
terminal path in labels.
