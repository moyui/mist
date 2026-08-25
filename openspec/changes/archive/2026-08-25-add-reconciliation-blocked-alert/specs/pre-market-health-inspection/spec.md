## ADDED Requirements

### Requirement: Pre-market automated health inspection executes at 09:05 on A-share trading days

The schedule application SHALL execute an end-to-end pre-market health inspection at `09:05:00` Shanghai time on every confirmed A-share trading day, probe five distinct operational dimensions, and deliver a structured intelligence diagnostic card to the operations WeChat channel.

#### Scenario: Inspection executes on a trading day
- **WHEN** the clock reaches `09:05` on an exchange trading day
- **THEN** the schedule service MUST evaluate datasource/journal health, historical K-line completeness, subscription assignment compliance, realtime stream connectivity, and infrastructure liveness
- **AND** it MUST complete all probes before the `09:15` subscription reset barrier

#### Scenario: All systems are green
- **WHEN** all five inspection dimensions pass validation
- **THEN** the service MUST generate an "All Green" diagnostic summary listing active assigned securities and module readiness
- **AND** it MUST deliver the card to the enterprise WeChat operations webhook

#### Scenario: Datasource journal reconciliation is degraded
- **WHEN** the QMT or TDX probe detects `reconciliationRequired=true` or `phase="degraded"`
- **THEN** the inspection MUST classify the journal dimension as `FAILED`
- **AND** the diagnostic card MUST prominently display the root cause, affected securities, and exact recovery instructions (including `context-rebuild-observation.json` format and path)

#### Scenario: Historical K-lines are missing for the previous trading day
- **WHEN** query of `k_lines` reveals missing DAY or intraday minute bars for active securities on the prior trading day
- **THEN** the inspection MUST list the exact missing securities and periods
- **AND** the diagnostic card MUST include the command to trigger manual post-close sync

#### Scenario: Execution is skipped on non-trading days
- **WHEN** the clock reaches `09:05` on a weekend or exchange public holiday
- **THEN** the schedule service MUST skip the inspection and MUST NOT dispatch any notification
