---
name: realtime-lifecycle-observability
version: 0.1.0
---

# Realtime Lifecycle Observability

## ADDED Requirements

### Requirement: R1: Lifecycle convergence state is observable via OTel

实时订阅生命周期的收敛状态 SHALL 经 OTel observable gauge 导出到
OpenObserve（desired/active/converged/deferred-removal 计数、trigger/result
计数、last-attempt/last-success 年龄、allowlist assigned/effective 计数），
label 保持低基数（source + 有界枚举，symbol MUST NOT 作 label）。

#### Scenario: 收敛状态在 OO 可查

- **WHEN** 需要检查某 source 的收敛状态（如是否 converged）
- **THEN** `mist_realtime_subscription_converged_count{source}` 等 gauge
  MUST 在 OO 可查询
- **AND** label MUST 仅含 source 与有界枚举（trigger/result），不含 symbol

#### Scenario: allowlist 状态可查

- **WHEN** 需要检查当前 allowlist 生效情况
- **THEN** `mist_realtime_allowlist_assigned_total{source}` 与
  `mist_realtime_allowlist_effective_total{source}` MUST 在 OO 可查询

### Requirement: R2: Diagnostics go through OpenObserve

实时订阅诊断 SHALL 通过 OTel 数据（gauge/span/log）在 OpenObserve 完成，
不恢复被移除的 HTTP 诊断端点；部署侧 readback 检查 SHALL 改用 OO 查询或
DB 直查。

#### Scenario: 诊断不走 HTTP 读端点

- **WHEN** 需要对实时订阅做诊断性检查
- **THEN** 检查 MUST 基于 OpenObserve 查询（gauge/span/log）
- **AND** 不要求存在 `/internal/realtime/*/status` 类 HTTP 端点
