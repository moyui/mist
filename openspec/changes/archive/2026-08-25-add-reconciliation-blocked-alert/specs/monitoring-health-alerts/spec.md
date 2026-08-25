## ADDED Requirements

### Requirement: Subscription reconciliation blocking state is observable via dedicated gauge and triggers alert

Datasource and monitoring SHALL expose whether subscription control is currently blocked by journal reconciliation (`reconciliationRequired`) as a dedicated bounded low-cardinality gauge `mist_datasource_subscription_reconciliation_required` with label `source`. OpenObserve and notification delivery SHALL define and enforce alert rule `A10_qmt_reconciliation_required` (P1) mapped to the `A10` prefix.

#### Scenario: QMT startup reconciliation enters degraded state
- **WHEN** QMT startup replay encounters an unresolvable journal orphan or structural gap
- **THEN** datasource MUST export `mist_datasource_subscription_reconciliation_required{source="qmt"}` with value `1`
- **AND** `subscriptions.reconciliationRequired` in `/health` MUST remain `true`
- **AND** metric labels MUST NOT contain journal sequence, subId, symbol, or exception text

#### Scenario: Reconciliation blocking state is cleared
- **WHEN** startup replay completes cleanly or one-shot context observation resolves all blocking entries
- **THEN** datasource MUST export `mist_datasource_subscription_reconciliation_required{source="qmt"}` with value `0`
- **AND** `subscriptions.reconciliationRequired` in `/health` MUST report `false`

#### Scenario: Alert fires during trading session
- **WHEN** OpenObserve evaluates `select max(value) as v from mist_datasource_subscription_reconciliation_required where source='qmt'` with result `>= 1` during trading hours
- **THEN** the rule `A10_qmt_reconciliation_required` MUST fire and be received by `oo-alert-receiver`
- **AND** notification delivery MUST enqueue the alert with severity `P1` and deliver it to the operations webhook
- **AND** if evaluated outside trading sessions, `oo-alert-receiver` MUST drop the alert silently

#### Scenario: Rule naming and severity contract lock supports multi-digit prefixes
- **WHEN** alert rules with prefix `A10` or higher are configured in `rules.json`
- **THEN** deploy verification and notification receiver MUST extract the prefix by delimiter (`_`)
- **AND** severity mapping MUST correctly map `A10` to `P1` without truncation to `A1`
