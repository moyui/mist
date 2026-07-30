## ADDED Requirements

### Requirement: Realtime candle identity is canonical
Mist SHALL identify every realtime candle partition and runtime queue by canonical `securityId`; source and
provider symbol SHALL be bounded provenance and `securityCode` SHALL NOT be stored in candle keys or records.

#### Scenario: Accepted snapshot enters candle aggregation
- **WHEN** a validated realtime snapshot resolves to one enabled A-share security
- **THEN** Node state, due identity and Redis partition MUST use that `securityId`
- **AND** source/providerSymbol MAY be retained only in the compact record provenance

#### Scenario: Provider provenance changes
- **WHEN** a source/providerSymbol would change for an initialized realtime security
- **THEN** the product path MUST fail closed without creating a second candle identity

### Requirement: Realtime quantities remain exact decimals
Canonical cumulative volume/amount and every candle quantity SHALL be a canonical non-negative decimal string
fitting `DECIMAL(36,8)` or explicit `null`; arithmetic MUST NOT use JavaScript number.

#### Scenario: Exact cumulative counters advance
- **WHEN** two valid cumulative quantity snapshots contribute to one candle
- **THEN** baseline comparison, delta and candle accumulation MUST use exact arithmetic
- **AND** compact `v/a/cv/ca` MUST be canonical decimal strings

#### Scenario: Required quantity is invalid
- **WHEN** a required quantity is missing, negative, unsafe, requires rounding or violates its provider contract
- **THEN** the affected candle MUST become invalid
- **AND** the runtime MUST NOT substitute zero

### Requirement: Open candle state is bounded and process local
Mist SHALL keep latest accepted snapshots and adjacent open 1m candle buckets in bounded Node.js memory and
SHALL serialize updates/finalization through one bounded queue per `securityId`.

#### Scenario: Frames for one security race with finalization
- **WHEN** snapshot and finalizer tasks target the same security
- **THEN** they MUST execute in queue order
- **AND** different securities MAY progress concurrently

#### Scenario: Queue capacity is exhausted
- **WHEN** a per-key or global pending hard limit is reached
- **THEN** the affected candle MUST fail closed with a stable reason
- **AND** transport latest state MUST remain available

### Requirement: Redis stores only sealed market state
Market Redis SHALL store due, sealed 1m candles, watermark and manifest under `tradingDay + securityId`
partitions and SHALL NOT store full snapshots, latest snapshots, mutable open candles or strategy state.

#### Scenario: A valid bucket reaches its cutoff
- **WHEN** source-specific grace has elapsed and the bucket is structurally complete
- **THEN** one Redis atomic transaction MUST write closed/watermark, remove due and refresh manifest/TTL

#### Scenario: An invalid bucket reaches its cutoff
- **WHEN** the bucket has a gap, reset, invalid price/time/session, missing baseline or runtime loss
- **THEN** watermark MUST advance with outcome `discarded`
- **AND** no closed candle field may be written

### Requirement: Grace and capacity require live evidence
TDX and QMT candle grace, record limits, memory/AOF/disk budgets and 72-hour retention SHALL be calibrated in
shadow mode from supported-session evidence before candle mode becomes on.

#### Scenario: Promotion lacks accepted calibration
- **WHEN** candle mode is requested as on without source-specific evidence and explicit limits
- **THEN** candle productization MUST fail closed
- **AND** realtime transport MUST continue independently

### Requirement: Sealed candles support bounded replay
Each closed partition SHALL remain discoverable through a manifest until day-end plus 72 hours so downstream
workers can replay a bounded ordered suffix without scanning unbounded Redis keyspace.

#### Scenario: Worker restarts
- **WHEN** a worker requests retained candles for one security
- **THEN** it MUST read only manifest-owned partitions, order by trading day and bucket, and enforce a hard bar limit
- **AND** insufficient retention MUST be reported as incomplete rather than fetched from MySQL

### Requirement: Candle sealing is independent from strategy evaluation
The candle finalizer SHALL complete or discard market state without waiting for queue Redis, strategy evaluation,
MySQL strategy writes or notification delivery.

#### Scenario: Strategy handoff fails after market commit
- **WHEN** a sealed candle cannot be enqueued to the strategy queue
- **THEN** the market commit MUST remain valid
- **AND** the failure MUST be observable for bounded reconciliation
