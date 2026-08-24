## ADDED Requirements

### Requirement: Windows appliance deploys lifecycle schema and mode in a gated order

The Windows Docker appliance SHALL deploy realtime subscription lifecycle as a mode-gated matched release. It MUST back up and migrate MySQL before backend health, keep lifecycle mode off by default, validate assignment readiness and legacy allowlist conflict before on, and preserve QMT journal/assignment state during rollback.

#### Scenario: Lifecycle migration is prepared

- **WHEN** deployment includes the assignment schema
- **THEN** preflight MUST record real `schema_migrations`, target table/index/FK inventory and a verified backup
- **AND** the migration runner MUST apply the first confirmed unused forward-only migration before backend health checks

#### Scenario: Lifecycle candidate is deployed off

- **WHEN** compatible backend, datasource and monitoring images are first deployed with the deployment contract
- **THEN** `REALTIME_SUBSCRIPTION_LIFECYCLE_MODE` MUST resolve to off unless explicitly set to on
- **AND** deployment health MUST prove no production coordinator mutation or 09:15 cron is active

#### Scenario: Lifecycle is promoted on

- **WHEN** the operator promotes lifecycle mode to on
- **THEN** deployment preflight MUST require initialized routing assignments, per-source ACTIVE capacity valid, both legacy realtime env allowlists empty, compatible datasource/control health and QMT reconciliation clear
- **AND** backend MUST be recreated with the effective mode before convergence is claimed

#### Scenario: Conflicting allowlist remains

- **WHEN** lifecycle mode is on while either legacy realtime env allowlist is non-empty
- **THEN** deployment or backend startup MUST fail closed before production mutation
- **AND** scripts MUST NOT silently clear, import or prefer one desired authority

### Requirement: Lifecycle rollback and recovery remain source scoped

Deployment and runbooks SHALL separate application rollback from QMT handle recovery. Rolling lifecycle off MUST preserve the forward-only schema, assignments, journal/checkpoints, Redis and business tables; unknown QMT state MUST use the existing source-scoped context-rebuild workflow.

#### Scenario: Lifecycle application rollback runs

- **WHEN** lifecycle acceptance fails after promotion
- **THEN** deployment MUST set lifecycle mode off and restore recorded compatible image tags
- **AND** it MUST not delete the assignment table, journal state, Redis volume or MySQL business rows

#### Scenario: QMT recovery is required

- **WHEN** QMT startup cleanup returns false/unknown or journal replay is blocked
- **THEN** operator tooling MUST recover only QMT datasource/terminal context and publish durable observation evidence
- **AND** it MUST not restart TDX datasource or the whole stack automatically

#### Scenario: Production HIL is recorded

- **WHEN** lifecycle is accepted in a supported Windows trading session
- **THEN** evidence MUST pin all repository/image/terminal artifact identities and cover backend restart, both source reconnects, intraday single activation, deferred removal, 09:15 trigger, QMT journal restart recovery, active/effective listener and protected-table digest
- **AND** mock, route success, non-trading output or root health alone MUST NOT satisfy the gate
