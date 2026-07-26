## MODIFIED Requirements

### Requirement: Snapshot raw preservation boundary

The backend SHALL preserve the validated provider-native object carried by an accepted formal realtime frame, SHALL convert it through a source-specific adapter into the shared canonical ingress shape, SHALL retain only bounded in-memory latest snapshots, and MAY pass each accepted snapshot to the feature-gated Redis candle product path without persisting realtime candles to MySQL.

#### Scenario: Official snapshot fields are preserved

- **WHEN** a TDX or QMT quote includes provider-specific price, order-book, volume, amount, time, or extension fields
- **THEN** those fields remain present under the canonical snapshot's `native` object
- **AND** datasource code MUST NOT force the two providers into one native shape

#### Scenario: Realtime snapshot reaches common ingress

- **WHEN** an accepted formal TDX or QMT frame reaches the backend
- **THEN** the appropriate source adapter produces the common canonical shape
- **AND** productization `off` MUST preserve the existing memory-only behavior
- **AND** `shadow` or `on` MAY invoke only the specified Node open-candle and Redis due/closed/sealing-watermark/query product boundary

#### Scenario: Realtime product path is active

- **WHEN** an accepted snapshot is processed in `shadow` or `on`
- **THEN** source-specific native data and the common canonical data MUST remain distinguishable
- **AND** Redis MUST NOT accumulate full snapshot timepoint or latest-snapshot keys
- **AND** no realtime snapshot or Redis-derived candle may be written to MySQL `k` or source extension tables

### Requirement: Security initialization defines one effective realtime source

The backend SHALL establish canonical provider identity and at most one effective TDX/QMT realtime source when a Security or its source configurations are initialized or mutated, while retaining independent source configurations for historical synchronization.

#### Scenario: TDX and QMT configure the same security

- **WHEN** TDX and QMT provider codes represent the same listed security
- **THEN** both `SecuritySourceConfig` records MUST reference the same canonical `Security.id`
- **AND** canonical `Security.code` MUST omit the market suffix
- **AND** each provider-specific `formatCode` MUST remain available on its own source config

#### Scenario: Provider identity is ambiguous

- **WHEN** one `(source, normalized formatCode)` would reference more than one canonical `securityId`
- **THEN** the Security source mutation MUST be rejected atomically
- **AND** the previously valid configuration MUST remain unchanged

#### Scenario: Effective realtime source is initialized

- **WHEN** a Security has one or more enabled TDX/QMT source configs
- **THEN** the uniquely highest-priority config MUST define its effective realtime source
- **AND** the other enabled configs MAY remain enabled for source-specific historical synchronization
- **AND** a tie at the highest priority MUST reject the source mutation atomically

#### Scenario: Security has no realtime provider

- **WHEN** a Security has no enabled TDX or QMT source config
- **THEN** it MUST remain valid for non-realtime use
- **AND** it MUST NOT produce a realtime desired subscription

#### Scenario: Multiple consumers request one initialized security

- **WHEN** multiple backend consumers request realtime data for the same canonical `securityId`
- **THEN** runtime subscription MUST reuse one desired subscription derived from the initialized effective source
- **AND** consumer identity MUST NOT cause runtime source selection or a second provider subscription

#### Scenario: A non-effective source frame arrives

- **WHEN** transport accepts a frame whose source is not the initialized effective source for that security
- **THEN** transport memory and fencing MAY remain accepted
- **AND** the realtime candle product path MUST reject the frame with reason `non_effective_realtime_source`

#### Scenario: Mutation would change the initialized effective source

- **WHEN** a source mutation would change or remove an initialized security's effective `source + providerSymbol`
- **THEN** the mutation MUST be rejected atomically with `EFFECTIVE_SOURCE_CHANGE_UNSUPPORTED`
- **AND** existing source configuration, desired/actual subscriptions, latest, open candle and cumulative baseline state MUST remain unchanged
- **AND** runtime MUST NOT issue `sync_subscriptions`, `subscribe` or `unsubscribe`
