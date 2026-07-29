> **延期状态**：本 delta 只保存未来评审候选，不授权当前实现。只有项目负责人重新明确授权并
> 复核当时基线后，以下 requirement 才能进入实施。

## ADDED Requirements

### Requirement: Schedule package remains available for future internal responsibilities

The `apps/schedule` application package SHALL remain in the Mist repository while its future runtime responsibilities are reviewed, and a deferred post-close design SHALL NOT be interpreted as authorization to delete, rename, deploy, or narrow the package to one permanent purpose.

#### Scenario: Deferred C3 remediation is applied

- **WHEN** unrelated C-class quality remediation is implemented
- **THEN** `apps/schedule` MUST remain present
- **AND** its current cron and strategy-scan behavior MUST remain unchanged unless a later explicitly approved change replaces that behavior
- **AND** production Compose MUST continue to exclude schedule until a separately approved rollout enables it

### Requirement: Schedule owns provider historical synchronization only

The schedule app SHALL call the existing TDX and QMT HTTP historical APIs for post-close synchronization and SHALL contain no realtime client, realtime route, or public product controller.

#### Scenario: Schedule application starts

- **WHEN** the schedule container starts
- **THEN** it MUST wire historical fetch, normalization, validation, source-specific persistence, and internal health providers
- **AND** it MUST NOT instantiate realtime transport clients or expose public market/strategy APIs

#### Scenario: Backend and schedule use provider endpoints

- **WHEN** historical bars are requested for TDX or QMT
- **THEN** both applications MUST reuse the established datasource `/v1/bars/query` contract rather than call terminal SDKs directly
