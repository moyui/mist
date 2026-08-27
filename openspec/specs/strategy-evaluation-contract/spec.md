# strategy-evaluation-contract Specification

## Purpose
Define the strategy market-data domain contract: a single runtime-neutral `StrategyBar` and `StrategyMarketDataPort`, one shared `KPriceProjector` for historical and realtime prices and one typed strategy-field catalog.
## Requirements
### Requirement: Strategy Market Data Domain Contract Shall Have One Owner
The shared strategy domain SHALL define one runtime-neutral canonical `StrategyBar` and
`StrategyMarketDataPort` for historical replay, realtime hydration and realtime observation resolution.

#### Scenario: The common port is declared
- **WHEN** the strategy market-data domain contract is implemented
- **THEN** it MUST declare `readReplayPage(StrategyReplayPageCriteria)` returning `StrategyReplayPage`
- **AND** it MUST declare `loadRealtimeWindow(StrategyRealtimeWindowCriteria)` returning
  `StrategyRealtimeWindow`
- **AND** it MUST declare `resolveRealtimeObservation(StrategyTrigger)` returning
  `StrategyMarketObservation`
- **AND** these types MUST remain internal domain/application types rather than public HTTP, OpenAPI or RPC
  payloads

#### Scenario: Canonical bars are declared
- **WHEN** a runtime adapter constructs a `StrategyBar`
- **THEN** the bar MUST carry provider-neutral security identity, exact source, period, one timestamp, OHLC,
  canonical decimal-string-or-null volume and amount, and required `type='complete'|'incomplete'`
- **AND** the shared contract MUST NOT import a TypeORM entity, Redis representation or application source

#### Scenario: Runtime adapters implement the common port
- **WHEN** Backtest and Signal runtime changes are implemented
- **THEN** Backtest MUST implement only the MySQL replay adapter
- **AND** Signal MUST implement only the MySQL/Redis/memory realtime adapters
- **AND** neither runtime MUST depend on the other or redefine the canonical bar, port or domain result types

### Requirement: Historical And Realtime Prices Shall Share One Runtime Projection
The shared strategy domain SHALL provide one explicit pure `KPriceProjector` for constructing finite-number OHLC
views from the approved historical and realtime storage representations.

#### Scenario: MySQL materializes an OHLC decimal as text
- **WHEN** mysql2 returns an existing `DECIMAL(20,2)` OHLC value as fixed-scale text
- **THEN** the runtime adapter MUST use the shared projector to produce a finite JavaScript
  number before constructing `StrategyBar`
- **AND** no field catalog, Indicator, evaluator or ChanCore consumer MAY receive or directly compare the database
  string

#### Scenario: Redis supplies a realtime OHLC number
- **WHEN** a valid sealed realtime candle supplies an OHLC value as a JavaScript number
- **THEN** the same projector MUST validate and retain that finite number without rounding or rewriting Redis
- **AND** historical and realtime adapters MUST NOT implement separate consumer-side `Number(...)` coercions

#### Scenario: Price projection ownership is inspected
- **WHEN** the shared price projection is implemented
- **THEN** it MUST NOT alter MySQL `DECIMAL(20,2)`, add a K-table migration or change the Redis sealed OHLC shape
- **AND** it MUST NOT be implemented as a global TypeORM/mysql2 decimal conversion or HTTP/Nest interceptor
- **AND** `volume/amount` MUST bypass price projection and retain their exact decimal-string-or-null contract

### Requirement: Strategy Fields Shall Come From One Typed Catalog
Mist SHALL define one field catalog containing each allowed field path, value type, finite
`calculationBarCount` and supported operators for backtest and realtime evaluation. Nullable fields SHALL also declare their
approved missing-value resolution.

#### Scenario: A strategy rule is validated
- **WHEN** a condition references a catalog field
- **THEN** its operator and threshold type MUST match the catalog entry
- **AND** unknown fields MUST fail closed

#### Scenario: The V1 catalog is enumerated
- **WHEN** the shared catalog is loaded
- **THEN** its direct K paths MUST be exactly `k.open`, `k.high`, `k.low`, `k.close`, `k.volume`, `k.amount`
  and `k.type`
