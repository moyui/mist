## ADDED Requirements

### Requirement: Schedule synchronizes every enabled provider configuration independently

The schedule app SHALL request the target trading day's `Period.ONE_MIN` history for every active security's enabled TDX and QMT `SecuritySourceConfig`, preserve source-specific bars actually returned by the provider, and SHALL NOT require a fixed bar count or final-bucket coverage.

#### Scenario: Security has multiple enabled sources

- **WHEN** an active security has enabled TDX and QMT configurations
- **THEN** the scheduler MUST create one independent sync item for each `tradingDay + market + source + security + providerSymbol`
- **AND** it MUST NOT select only the highest-priority source

#### Scenario: Unsupported source is encountered

- **WHEN** an enabled configuration is not TDX or QMT
- **THEN** this change MUST NOT route it through the post-close sync worker

### Requirement: Market schedules and retry windows are configurable

The default first attempt SHALL be 15:10 for A shares and 16:20 for Hong Kong, with failed items retried every 10 minutes until 08:00 on the next natural day.

#### Scenario: Default market close passes

- **WHEN** the configured first-attempt time arrives on a trading day
- **THEN** the scheduler MUST enqueue that market's eligible source/security items

#### Scenario: Item remains incomplete

- **WHEN** an item fails validation or persistence before the cutoff
- **THEN** only that item MUST remain pending and retry at the configured interval
- **AND** successful items MUST not be blocked

#### Scenario: Retry deadline expires

- **WHEN** an item is still pending at the configured next-day cutoff
- **THEN** automatic retries MUST stop and an alert MUST identify the item and retained Redis recovery partition

#### Scenario: Schedule evaluates current time and operational TTL

- **WHEN** schedule decides first attempt, retry, cutoff, or operational-key lifetime
- **THEN** it MUST use an injectable Node `Clock`
- **AND** operational Redis TTL MUST be applied as a Node-calculated relative `EXPIRE` or `PEXPIRE`
- **AND** Redis `TIME` and MySQL `NOW()` MUST NOT control schedule or cleanup behavior

### Requirement: One owner synchronizes each market trading day

The scheduler SHALL use a MySQL advisory lock held on one dedicated connection to fence each market/trading-day dispatch or retry cycle without a migration.

#### Scenario: Two schedule instances compete

- **WHEN** two instances attempt the same market and trading day
- **THEN** only the connection holding the advisory lock may dispatch or retry its items
- **AND** lock loss or connection loss MUST stop that owner before further writes

#### Scenario: One cycle finishes or waits for the next retry

- **WHEN** the current dispatch/retry cycle finishes, aborts, or reaches its execution deadline
- **THEN** the advisory lock MUST be released in `finally`
- **AND** it MUST NOT remain held during the configured retry interval or until the next-day cutoff
- **AND** the next cycle MUST acquire the lock again

### Requirement: Provider dispatch has bounded concurrency and duration

The scheduler SHALL limit item fan-out by provider, bound request duration, and reject oversized inventories without silently omitting items.

#### Scenario: Eligible inventory exceeds its guard

- **WHEN** a market cycle contains more eligible items than `HISTORICAL_SYNC_MAX_ITEMS_PER_RUN`
- **THEN** the whole cycle MUST fail closed and alert
- **AND** the scheduler MUST NOT truncate the inventory or silently mark omitted items complete

#### Scenario: Provider items are dispatched

- **WHEN** TDX or QMT items are processed
- **THEN** each source MUST use its configured bounded concurrency
- **AND** the scheduler MUST NOT issue unbounded `Promise.all` fan-out
- **AND** every provider request MUST use the configured timeout
- **AND** one timeout MUST leave only that item pending while other items remain processable

#### Scenario: Cycle execution deadline is reached

- **WHEN** a dispatch/retry cycle reaches its bounded execution deadline
- **THEN** it MUST stop dispatching new items
- **AND** in-flight items MUST settle within their configured timeout
- **AND** undispatched items MUST remain pending before the advisory lock is released

### Requirement: Provider history distinguishes successful empty results from failures

The schedule SHALL treat a successful empty provider result as a normal no-op, while nonempty results SHALL be normalized and checked for identity, market session bounds, unique ordered timestamps, required fields, and valid numeric/source-extension values; missing minutes and absent final-bucket coverage SHALL NOT be treated as provider failure.

