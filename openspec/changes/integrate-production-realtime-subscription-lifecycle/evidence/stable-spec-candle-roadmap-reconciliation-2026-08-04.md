# Stable spec / candle / roadmap reconciliation — 2026-08-04

## Conclusion

The lifecycle change owns exactly the gap recorded by the candle change and intentionally supersedes only the stable transport deferrals that reserved this future owner. No candle, strategy, notification or post-close history ownership is moved into this change.

## Reconciliation table

| Source | Existing boundary | Lifecycle disposition |
|---|---|---|
| stable `backend-datasource-integration` | Four typed control methods exist; static source allowlists authorize symbols; normal Security status and ready do not create a business desired coordinator | Active delta removes the explicit “without coordinator” requirement and replaces it with immutable assignment + ACTIVE desired, while preserving typed WS, one outstanding request, bounded timeout and provider-specific response shapes |
| stable `qmt-native-subscription-transport` | Datasource owns whole/single registry and durable journal; full sync is caller-controlled sequential reset; retained-recovery blocks automatic mutation | Active delta adds bounded startup replay/one-attempt exact-ID cleanup. Startup recovery accepts only exact bool `true`; the existing normal reset contract and its separately HIL-qualified result semantics are not broadened |
| `complete-current-day-realtime-candles` task 5.4.1 and `2026-08-04-single-subscription-recovery.md` | Test-only single subscribe/finally cleanup proves transport/canonical/candidate but explicitly leaves backend authoritative sync, desired/active convergence and QMT startup reconciliation unimplemented | This change owns those three residual items. It does not reuse the deleted temporary `TDX_SUBSCRIBE_ALLOWLIST_ON_READY` path and does not claim candle task 5.4 complete |
| candle capacity design | Static allowlists were bounded to five entries per source, hence at most ten active market series | ACTIVE assignments retain the same five-per-source bound; effective inventory, not desired alone, becomes listener admission. Candle queue/due/Redis bounds remain unchanged |
| candle listener lifecycle | Listener membership registers expected due and existing due must reach terminal state across removal | Fresh provider readback atomically changes effective membership; removal cleans latest/stops future registration but does not cancel already-owned due |
| production roadmap | G1 transport/provider work is accepted; later operations/frontend/repeatability remain separately gated; post-close history sync is indefinitely deferred | Lifecycle is a focused active child between transport and realtime product consumers. It does not reopen G1, implement the broad G2 recovery console, or enable `apps/schedule`; roadmap task/status is updated only at the owning change's final reconciliation gate |
| realtime strategy / notification changes | Consume sealed candle/product contracts and have their own persistence/delivery gates | Lifecycle only supplies effective listener and subscription evidence; it does not create Signal, AlertEvent, BullMQ or notification behavior |
| independent frontend change | UI consumes frozen backend contract | `add-realtime-subscription-operator-ux` is separately apply-ready and is not a completion condition for this backend lifecycle change |

## Dependency order

1. Freeze production schema evidence and backend HTTP/state contracts.
2. Implement assignment and lifecycle in mode `off`.
3. Implement QMT startup reconciliation and matched monitoring/deploy support.
4. Complete automated/real-MySQL validation.
5. Run supported Windows/trading-session HIL and promote lifecycle `on` only after allowlists are empty.
6. Let candle/strategy/notification and the independent frontend change consume the proven lifecycle contract without changing its ownership.

## Residual gates

- Production task 1.2 still requires a current read-only inventory; older evidence is useful context but does not fix a migration number.
- Candle parent task 5.4/5.5, realtime strategy production HIL and notification delivery remain outside this change.
- Post-close provider history sync and `apps/schedule` remain deferred and disabled.