- **AND** its Indicator paths MUST be exactly `indicator.kdj.k`, `indicator.kdj.d`, `indicator.kdj.j`,
  `indicator.macd.line`, `indicator.macd.signal` and `indicator.macd.histogram`
- **AND** it MUST NOT expose RSI, another unreviewed Indicator, `security.*`, `source`, `period`, `k.timestamp`
  or any `chan.*` path

#### Scenario: V1 field operators are validated
- **WHEN** a condition is checked against the catalog
- **THEN** finite direct K numbers MUST allow `gt`, `gte`, `lt`, `lte`, `eq`, `ne`, `crossesAbove` and
  `crossesBelow`
- **AND** decimal quantity fields MUST allow the same operator set with decimal-string thresholds
- **AND** KDJ and MACD fields MUST allow only `gt`, `gte`, `lt`, `lte`, `crossesAbove` and `crossesBelow`
- **AND** `k.type` MUST allow only `eq` and `ne`
- **AND** `neq`, `in` and every compatibility alias MUST be rejected

#### Scenario: A rule is compiled into an execution plan
- **WHEN** validation accepts a strategy rule
- **THEN** each ordinary condition MUST use its field catalog `calculationBarCount` as the compiled
  `requiredBarCount`
- **AND** `crossesAbove` or `crossesBelow` MUST compile to `calculationBarCount + 1`
- **AND** an `all` or `any` group MUST use the maximum child demand rather than their sum
- **AND** the strategy version's single rule MUST produce exactly one execution plan carrying its required
  signal kind and compiled demand

#### Scenario: A direct K field is compiled
- **WHEN** a rule references an approved direct K field such as `k.close`
- **THEN** its `calculationBarCount` MUST be 1
- **AND** a crossover on that field MUST compile to `requiredBarCount=2`

#### Scenario: A KDJ field is compiled
- **WHEN** a rule references an approved catalog KDJ(9,3,3) output
- **THEN** the fixed KDJ parameters MUST be `(9,3,3)` and `calculationBarCount` MUST be 13
- **AND** an ordinary comparison MUST compile to 13 bars while a crossover MUST compile to 14 bars

#### Scenario: A MACD field is compiled
- **WHEN** a rule references an approved catalog MACD(12,26,9) output
- **THEN** the fixed MACD parameters MUST be `(12,26,9)` and `calculationBarCount` MUST be 130
- **AND** an ordinary comparison MUST compile to 130 bars while a crossover MUST compile to 131 bars

#### Scenario: Adjacent MACD observations are evaluated
- **WHEN** a MACD condition is evaluated at ordered bar anchor `t`
- **THEN** its current observation MUST be recalculated only from `K[t-129...t]`
- **AND** a crossover prior observation MUST be recalculated only from `K[t-130...t-1]`
- **AND** the evaluator MUST NOT substitute an infinite-history continuation, a persistent EMA checkpoint or one
  differently seeded 131-bar calculation

#### Scenario: The same indicator is used by multiple plans
- **WHEN** plans in one market group require the same algorithm, parameters, source, period and anchor
- **THEN** backtest and realtime orchestration MUST reuse one calculation for that group and algorithm version
- **AND** they MUST NOT recalculate the same indicator once per strategy

#### Scenario: A client supplies lookback configuration
- **WHEN** HTTP input, rule JSON or persisted strategy data contains caller-owned `lookbackBars`
- **THEN** validation MUST reject that unsupported field
- **AND** no Entity or migration MUST add a `lookback_bars` column

#### Scenario: A field demand is not bounded
- **WHEN** a catalog field or future parameterized analysis field has an unknown, unbounded or out-of-range demand
- **THEN** creation, load, enable and realtime registration MUST fail closed
- **AND** the evaluator MUST NOT accept a runtime caller override

#### Scenario: A future analysis field is proposed
- **WHEN** an Indicator output lacks an individually reviewed fixed finite `calculationBarCount`
- **THEN** it MUST remain outside the eligible field catalog
- **AND** it MUST NOT inherit MACD's 130-bar window or claim full-history semantics from a bounded window

#### Scenario: A Chan field is proposed for V1
- **WHEN** any `chan.*` path is submitted
- **THEN** validation MUST reject it as outside the V1 catalog
- **AND** a future focused change MUST define its bounded or stateful semantics before strategy registration