#### Scenario: Provider returns valid target-day history

- **WHEN** normalized bars are nonempty, identity-matched, unique, ordered, in session, and field-valid
- **THEN** the result MAY proceed to source-specific MySQL upsert
- **AND** any count of valid bars MUST be accepted without expected-count, continuity, or final-bucket validation

#### Scenario: Provider successfully returns an empty collection

- **WHEN** the provider request succeeds with no bars
- **THEN** the item MUST complete as a no-op without writing a placeholder or `null` K row
- **AND** the item MUST NOT retry or require suspension, halt, or no-trade classification
- **AND** it MAY proceed to the same exact Redis cleanup used by a successful nonempty item

#### Scenario: Provider returns visibly invalid nonempty history

- **WHEN** nonempty normalized bars have wrong identity, are duplicated, out of order, out of session, or contain invalid required fields
- **THEN** the item MUST remain pending
- **AND** no Redis cleanup may occur

#### Scenario: Provider request fails

- **WHEN** the provider request returns an explicit error, times out, or otherwise does not complete successfully
- **THEN** the item MUST remain pending and retry according to policy
- **AND** no MySQL write or Redis cleanup may occur

### Requirement: Provider history is authoritative and round-trip verified

The provider normalized result SHALL overwrite matching source-specific historical keys, and success SHALL require a MySQL readback with matching canonical and extension count/digest.

#### Scenario: Retry or explicit rerun contains revised provider values

- **WHEN** a failed-item retry or operator-scoped manual rerun changes a bar at the same source-specific unique key
- **THEN** the upsert MUST replace the prior canonical and provider extension values
- **AND** Redis candle disagreement MUST be diagnostic only

#### Scenario: An item has already completed successfully

- **WHEN** no failed retry or operator-scoped manual rerun is requested
- **THEN** the scheduler MUST NOT automatically repeat the item solely to search for provider revisions

#### Scenario: MySQL readback differs

- **WHEN** readback of the source-specific unique keys returned by this request does not match normalized provider count/digest
- **THEN** the item MUST fail verification and retain its Redis partition

#### Scenario: Existing target-day rows were not returned by this request

- **WHEN** MySQL already contains same-day rows whose unique keys are absent from the successful provider result
- **THEN** those rows MUST remain unchanged
- **AND** they MUST NOT participate in this request's returned-key count/digest
- **AND** absence from one response MUST NOT be interpreted as a delete instruction

### Requirement: Redis cleanup is exact and item-scoped

Redis cleanup MUST be limited to market-data structural keys recorded in a completed item's `tradingDay + source + security` partition manifest. An item is complete when its nonempty result passes MySQL round-trip verification or when the provider successfully returns an empty collection.

#### Scenario: One source and security succeeds

- **WHEN** provider and MySQL round-trip verification succeeds for one item
- **THEN** only that item's closed-candle Hash, sealing-watermark/baseline checkpoint, due member, and manifest keys may be deleted
- **AND** cleanup MUST NOT use a broad key pattern

#### Scenario: One source and security succeeds with no bars

- **WHEN** the provider request succeeds with an empty collection
- **THEN** no MySQL row may be inserted
- **AND** the same item-scoped manifest cleanup MUST run idempotently
- **AND** an absent manifest or already-expired manifest member MUST count as cleanup success

#### Scenario: Another item fails

- **WHEN** one item fails while another succeeds
- **THEN** the failed item's old-day keys MUST remain hidden from product queries with the existing 72-hour fallback expiry
- **AND** the successful item MAY clean independently

### Requirement: Historical sync rollout is explicitly gated

`HISTORICAL_SYNC_ENABLED` SHALL default to `false`, and operators SHALL have a source/security/day-scoped manual dry-run before enabling automatic writes.

#### Scenario: Dry-run is requested

- **WHEN** an operator invokes manual sync with `dryRun=true`
- **THEN** provider fetch and validation MUST run
- **AND** MySQL writes and Redis deletion MUST not occur

#### Scenario: Feature is disabled

- **WHEN** `HISTORICAL_SYNC_ENABLED=false`
- **THEN** automatic post-close jobs MUST not mutate MySQL or Redis
