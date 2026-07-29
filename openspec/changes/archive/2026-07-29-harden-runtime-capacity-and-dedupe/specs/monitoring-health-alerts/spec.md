## ADDED Requirements

### Requirement: QMT historical command capacity is observable
Datasource health and monitoring SHALL expose QMT historical command counts,
limits, retained bytes, oldest ages, and rejection totals using fixed
low-cardinality fields and labels.

#### Scenario: Monitoring scrapes QMT health
- **WHEN** QMT realtime mode is enabled and the strict bridge health contract is
  valid
- **THEN** monitoring emits pending, in-flight, retained-result, byte, limit,
  oldest-age, and rejection metrics
- **AND** rejection reasons are restricted to a fixed allowlist

#### Scenario: Capacity field is malformed
- **WHEN** a required QMT capacity field is missing, negative, non-finite, or
  has the wrong type
- **THEN** monitoring reports a health-contract violation
- **AND** it MUST NOT emit misleading capacity samples