#### Scenario: A nullable direct K field is compiled
- **WHEN** the catalog reviews `k.volume` or `k.amount`
- **THEN** an ordinary current-value comparison MUST use `calculationBarCount=1`
- **AND** only an approved operator that needs a prior observation MAY increase the compiled demand
- **AND** same-day forward-fill preparation MUST remain a field missing-policy projection rather than a caller-owned
  lookback or a change to compiled `requiredBarCount`

#### Scenario: A strategy filters by bar completeness
- **WHEN** a condition references `k.type`
- **THEN** its value MUST be the enum `complete | incomplete`
- **AND** only `eq` or `ne` operators MUST be accepted
- **AND** evaluation MUST preserve the actual type in immutable context and persisted context snapshots

#### Scenario: A strategy does not filter by bar completeness
- **WHEN** a valid canonical bar has `type='incomplete'` and the execution plan does not reference `k.type`
- **THEN** the bar MUST remain consumable by the context builder, Strategy-owned Indicator calculations and evaluator
- **AND** it MUST NOT be filtered or made unavailable solely because of its type

### Requirement: Evaluation Shall Separate Evaluability From Match
The shared evaluation contract SHALL return either `status='unavailable'` with a bounded reason or
`status='evaluated'` with `matched=true|false`. The V1 unavailable reason union SHALL contain only
`insufficient_history` and `field_unavailable`.

#### Scenario: Required bar context is insufficient
- **WHEN** actual accepted valid bars do not satisfy the execution plan's compiled Indicator or other approved
  `requiredBarCount`
  demand
- **THEN** evaluation MUST return `status='unavailable'` with reason `insufficient_history`
- **AND** it MUST NOT silently return `status='evaluated', matched=false`

#### Scenario: A consumed field remains unavailable
- **WHEN** bar demand is satisfied but an allowed nullable or derived field has no current value
- **THEN** evaluation MUST return `status='unavailable'` with reason `field_unavailable`
- **AND** it MUST NOT silently return `status='evaluated', matched=false`

#### Scenario: Evaluation has sufficient evidence
- **WHEN** required context and fields are available
- **THEN** evaluation MUST return `status='evaluated'` with explicit boolean `matched`
- **AND** the result MUST NOT contain an unavailable reason

#### Scenario: A field is statically invalid for the target
- **WHEN** validation or registration finds an unknown field or a field unsupported by the target runtime or
  source
- **THEN** the strategy MUST be rejected or marked ineligible at that boundary
- **AND** evaluator execution MUST NOT use recurring unavailable as compatibility behavior

#### Scenario: A valid bar contains a nullable quantity
- **WHEN** `volume` or `amount` is `null` on an otherwise valid canonical bar
- **THEN** the raw canonical bar MUST preserve that `null` field value
- **AND** the shared quantity projector MUST attempt same-trading-day forward fill before evaluation context is built
- **AND** a rule that does not consume that field MUST remain evaluable
- **AND** no layer MUST remove the bar, replace the raw value with zero or mutate Redis/MySQL persistence

#### Scenario: A nullable quantity has a same-day predecessor
- **WHEN** a current raw quantity is null and the same `(securityId, source, period, tradingDay)` sequence has an
  earlier effective non-null quantity
- **THEN** `QuantityForwardFillProjector` MUST use the nearest effective value for the current evaluation context
- **AND** volume and amount MUST update and resolve independently
- **AND** backtest and realtime MUST use the same projector implementation

#### Scenario: A nullable quantity has no same-day predecessor
- **WHEN** a rule consumes a quantity that remains null after the same-day projection
- **THEN** evaluation MUST return `status='unavailable'` with reason `field_unavailable`
- **AND** the projector MUST NOT read a later bar or inherit a prior trading day's quantity

#### Scenario: A trading day changes
- **WHEN** the projector observes the first bar of a new trading day
- **THEN** it MUST clear both prior quantity values before projecting that bar
- **AND** a daily bar MUST therefore never inherit volume or amount from the previous daily bar
- **AND** a suspended day with no bar MUST NOT create an evaluation anchor

#### Scenario: A derived-period bar is projected
- **WHEN** a 5m, 15m, 30m or 60m raw derived StrategyBar has been finalized
- **THEN** same-day quantity projection MUST occur after period aggregation
- **AND** constituent 1m null values MUST NOT be forward-filled before the derived sum is calculated

