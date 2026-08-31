# Specs Delta: auto-unlock-qmt-reconciliation

## Modified Requirements

### realtime-subscription-restart-recovery/spec.md

**Requirement: Startup recovery is attempt-once across restarts**

Before (current semantics):
```
WHEN a startup recovery attempt ends unconfirmed
  (timeout / exception / durability failure / unknown)
THEN the same lifecycle MUST NOT receive another automatic startup attempt
  across process restarts
AND a durable operator context-rebuild observation MUST be the only unlock
```

After (objective-evidence unlock added):
```
WHEN a startup recovery attempt ends unconfirmed
  (timeout / exception / durability failure / unknown)
THEN the same lifecycle MUST NOT receive another automatic startup attempt
  across process restarts
AND a context-rebuild observation MUST be the only unlock
AND the observation:
  - MAY be written by the operator through the existing one-shot file path
    (unchanged)
  - MAY be written automatically by the datasource when, and only when, the
    QMT terminal process start time (bridge `startedAt`) is strictly later
    than the earliest unresolved recovery intent in the journal
    (objective terminal-restart evidence)
AND an automatic unlock MUST NOT occur when:
  - the terminal start time is absent (older bridge) or not after the
    earliest unresolved intent
  - the journal has no unresolved recovery intent
  - the lifecycle is not currently reconciliation-blocked
```

Rationale: `terminal_process_restarted` is the same evidence class the
operator observation asserts. When the datasource can verify it objectively
(bridge runs inside the terminal process and supplies its start time), the
manual step becomes an automated fail-closed check — unconfirmed attempts are
still never retried, and no unlock happens without the terminal-restart proof.

**Requirement: Operator observation remains authoritative**

Unchanged: `operator_observation` with `recoveryMode=terminal_process_restarted`
remains the only unlock record kind; `physicalSubscriptionsAssumedReleased`
semantics unchanged; the manual one-shot observation file path remains
supported as a fallback.

## New metric

`mist_datasource_auto_unlock_total` counter with `outcome` label
(`auto_unlocked` | `skipped`) — low cardinality, no journal sequence or
terminal path in labels.