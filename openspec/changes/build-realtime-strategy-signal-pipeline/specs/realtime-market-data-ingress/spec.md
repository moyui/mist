## MODIFIED Requirements

### Requirement: Backend owns canonical realtime conversion
The Mist backend SHALL validate source-native fields through source-specific adapters and SHALL produce one
`CanonicalRealtimeSnapshot` shape before any product consumer is invoked. Canonical cumulative volume and
amount SHALL be canonical decimal strings or explicit `null`.

#### Scenario: Valid source frame reaches ingress
- **WHEN** a TDX or QMT frame passes schema-v2 envelope, provider, native-map, and allowlist identity validation
- **THEN** the source adapter preserves `native` and derives canonical prices, decimal-string cumulative
  volume/amount, `eventTime`, `capturedAt`, quality and quantity precision provenance

#### Scenario: Native event time is unavailable
- **WHEN** a provider frame has no trustworthy native event time
- **THEN** canonical `eventTime` is null and quality marks native time unavailable
- **AND** the backend MUST NOT substitute its current clock as provider event time

### Requirement: Transport acceptance is side-effect-free
Formal ingress SHALL update bounded transport memory before invoking an optional candle sink; sink failure MUST
NOT reverse transport acceptance or directly create strategy/database/notification side effects.

#### Scenario: Canonical snapshot is accepted
- **WHEN** common ingress accepts a canonical TDX or QMT snapshot
- **THEN** bounded latest state and diagnostics MUST update first
- **AND** candle work MAY be offered only when productization is shadow or on
- **AND** BullMQ, strategy, MySQL and notifications MUST NOT run directly from ingress

#### Scenario: Candle sink fails
- **WHEN** the optional candle sink rejects or times out
- **THEN** transport latest state MUST remain accepted
- **AND** product health MUST report the isolated failure
