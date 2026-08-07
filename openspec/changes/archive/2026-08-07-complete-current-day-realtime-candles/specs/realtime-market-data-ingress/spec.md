## ADDED Requirements

### Requirement: Canonical Realtime Quantities Shall Use Decimal Strings
`CanonicalRealtimeSnapshot.cumulativeVolume` and `cumulativeAmount` SHALL be canonical decimal strings or
`null`; for approved A-share stocks their units SHALL be shares and CNY yuan respectively. OHLC values SHALL
remain finite numbers.

#### Scenario: A provider snapshot is accepted
- **WHEN** its native quantity fields pass provider-specific validation
- **THEN** canonical quantities MUST preserve the accepted numeric value after the provider adapter's exact
  conversion to shares and CNY yuan
- **AND** they MUST NOT be converted back to JavaScript number
- **AND** the snapshot MUST NOT add per-record unit or precision fields

### Requirement: Candle Sink Failure Shall Not Roll Back Transport Acceptance
The ingress SHALL update its bounded latest-memory state before invoking an optional candle sink and SHALL
isolate sink failure from transport acceptance.

#### Scenario: The candle sink rejects an accepted snapshot
- **WHEN** latest-memory update has already succeeded
- **THEN** the accepted snapshot MUST remain the latest transport state
- **AND** sink degradation MUST be reported separately

### Requirement: TDX Canonical Event Time Shall Use Validated CapturedAt
The TDX source converter SHALL map the schema-v2 datasource `capturedAt` directly to canonical `eventTime`
because the accepted runtime has no provider-native business-time field. It SHALL NOT read `AsOf`, `DateTime`
or another native time alias. This approved source exception SHALL NOT apply to QMT.

#### Scenario: TDX schema-v2 snapshot reaches its converter
- **WHEN** the common decoder has validated `capturedAt` as RFC3339
- **THEN** TDX canonical `eventTime` MUST equal that `capturedAt`
- **AND** quality MUST mark event time available and aggregation eligible
- **AND** neither datasource send time nor backend receipt/current time may replace it

#### Scenario: QMT native event time is unavailable
- **WHEN** the QMT converter cannot resolve one consistent fixture-backed business time
- **THEN** canonical `eventTime` MUST remain null and aggregation-ineligible
- **AND** QMT MUST NOT fall back to datasource `capturedAt`
