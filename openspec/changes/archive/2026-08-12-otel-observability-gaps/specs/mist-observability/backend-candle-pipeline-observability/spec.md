---
name: backend-candle-pipeline-observability
version: 0.2.0
---

# backend-candle-pipeline-observability Specification

## MODIFIED Requirements

### Requirement: Metric labels are low cardinality

所有指标 SHALL 使用有界枚举 label；skip/invalidate/discard reason SHALL 来自文档化
allowlist。**skip/discard 计数（mist_candle_skip_total / mist_candle_discard_total）允许
`source` 与 `securityId`/`symbol` label（低基数集合内，受基数护栏约束）**；其余指标
MUST NOT 以 symbol/securityId 作 label（仅 span attributes）。

#### Scenario: skip/discard 按源与标的归因
- **WHEN** 一个 skip 或 discard 被记录
- **THEN** 计数 SHALL 携带 `source`（tdx|qmt）label
- **AND** 计数 SHALL 携带 `securityId`/`symbol` label（allowlist 标的集合内）
- **AND** `reason` label SHALL 来自文档化 allowlist

#### Scenario: 其余指标保持低基数
- **WHEN** 非 skip/discard 指标被记录（sealed 等）
- **THEN** label SHALL 仅含 reason 等有界枚举，MUST NOT 含 symbol/securityId

#### Scenario: 基数护栏
- **WHEN** 标的集合超出基数阈值
- **THEN** skip/discard 计数 SHALL 回退为 source-only 或触发告警，保持基数有界
