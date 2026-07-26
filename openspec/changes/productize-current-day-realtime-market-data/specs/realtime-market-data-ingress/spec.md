## MODIFIED Requirements

### Requirement: Transport acceptance is side-effect-free

The formal ingress MUST update transport memory state independently from an optional, feature-gated product sink; product-path failure MUST NOT reverse or corrupt transport acceptance.

#### Scenario: Canonical snapshot is accepted while productization is off

- **WHEN** common ingress accepts a canonical TDX or QMT snapshot and `REALTIME_PRODUCTIZATION_MODE=off`
- **THEN** bounded state and diagnostics may update
- **AND** Redis, MySQL, K aggregation, scanners, signals, alerts, notifications, and trading entry points remain untouched

#### Scenario: Canonical snapshot is accepted while productization is enabled

- **WHEN** common ingress accepts a canonical TDX or QMT snapshot after validation, allowlist, epoch, and per-symbol sequence fencing and mode is `shadow` or `on`
- **THEN** it MAY enqueue the snapshot to the product sink after updating transport memory
- **AND** the datasource frame, bridge, owner, transport mode, and sequence contracts MUST remain unchanged

#### Scenario: Product sink rejects a snapshot

- **WHEN** the product sink fails after transport acceptance
- **THEN** the accepted transport snapshot and fencing state MUST remain valid
- **AND** the failure MUST NOT reconnect or mutate the datasource transport