#### Scenario: Canonical input or calculation violates its contract
- **WHEN** a non-null canonical field is malformed or the context builder, Strategy-owned Indicator calculation or evaluator throws
- **THEN** the exception MUST propagate to the owning HTTP, RPC or task boundary
- **AND** it MUST NOT be converted to unavailable

### Requirement: Decimal Evaluation Shall Reuse Exact Decimal8 Values
The shared validator, compiler and evaluator SHALL use the candle foundation's scale-eight `Decimal8` primitive
for `k.volume` and `k.amount` thresholds and current values. Rule JSON, canonical bars, immutable context and
persisted context snapshots SHALL remain canonical decimal strings or `null`. `k.volume` and its threshold SHALL
always mean shares, while `k.amount` and its threshold SHALL always mean CNY yuan, independent of source.

#### Scenario: One quantity rule permits multiple sources
- **WHEN** an A-share strategy definition allows both TDX and QMT and references `k.volume` or `k.amount`
- **THEN** each source adapter MUST provide canonical `StrategyBar` values in shares and CNY yuan before
  evaluation
- **AND** the evaluator MUST compare the same stored threshold without source-specific rewriting
- **AND** source MUST remain provenance and identity rather than a unit selector

#### Scenario: A quantity rule targets an unsupported security profile
- **WHEN** a definition references `k.volume` or `k.amount` for `INDEX`, a non-A-share security or a source/runtime
  whose unit profile has not passed its required HIL
- **THEN** validation, load, enable or realtime registration MUST reject the target or mark it ineligible
- **AND** the evaluator MUST NOT borrow A-share factors, dynamically infer units or repeatedly return
  `field_unavailable`

#### Scenario: Quantity units are serialized
- **WHEN** a rule, canonical bar, immutable context or persisted context snapshot records a quantity
- **THEN** the fixed field contract MUST supply its shares-or-CNY-yuan meaning
- **AND** V1 MUST NOT add a per-rule or per-bar unit field

#### Scenario: A decimal comparison is evaluated
- **WHEN** a canonical quantity string and canonical threshold string are available
- **THEN** both MUST be parsed through the shared Decimal8 primitive
- **AND** comparison MUST operate on exact bigint-backed values without passing through JavaScript number
- **AND** the evaluator MUST NOT implement a private decimal parser or add a decimal dependency

#### Scenario: An evaluated decimal value is captured for audit
- **WHEN** immutable context, a rule snapshot or a persisted context snapshot records the value
- **THEN** it MUST record the canonical decimal string actually used by evaluation
- **AND** persisted live and backtest contexts MUST use the same quantity-evidence shape
- **AND** it MUST NOT serialize raw bigint or install a global BigInt JSON conversion

### Requirement: Persisted Quantity Evidence Shall Describe Effective Evaluation
The shared context-snapshot serializer SHALL keep evaluator values as canonical scalar fields and SHALL record
how every quantity observation required by the compiled execution plan was resolved. Live Signal and Backtest
result persistence SHALL use that same serializer and shape.

#### Scenario: A current observed quantity contributes to a persisted result
- **WHEN** the compiled plan requires current `k.volume` and its raw value is canonical `"100"`
- **THEN** persisted `k.volume` MUST be scalar `"100"`
- **AND** `quantityEvidence.current.volume` MUST contain
  `{raw:"100",effective:"100",resolution:"observed"}`
- **AND** `k.volume` MUST NOT be replaced by an evidence object

#### Scenario: A current quantity is forward-filled into a persisted result
- **WHEN** the compiled plan requires current `k.volume`, its raw value is null and the same-day projector
  resolves canonical `"100"`
- **THEN** persisted `k.volume` MUST be scalar `"100"`
- **AND** `quantityEvidence.current.volume` MUST contain
  `{raw:null,effective:"100",resolution:"forwardFilled"}`
- **AND** the raw `StrategyBar` and `k.type` MUST remain unchanged

#### Scenario: An operator requires a prior quantity observation
- **WHEN** a compiled quantity operator requires current and prior observations
- **THEN** the snapshot MUST include the required fields under both `quantityEvidence.current` and
  `quantityEvidence.previous`
- **AND** each observation MUST independently satisfy the same raw, effective and resolution invariants

