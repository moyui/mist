# Realtime subscription public state table

| Condition | `desired` | `active` | `activeEvidence` | `convergence` | `deferredRemovalReason` | Meaning |
| --- | --- | --- | --- | --- | --- | --- |
| lifecycle mode off | computed | `null` | `null` | `unknown` | `null` | Assignment exists, but production control/readback is disabled. |
| transport not ready or readback stale | computed | `null` | `null` | `unknown` | `null` | No trustworthy current provider evidence. |
| QMT reconciliation blocks replacement | computed | `null` or last proven value | `qmt_durable_registry` or `null` | `blocked` | `null` | Operator source-scoped recovery is required; no guessed inactive state. |
| desired member present in fresh evidence | `true` | `true` | provider-specific value | `converged` | `null` | Desired and actual membership agree. |
| desired member absent from fresh evidence | `true` | `false` | provider-specific value | `drifted` | `null` | Activation is pending or add/reset failed. |
| inactive member absent from fresh evidence | `false` | `false` | provider-specific value | `converged` | `null` | Removal is proven. |
| inactive member remains in fresh evidence | `false` | `true` | provider-specific value | `drifted` | `awaiting_full_reset` | Deactivation is persisted; provider removal waits for ready/reconnect or weekday 09:15 reset. |
| a round has started but final readback is pending | computed | last proven value or `null` | last evidence or `null` | `pending` | existing value or `null` | Do not claim convergence before final readback. |

Provider evidence is exact:

- TDX fresh terminal list: `tdx_native_list`;
- QMT verified durable registry: `qmt_durable_registry` (not a provider-native active list).

`convergenceReason` is nullable and, when present, one of:
`lifecycle_disabled`, `transport_not_ready`, `readback_stale`, `control_outcome_unknown`,
`desired_missing_active`, `awaiting_full_reset`, `control_failed`, `qmt_reconciliation_required`,
`qmt_journal_unhealthy`, `source_capacity_blocked`.
