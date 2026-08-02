## REMOVED Requirements

### Requirement: Schedule Shall Trigger Strategy Scans After K-Line Collection
**Reason**: The production appliance excludes `apps/schedule`, post-close collection is deferred, and realtime
strategy evaluation will consume explicit market triggers in a separate worker.

**Migration**: Do not enable the legacy collection cron. Preserve existing code until a separately reviewed
cleanup change removes or repurposes it.

### Requirement: Scheduled Scans Shall Reuse Live Scan Semantics
**Reason**: New realtime evaluation is not a scheduled scan and must not inherit ownership from the legacy
schedule application.

**Migration**: Shared evaluator semantics move to `strategy-evaluation-contract`; realtime orchestration moves
to `realtime-strategy-evaluation`.