#### Scenario: Boolean evaluation can short-circuit
- **WHEN** an `all` or `any` tree could skip a later condition during runtime evaluation
- **THEN** quantity evidence MUST still be materialized from the complete set of quantity observations required
  by the compiled execution plan before boolean short-circuiting
- **AND** condition order or traversal MUST NOT change the persisted evidence shape

#### Scenario: A plan consumes no quantity field
- **WHEN** the compiled execution plan does not require `k.volume` or `k.amount`
- **THEN** the snapshot MUST omit `quantityEvidence`
- **AND** it MUST NOT copy a complete raw K merely for provenance

#### Scenario: A required quantity remains unavailable
- **WHEN** a required current or prior quantity has no effective value after projection
- **THEN** evaluation MUST be unavailable and MUST NOT produce a live Signal or Backtest result
- **AND** `unavailable` MUST NOT be serialized as a quantity-evidence resolution

#### Scenario: Quantity evidence is persisted
- **WHEN** the shared serializer writes a live or backtest context snapshot
- **THEN** each evidence raw value MUST be a canonical decimal string or null
- **AND** each effective value MUST be a non-null canonical decimal string
- **AND** resolution MUST be exactly `observed` or `forwardFilled`
- **AND** V1 MUST NOT add `evaluationQuality`, raw bigint, a full raw-bar duplicate, a database column, a table
  or a migration for this evidence

#### Scenario: A future decimal rule needs unsupported arithmetic
- **WHEN** evaluation would require multiplication, division, a ratio, averaging or rounding
- **THEN** V1 MUST reject or defer that field/operator combination
- **AND** a focused change MUST define scale and rounding semantics before it is added

### Requirement: Backtest And Realtime Shall Share One Pure Evaluator
Signal-level backtest and realtime evaluation SHALL use the same validator, context contract and pure
evaluator. A legacy manual live-scan path SHALL NOT be retained as a third evaluation mode.

#### Scenario: Equivalent ordered context is replayed
- **WHEN** two evaluation modes use the same strategy version and context
- **THEN** their evaluation result MUST be identical

### Requirement: One Strategy Version Shall Express One Signal Kind
Each immutable strategy version SHALL contain exactly one rule and one required `signalKind='entry'|'exit'`.
Backtest and realtime orchestration SHALL use that signal kind without synthesizing an opposite kind.

#### Scenario: A strategy version is compiled
- **WHEN** its single rule and required signal kind pass validation
- **THEN** the execution plan MUST retain that exact signal kind
- **AND** no `entryRule`, `exitRule`, nullable exit rule or pairing identifier MUST be required

#### Scenario: Both entry and exit alerts are desired
- **WHEN** an operator wants independently triggered entry and exit reminders
- **THEN** the operator MUST create two independent strategy definitions
- **AND** V1 MUST NOT infer a position lifecycle, automatic close or portfolio relationship between them

### Requirement: Strategy Contract Details Shall Be Approved Before Schema Changes
Single-rule signal kind, unique identity, migration and legacy compatibility decisions SHALL
be recorded and approved before database or public DTO changes begin.

#### Scenario: A schema implementation task is reached
- **WHEN** any required decision remains open
- **THEN** no migration or compatibility code MUST be written

### Requirement: Strategy Indicator Observations Shall Be Computed By The Shared Indicator Core

The shared Strategy evaluator SHALL compute KDJ and MACD observations by delegating to the
`@app/indicators` anchor-observation functions over the exact catalog window (KDJ 13, MACD 130) with an
explicit `windowSize`, retaining the exact-window validation, finite-value guards, fixed parameters
`(9,3,3)`/`(12,26,9)`, the `calculationBarCount` (including `crossesAbove`/`crossesBelow` +1) and the
shared observation cache. Neither the analysis layer, the evaluator nor a backtest/realtime runtime
SHALL import `technicalindicators` directly.

#### Scenario: A MACD observation is computed at an anchor
- **WHEN** a MACD condition is evaluated at ordered bar anchor `t`
- **THEN** its current observation MUST be `computeMacdObservation(closes, { windowSize: 130 })` over
  exactly `K[t-129...t]`
- **AND** a crossover prior observation MUST be `computeMacdObservation(closes, { windowSize: 130 })`
  over exactly `K[t-130...t-1]`
- **AND** the evaluator MUST NOT substitute an infinite-history continuation, a persistent EMA
  checkpoint or a differently seeded calculation

#### Scenario: A KDJ observation is computed at an anchor
- **WHEN** a KDJ condition is evaluated at ordered bar anchor `t`
- **THEN** its current observation MUST be `computeKdjObservation(high, low, close, { windowSize: 13 })`
  over exactly `K[t-12...t]`
- **AND** a crossover prior observation MUST be `computeKdjObservation(..., { windowSize: 13 })` over
  exactly `K[t-13...t-1]`

#### Scenario: The evaluator delegates rather than re-implements
- **WHEN** the analysis layer computes KDJ or MACD observations
- **THEN** it MUST delegate to `@app/indicators`
- **AND** the analysis layer, evaluator and runtimes MUST NOT import `technicalindicators`

### Requirement: Evaluation Quantity Projection Shall Use The Unified Series Imputer

The shared quantity projector consumed by evaluation-context construction SHALL be the unified
series imputer with the same-window bidirectional semantics: a leading or middle missing quantity
SHALL be back-filled from the nearest later anchor, a trailing missing quantity SHALL be
forward-filled from the nearest earlier anchor, and a quantity with no anchor SHALL remain
unavailable. Effective quantity values SHALL be monotonic once determined. The existing
same-trading-day rule SHALL remain: imputation MUST NOT carry quantity values across trading days.

#### Scenario: A leading missing quantity is back-filled
- **WHEN** the evaluation window begins with a missing quantity and a later anchor exists in the
  same trading day
- **THEN** the leading value MUST be back-filled from the nearest later anchor
- **AND** its resolution MUST be `backfilled`

#### Scenario: A trailing missing quantity is forward-filled
- **WHEN** the evaluation window ends with missing quantities
- **THEN** each trailing value MUST be forward-filled from the nearest earlier anchor in the same
  trading day
- **AND** its resolution MUST be `forwardFilled`

#### Scenario: A missing quantity does not cross trading days
- **WHEN** no same-trading-day anchor exists
- **THEN** the quantity MUST remain `unavailable`
- **AND** no value from a previous trading day MUST be carried forward

### Requirement: Indicator Fields Shall Calculate From Effective OHLC

The indicator fields (`indicator.kdj.*`, `indicator.macd.*`) consumed by evaluation-context
construction SHALL be calculated from the effective OHLC values of the projected bars rather
than the raw bar values. When effective OHLC equals raw OHLC (no imputation), indicator
results MUST be unchanged from raw-based calculation.

#### Scenario: An indicator uses imputed OHLC
- **WHEN** a projected bar's effective OHLC differs from its raw OHLC (imputed)
- **THEN** the indicator calculation MUST use the effective values
- **AND** the result MUST be finite

#### Scenario: An indicator is unchanged without imputation
- **WHEN** every bar in the calculation window has observed (non-imputed) OHLC
- **THEN** the indicator result MUST equal the raw-based calculation

### Requirement: Backtest Replay Shall Use Hydrate-Then-Append Imputation

The backtest replay engine SHALL consume the unified series imputer with a two-phase
structure: the initial window segment (the `requiredBarCount` bars preceding the first
evaluation point) SHALL be hydrated once with bidirectional imputation and frozen; each
subsequent bar SHALL be appended one at a time (forward-fill only) and evaluated. Only the
initial window segment SHALL be hydrated; remaining bars SHALL stream in pages. The initial
segment's anchors SHALL all precede or equal the first evaluation point (no look-ahead).
Evaluation timing SHALL remain unchanged: once per appended bar from `run.startDate` onward,
with an unfilled window reported as `insufficient_history`.

#### Scenario: The initial segment is hydrated bidirectionally
- **WHEN** the replay reaches its first evaluation point
- **THEN** the initial window segment SHALL be imputed bidirectionally and frozen
- **AND** a leading gap within the initial segment SHALL be back-filled from a later anchor
  in the same segment

#### Scenario: Later bars are appended only
- **WHEN** a bar after the initial segment arrives with a missing field
- **THEN** it SHALL be forward-filled from the last determined anchor
- **AND** previously frozen values MUST NOT be rewritten

