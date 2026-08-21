# strategy-market-context Specification

## Purpose
Define the realtime strategy market-data capability contract: one internal StrategyMarketDataPort consumed by Signal, source-exact windows, provider-neutral A-share quantity units, incremental hot-path evaluation, per-plan readiness, sealed-bar-only V1 observation, seam tolerance, derived-period canonical bars, bounded availability reasons and inherited error governance.
## Requirements
### Requirement: Strategy Market Data Shall Use One Internal Capability Contract
Realtime evaluation SHALL use the realtime capabilities of the internal `StrategyMarketDataPort`, sharing the
same canonical `StrategyBar`, identity, ordering and decimal semantics as backtest replay without exposing a
public unified K API.

#### Scenario: Signal consumes the common domain contract
- **WHEN** realtime market-data adapters are implemented
- **THEN** they MUST consume canonical `StrategyBar`, `StrategyMarketDataPort` and realtime criteria/result
  types owned by `evolve-strategy-evaluation-contract`
- **AND** Signal MUST implement only the MySQL/Redis/memory realtime capabilities
- **AND** it MUST NOT redefine `readReplayPage()`, import Backtest application source or make Backtest a prerequisite

#### Scenario: A worker starts with an empty window
- **WHEN** an eligible strategy group requires bounded context
- **THEN** it MUST call `loadRealtimeWindow()` with an internal `StrategyRealtimeWindowCriteria`
- **AND** the ring-window hydration MUST retain at most the approved group maximum compiled `requiredBarCount`
- **AND** the port MUST replay only current-day sealed 1m bars whose timestamp is earlier than the criteria
  `anchorAt`
- **AND** when a quantity field is consumed, that pre-anchor sequence MUST seed quantity projection without
  retaining all of it in the ring window
- **AND** the current anchor bar MUST be resolved and processed exactly once after hydration
- **AND** it MUST NOT query once per strategy

#### Scenario: A higher-period group starts with an empty window
- **WHEN** the requested realtime period is 5m, 15m, 30m or 60m
- **THEN** hydration MUST rebuild terminal derived bars from the ordered pre-anchor sealed 1m sequence
- **AND** it MUST NOT assume that market Redis directly stores higher-period bars
- **AND** it MUST NOT emit or evaluate a derived bar whose fixed boundary is later than `anchorAt`

#### Scenario: Runtime capabilities are wired
- **WHEN** `apps/signal` starts
- **THEN** it MUST wire the MySQL historical, Redis sealed and signal-owned memory capabilities required by
  realtime evaluation
- **AND** the shared contract MUST NOT require `apps/backtest` to connect to market Redis

### Requirement: Realtime Windows Shall Remain Source-Exact
Realtime market context SHALL use the accepted trigger's exact TDX or QMT source across MySQL warmup, Redis
sealed bars and the in-memory window.

#### Scenario: A realtime window is hydrated
- **WHEN** `loadRealtimeWindow()` receives a security, source, period, anchor and required bar count
- **THEN** its grouping identity MUST be `(securityId, source, period)`
- **AND** historical and current-day bars MUST use that exact source

#### Scenario: Same-source history is insufficient
- **WHEN** one execution plan lacks sufficient evidence from the required TDX or QMT source
- **THEN** only that plan MUST return `status='unavailable'`
- **AND** another plan whose own context demand is satisfied MUST remain eligible for evaluation
- **AND** the port MUST NOT fill either plan from another source or select a source by arrival order

#### Scenario: Strategy source eligibility is evaluated
- **WHEN** a trigger source is compared with `StrategyDefinition.sources`
- **THEN** the collection MUST be treated as an allowed-source set rather than a priority list
- **AND** a trigger whose source is absent MUST NOT evaluate that strategy
- **AND** EF MUST NOT be treated as a realtime trigger source

#### Scenario: Episode identity follows an exact source chain
- **WHEN** episode identity is created for realtime evaluation
- **THEN** the exact TDX or QMT source MUST participate in that identity
- **AND** one source MUST NOT suppress or reset the other source's episode
- **AND** persisted Signal identity MUST remain a separate persistence decision

#### Scenario: Internal read types are named
- **WHEN** realtime selection inputs and results are declared
- **THEN** internal selection inputs MUST use the `*Criteria` convention
- **AND** internal results MUST use domain names such as `*Window` or `*Observation`
- **AND** they MUST NOT use HTTP `*QueryDto` or `*Vo` naming

### Requirement: Strategy Bar Quantities Shall Use Provider-Neutral A-Share Units
For approved A-share stock profiles, every canonical `StrategyBar` SHALL express volume in shares and amount
in CNY yuan. Source SHALL remain part of identity and provenance but SHALL NOT change the meaning of a strategy
quantity threshold.

#### Scenario: A current-day sealed bar is mapped
- **WHEN** Signal reads a valid Redis candle produced by the candle foundation
- **THEN** it MUST validate the canonical share/yuan decimal strings or null
- **AND** it MUST NOT repeat provider unit conversion or reinterpret the value from source

#### Scenario: A historical bar is mapped
- **WHEN** MySQL returns a source-specific exact quantity string
- **THEN** the shared persistence mapper MUST normalize fixed-scale text and apply the approved source profile
  before constructing `StrategyBar`
- **AND** TDX A-share historical amount in ten-thousand-yuan MUST be multiplied exactly by `10000`
- **AND** all scaling MUST use the candle foundation's Decimal8 integer operation and range checking without
  passing through JavaScript number

#### Scenario: A quantity profile is not proven
- **WHEN** the source/runtime, security type or historical/realtime seam lacks accepted quantity-unit evidence
- **THEN** an execution plan consuming `k.volume` or `k.amount` MUST remain realtime-ineligible
- **AND** the runtime MUST NOT infer a factor from price ratios, copy an A-share factor to INDEX or return raw
  source values as canonical shares/yuan
- **AND** execution plans that do not consume quantity fields MAY continue under their own readiness gates

#### Scenario: Canonical quantity provenance is retained
- **WHEN** a bar, immutable context or persisted context snapshot records volume or amount
- **THEN** the fixed field contract MUST provide its shares-or-CNY-yuan meaning
- **AND** source plus the approved adapter contract MUST retain provider precision provenance
- **AND** V1 MUST NOT add per-bar unit or precision fields

### Requirement: Hot-Path Evaluation Shall Be Incremental
After warmup, each accepted trigger SHALL append or update only the changed market state and SHALL reuse shared
windows and analysis for all eligible strategies in the group.

#### Scenario: Multiple strategies share a security and period
- **WHEN** one new sealed bar arrives
- **THEN** the bar MUST be incorporated once
- **AND** history MUST NOT be fully reloaded for each strategy

#### Scenario: A candle-finalization trigger is resolved
- **WHEN** V1 accepts a `candle_finalized` trigger
- **THEN** `resolveRealtimeObservation()` MUST resolve only the referenced market change
- **AND** it MUST NOT reload the complete historical window
- **AND** sealed MUST return the referenced canonical 1m bar while discarded MUST return a terminal outcome
  without constructing a 1m bar

### Requirement: Indicator Windows Shall Follow The Compiled Field Contract
Realtime evaluation SHALL retain and hydrate only the group maximum compiled `requiredBarCount`, while each
Indicator observation SHALL use its field catalog's exact fixed `calculationBarCount`.

#### Scenario: A group requires fixed-window indicators
- **WHEN** eligible plans in one `(securityId,source,period)` group require `k.close`, KDJ(9,3,3) or
  MACD(12,26,9) fields
- **THEN** their ordinary calculation demands MUST be 1, 13 and 130 bars respectively
- **AND** crossover demands MUST be 2, 14 and 131 bars respectively
- **AND** one cold start or demand expansion MUST issue at most one bounded group hydration for the maximum demand

#### Scenario: A group contains a nullable quantity plan
- **WHEN** a plan references `k.volume` or `k.amount`
- **THEN** an ordinary current-value comparison MUST use `calculationBarCount=1`
- **AND** same-day quantity projection seeding MUST NOT increase the compiled ring-window demand
- **AND** cold start, restart or demand expansion MUST replay current-day sealed bars in chronological order once
  for the group rather than issue a lookup for each null or strategy
- **AND** prior-day MySQL or Redis values MUST NOT seed the projector

#### Scenario: A MACD observation is calculated on the hot path
- **WHEN** one accepted bar advances an already hydrated group to anchor `t`
- **THEN** the current MACD MUST be recalculated from exactly `K[t-129...t]`
- **AND** a crossover prior value MUST be recalculated from exactly `K[t-130...t-1]`
- **AND** all eligible plans MUST reuse the same calculation for the same algorithm version and anchor

#### Scenario: Signal restarts before the next indicator evaluation
- **WHEN** bounded hydration reconstructs the same ordered bars and execution plans
- **THEN** subsequent KDJ and MACD results MUST equal backtest results for those exact windows under the approved
  numeric tolerance
- **AND** Signal MUST NOT restore or infer an EMA/KDJ checkpoint, persist indicator state or seed from unbounded
  history

#### Scenario: A field outside the approved V1 catalog is registered
- **WHEN** a rule references an Indicator outside KDJ(9,3,3) or MACD(12,26,9), any `chan.*` path or another
  field without an approved finite `calculationBarCount`
- **THEN** the plan MUST remain ineligible at registration
- **AND** realtime MUST NOT borrow another field's window or turn the missing contract into recurring unavailable

### Requirement: Realtime Warmup Readiness Shall Be Per Execution Plan
A successful bounded realtime hydration SHALL preserve one shared group window while deciding readiness from
each execution plan's own derived context demand.

#### Scenario: Hydration returns less than the group maximum demand
- **WHEN** the shared window contains enough valid bars for one active execution plan but not another
- **THEN** the satisfied plan MUST remain eligible for evaluation
- **AND** only the insufficient plan MUST return `status='unavailable'` with the bounded reason
  `insufficient_history`
- **AND** the successful insufficient result MUST NOT trigger another MySQL query, per-strategy query,
  old-day Redis fallback or cross-source fallback

#### Scenario: Incremental bars satisfy an insufficient plan
- **WHEN** later accepted sealed bars raise the valid evidence to that plan's context demand
- **THEN** the plan MUST become eligible from the next evaluation
- **AND** the runtime MUST use the incrementally maintained shared window rather than reload complete history

#### Scenario: Warmup insufficiency is observed
- **WHEN** diagnostics record the available and required bar counts
- **THEN** those counts MAY appear as bounded operation detail
- **AND** they MUST NOT be used as high-cardinality metric labels
- **AND** this realtime requirement MUST NOT redefine backtest replay warmup behavior

### Requirement: Snapshot Observation Shall Be Outside The V1 Contract
The V1 internal market-data contract SHALL contain no snapshot observation capability and SHALL accept only
candle-finalization observation resolution.

#### Scenario: V1 receives a snapshot-update trigger
- **WHEN** a snapshot-update trigger reaches the V1 runtime
- **THEN** it MUST be rejected before market-data resolution
- **AND** it MUST NOT enter the closed-bar window, analysis, episode or persistence

#### Scenario: Snapshot support is designed in a future change
- **WHEN** unsealed-K evaluation is proposed later
- **THEN** a separate focused change MUST define its producer, canonical payload, coalescing, ordering,
  idempotency, episode and failure semantics from scratch
- **AND** this change MUST NOT predefine a provisional payload or extension point
- **AND** backtest replay MUST NOT be required to read or reproduce snapshot observations

### Requirement: Historical And Realtime Seams Shall Tolerate Missing Bars And Reject Conflicts
The context port SHALL order and deduplicate canonical bars at the MySQL, Redis and memory seam without
inventing missing bars or accepting conflicting versions of one identity.

#### Scenario: Canonical bars expose time
- **WHEN** historical or realtime market data is mapped into `StrategyBar`
- **THEN** the bar MUST expose one canonical `timestamp`
- **AND** the contract MUST NOT add unapproved `intervalStart`, `intervalEnd` or `sourceTimestamp` fields
- **AND** historical mapping MUST retain the existing provider-native `K.timestamp`
- **AND** realtime sealed mapping MUST use `bucketStartMs`

#### Scenario: Canonical bars expose completeness through one shape
- **WHEN** historical, sealed realtime or derived-period market data is mapped into `StrategyBar`
- **THEN** the bar MUST carry required `type='complete'|'incomplete'`
- **AND** historical MySQL bars and valid sealed 1m bars MUST map to `complete`
- **AND** incomplete derived bars MUST retain the same canonical identity, time, OHLC and nullable
  decimal-string quantity fields as complete bars
- **AND** the contract MUST NOT add a second incomplete result or redundant `isComplete` field

#### Scenario: Historical and realtime OHLC enter one runtime window
- **WHEN** a MySQL fixed-scale OHLC string or Redis sealed OHLC number is mapped into `StrategyBar`
- **THEN** the adapter MUST invoke the shared `KPriceProjector` before the bar enters a window
- **AND** every resulting OHLC value MUST be a finite JavaScript number
- **AND** MySQL text and Redis numbers MUST NOT create separate downstream comparison or Indicator paths

#### Scenario: Runtime price projection preserves storage ownership
- **WHEN** the shared projector accepts an approved historical or realtime OHLC representation
- **THEN** it MUST NOT round, rewrite or migrate MySQL/Redis data
- **AND** it MUST NOT change the existing Redis sealed OHLC shape or convert exact `volume/amount` strings to
  JavaScript number

#### Scenario: Historical decimal readback uses fixed-scale text
- **WHEN** the MySQL driver returns an exact quantity such as `"1.00000000"`
- **THEN** the historical mapper MUST use the shared decimal boundary to normalize it once to canonical `"1"`
  before applying the approved source unit profile and constructing `StrategyBar`
- **AND** it MUST NOT convert the value through JavaScript number
- **AND** windows, evaluators and context snapshots MUST NOT receive alternate equivalent representations

#### Scenario: Native timestamp semantics are not yet proven
- **WHEN** the supported-session TDX/QMT timestamp-label matrix has not been accepted for every enabled
  1/5/15/30/60 minute period
- **THEN** realtime strategy mode MUST NOT be promoted to on
- **AND** no reader MUST silently shift a provider timestamp or assume an unproven start/end label

#### Scenario: A timestamp-label mismatch is observed
- **WHEN** HIL proves that a provider and period label historical bars differently from realtime derived bars
- **THEN** implementation MUST pause for an explicit design and specification update
- **AND** the mismatch MUST NOT be hidden by an ad-hoc source-specific offset

#### Scenario: A realtime window crosses the historical seam
- **WHEN** a trigger for trading day D hydrates a realtime window
- **THEN** MySQL MUST provide only exact-source historical bars whose trading day is before D
- **AND** market Redis MUST provide only exact-source sealed 1m bars whose trading day is D and timestamp is
  earlier than the current trigger anchor
- **AND** higher current-day periods MUST be reconstructed by the Signal period builder from those 1m facts
- **AND** signal-owned memory MUST NOT be treated as a third authoritative data source

#### Scenario: Ordered bars contain a timestamp jump
- **WHEN** no valid bar exists for one or more theoretical time slots
- **THEN** the context port MUST preserve the ordered valid bars that do exist
- **AND** it MUST NOT synthesize a missing 1m bar, copy a prior value or return unavailable solely because of the
  timestamp jump
- **AND** lookback counts MUST refer to actual accepted valid bars rather than theoretical time slots

#### Scenario: The same canonical bar is observed again
- **WHEN** security, source, period, timestamp and all canonical `StrategyBar` content are semantically equal
  to a bar already accepted into the shared window
- **THEN** the duplicate MUST be an idempotent no-op
- **AND** it MUST NOT append another bar, recompute analysis or evaluator state, or change an episode

#### Scenario: A later bar conflicts with an accepted identity
- **WHEN** `(securityId, source, period, timestamp)` matches an accepted bar but canonical content differs
- **THEN** the accepted bar MUST remain unchanged
- **AND** the later version MUST be rejected as a data-contract conflict at the worker boundary
- **AND** it MUST NOT become unavailable, overwrite the accepted bar or fall back to another source

#### Scenario: Hydration contains conflicting versions before acceptance
- **WHEN** one bounded hydration result contains different canonical content for the same identity
- **THEN** the hydration operation MUST fail
- **AND** it MUST NOT choose a winner from incidental array order

#### Scenario: An upstream bucket is discarded
- **WHEN** candle finalization produces a discarded outcome rather than a valid sealed bar
- **THEN** the context port MUST NOT create a `StrategyBar` for that bucket
- **AND** it MUST NOT run the 1m evaluator, return 1m unavailable or directly change the 1m episode
- **AND** the finalization MUST still advance the period builder so an ended higher-period window can emit its
  approved complete, incomplete or zero-bar outcome
- **AND** a derived bar emitted by that boundary MUST follow its ordinary higher-period evaluator and episode path
- **AND** it MUST leave discard diagnostics with the owning market and monitoring boundaries
- **AND** a derived-period builder MUST treat that constituent minute as absent when determining the derived
  bar type

### Requirement: Derived Period Bars Shall Remain Canonical Consumable Bars
Realtime 5/15/30/60 minute periods SHALL be derived from sealed 1m bars in fixed A-share morning and afternoon
session slots without crossing the lunch break, and SHALL represent partial constituent coverage through the
same canonical bar contract.

#### Scenario: A derived window has not reached its boundary
- **WHEN** the fixed period window is still collecting constituents
- **THEN** its internal completeness outcome MUST remain unknown
- **AND** no `StrategyBar` with `type='unknown'` MUST be emitted

#### Scenario: A derived window reaches a terminal outcome
- **WHEN** the fixed period boundary is reached
- **THEN** the builder MUST emit at most one `complete` or `incomplete` bar according to constituent coverage
- **AND** zero available constituents MUST produce no bar
- **AND** V1 late-data rejection MUST prevent a terminal complete/incomplete bar from being revised into the
  other type

#### Scenario: The final theoretical constituent has no snapshot
- **WHEN** the candle foundation's active-listener due commits a discarded watermark for the final 1m slot
- **THEN** its `candle_finalized` trigger MUST close every derived window ending at that slot
- **AND** Signal MUST NOT require a later valid K, a local session/grace timer or a database query to close it
- **AND** the builder MUST apply the same complete, incomplete or zero-bar rule as any other terminal boundary

#### Scenario: An upstream restart leaves an unrecoverable finalization gap
- **WHEN** candle foundation explicitly cannot recover an already elapsed theoretical bucket
- **THEN** Signal MUST preserve the missing trigger rather than synthesize a finalization or historical K
- **AND** the accepted best-effort gap MUST remain observable through the owning market/handoff boundary

#### Scenario: Every constituent minute exists
- **WHEN** a derived period reaches its fixed session-aligned boundary and every required 1m bar exists
- **THEN** the builder MUST produce one canonical derived bar with `type='complete'`

#### Scenario: Some constituent minutes are absent
- **WHEN** a derived period reaches its fixed session-aligned boundary with at least one available 1m bar and
  one or more missing or discarded constituent minutes
- **THEN** the builder MUST produce one canonical derived bar with `type='incomplete'`
- **AND** the bar MUST enter the same shared window and Indicator and evaluator path as a complete bar
- **AND** runtime MUST NOT filter it, return unavailable or change episode state solely because of its type

#### Scenario: The first constituent minute is absent
- **WHEN** a fixed derived-period slot contains later 1m bars but its first theoretical minute is missing
- **THEN** the derived bar `timestamp` MUST remain the slot `bucketStartMs`
- **AND** it MUST NOT use the first or last available constituent timestamp as its canonical identity

#### Scenario: Available constituents are reduced into OHLC
- **WHEN** a complete or incomplete derived-period slot contains one or more accepted 1m bars
- **THEN** open MUST be the earliest available constituent open
- **AND** close MUST be the latest available constituent close
- **AND** high and low MUST be the extrema of only the available constituent highs and lows
- **AND** missing slots MUST NOT contribute zero, a carried-forward price, a copied neighbor, or any invented
  price

#### Scenario: Available constituents are reduced into quantities
- **WHEN** a complete or incomplete derived-period slot contains actual constituent volume or amount strings
- **THEN** each field MUST be parsed and summed independently through the candle foundation's shared scale-eight
  `Decimal8` primitive without passing through JavaScript number
- **AND** every intermediate result MUST fit `DECIMAL(36,8)` bounds before it is formatted as a canonical string
- **AND** the period builder MUST NOT implement a second parser, add a decimal dependency or serialize raw bigint
- **AND** an explicit canonical `"0"` MUST contribute zero
- **AND** a wholly missing constituent bar MUST NOT be replaced with zero
- **AND** an incomplete result with non-null quantity MUST mean the observed-constituent subtotal rather than
  claim complete-period coverage

#### Scenario: Period aggregation would require unsupported decimal arithmetic
- **WHEN** a future derived field requires multiplication, division, averaging, ratios or rounding
- **THEN** V1 MUST NOT approximate it with bigint or JavaScript number
- **AND** a focused change MUST define scale and rounding semantics before that field is implemented

#### Scenario: An actual constituent quantity is null
- **WHEN** at least one available constituent has `volume=null` or `amount=null`
- **THEN** the corresponding derived field MUST be null while the other quantity field is decided independently
- **AND** aggregation MUST NOT ignore the null, fill it with zero, or carry a prior bar into the sum
- **AND** only after the derived bar is finalized MAY the shared projector resolve that raw null from an earlier
  effective value of the same `(securityId,source,period,tradingDay)`
- **AND** the consumed field MUST receive `field_unavailable` only when that same-day derived-period seed is absent

#### Scenario: A sixty-minute period is aligned
- **WHEN** 60m bars are derived for an A-share trading day
- **THEN** their fixed windows MUST be `09:30–10:30`, `10:30–11:30`, `13:00–14:00`, and `14:00–15:00`
- **AND** no window MUST cross the lunch break

#### Scenario: No constituent minute exists
- **WHEN** a derived period reaches its boundary without any available constituent 1m bar
- **THEN** no derived `StrategyBar` MUST be produced because required OHLC cannot be formed

#### Scenario: A strategy requires one completeness type
- **WHEN** a strategy rule explicitly references `k.type`
- **THEN** the field MUST expose `complete | incomplete` and support only `eq` or `ne`
- **AND** a strategy without that condition MUST continue to consume both types

#### Scenario: A derived bar triggers a persisted signal
- **WHEN** evaluation of a complete or incomplete derived bar produces a persisted candidate
- **THEN** immutable context and persisted `contextSnapshot` MUST retain that bar's actual `type`
- **AND** they MUST retain the existing `source` and the canonical effective value actually evaluated
- **AND** `StrategyBar` MUST NOT add observed/expected counts or a per-bar precision field in V1
- **AND** provider precision MUST be interpreted from the source's approved adapter contract

#### Scenario: A realtime quantity contributes to a persisted signal
- **WHEN** a matched live evaluation consumes a current or prior quantity observation
- **THEN** the Signal `contextSnapshot` MUST use the serializer owned by
  `evolve-strategy-evaluation-contract`
- **AND** `k.volume/k.amount` MUST remain the canonical effective scalar actually evaluated
- **AND** every quantity observation required by the compiled plan MUST be represented under the applicable
  `quantityEvidence.current` or `quantityEvidence.previous` field with canonical `raw`, non-null canonical
  `effective` and `resolution='observed'|'forwardFilled'`
- **AND** the evidence set MUST be independent of `all/any` runtime short-circuit order
- **AND** the realtime runtime MUST NOT invent a second provenance shape or add evidence to `StrategyBar`

#### Scenario: A realtime quantity remains unavailable
- **WHEN** a compiled plan requires a quantity observation whose effective value remains null
- **THEN** evaluation MUST be unavailable and MUST NOT persist a Signal or `contextSnapshot`
- **AND** `unavailable` MUST NOT be serialized as a quantity-evidence resolution

#### Scenario: A constituent minute arrives after derivation
- **WHEN** a 1m bar arrives after V1 has emitted its derived bar for that fixed period
- **THEN** the late bar MUST be discarded for derived-period purposes
- **AND** the runtime MUST NOT revise, backfill or re-trigger the existing derived bar

#### Scenario: A valid bar has a nullable quantity
- **WHEN** required OHLC, identity, source, period and timestamp are valid but `volume` or `amount` is `null`
- **THEN** the complete bar MUST remain in the shared window and count as an accepted valid bar
- **AND** each nullable field MUST remain `null`
- **AND** the runtime MUST NOT remove the field, remove the bar or replace the value with zero
- **AND** an execution plan that does not consume the unavailable field MUST remain eligible

#### Scenario: A plan consumes a nullable field
- **WHEN** the current bar's approved nullable field is `null`
- **THEN** the raw current `StrategyBar` MUST remain unchanged
- **AND** `QuantityForwardFillProjector` MUST use the nearest earlier effective value in the same
  `(securityId,source,period,tradingDay)` when one exists
- **AND** evaluation MUST return `status='unavailable'` with reason `field_unavailable` only when that same-day
  earlier value does not exist
- **AND** an unavailable evaluation MUST NOT create a Signal or persisted context snapshot

#### Scenario: A later bar contains the first quantity value of the day
- **WHEN** the current consumed quantity is null and only a later bar is non-null
- **THEN** the current field MUST remain unavailable for that evaluation
- **AND** the projector MUST NOT read future bars or revise the earlier evaluation

#### Scenario: A new trading day begins without an observed quantity
- **WHEN** the first consumed quantity of a trading day is null
- **THEN** the field MUST remain unavailable until that day observes a non-null value
- **AND** the projector MUST NOT inherit the previous trading day's final quantity

#### Scenario: A canonical bar violates its required contract
- **WHEN** required OHLC, identity or timestamp is invalid, or a non-null decimal representation is malformed
- **THEN** the current trigger or hydration operation MUST fail at the worker boundary
- **AND** the invalid bar MUST NOT enter the window or be converted to evaluation unavailable

### Requirement: Realtime Context Availability Reasons Shall Remain Bounded
V1 realtime context SHALL expose only `insufficient_history` or `field_unavailable` when evaluation status is
`unavailable`; an available context SHALL return `status='evaluated'` with boolean `matched`.

#### Scenario: An execution plan lacks enough accepted bars
- **WHEN** its actual accepted valid bar count is below the internally derived context demand
- **THEN** evaluation MUST return `status='unavailable'` with reason `insufficient_history`

#### Scenario: A consumed field remains unavailable
- **WHEN** bar count is sufficient but an approved nullable or derived field has no current value
- **THEN** evaluation MUST return `status='unavailable'` with reason `field_unavailable`

#### Scenario: Realtime context is evaluable
- **WHEN** the execution plan has sufficient accepted bars and every consumed field is available
- **THEN** evaluation MUST return `status='evaluated'` with boolean `matched`
- **AND** it MUST NOT attach an unavailable reason

#### Scenario: Realtime evaluation is unavailable
- **WHEN** orchestration receives either approved unavailable reason
- **THEN** it MUST NOT create a Signal, AlertEvent or other strategy business record
- **AND** it MUST NOT convert the result to `status='evaluated', matched=false`
- **AND** metrics MUST aggregate only by the bounded reason
- **AND** field path, available/required counts and observation provenance MUST remain bounded diagnostics
  rather than high-cardinality metric labels

#### Scenario: A field is statically unsupported
- **WHEN** validation or realtime registration proves a rule field is unknown or unsupported by its target
  runtime/source
- **THEN** the strategy MUST be rejected or marked realtime-ineligible
- **AND** runtime MUST NOT represent the static contract failure as recurring unavailable

#### Scenario: Prior-day market Redis has expired
- **WHEN** trading day D begins after the candle owner expired D-1 market keys at Shanghai D 00:00
- **THEN** the context port MUST read prior-day history only from MySQL
- **AND** it MUST NOT restore, extend or reconstruct D-1 Redis state
- **AND** MySQL records for day D MUST remain excluded from the realtime window

#### Scenario: Previous-day MySQL history is absent
- **WHEN** day D begins and the required historical bar for a prior trading day is absent from MySQL
- **THEN** each execution plan MUST use its approved `insufficient_history` behavior when its actual valid bar
  count is below demand
- **AND** it MUST NOT read retained old-day Redis bars as historical fallback

### Requirement: Context Limits Shall Be Approved Before Implementation
Context demand, query deadline, missing-bar and duplicate/conflict semantics SHALL be reviewed and recorded
before the context port is implemented. Window allocation SHALL follow the accepted listener-bound dynamic
model rather than a preselected fixed bar-capacity configuration.

#### Scenario: An eligible listener group becomes active
- **WHEN** at least one eligible strategy consumes a `(securityId, source, period)` group
- **THEN** the runtime MUST create at most one shared window for that group
- **AND** its retained length MUST follow the maximum bounded context demand derived from the active execution
  plans
- **AND** it MUST NOT allocate one bar window per strategy

#### Scenario: Bars continue after the configured start time
- **WHEN** ordered bars are replayed or received incrementally
- **THEN** every accepted bar MUST be evaluated in order
- **AND** an old bar MAY be evicted only after no active execution plan requires it
- **AND** full processing MUST NOT be interpreted as permanent retention of every processed bar

#### Scenario: A listener group loses its final consumer
- **WHEN** its listener, final eligible strategy or registry generation is removed
- **THEN** the runtime MUST release that group's raw bars and derived state
- **AND** it MUST release the shared `(securityId,source)` last-finalized trigger cursor only after no period
  consumer remains for that source/security pair

#### Scenario: The first valid trigger of a new trading day is consumed
- **WHEN** its trading day differs from the Signal runtime's active trading day
- **THEN** the single worker MUST release all prior-day raw and derived windows plus Indicator and quantity
  projection state plus last-finalized trigger cursors
  before hydration or evaluation
- **AND** it MUST switch the active trading day and hydrate from prior-day MySQL plus current-day Redis under
  the approved seam
- **AND** it MUST NOT add a midnight timer or retain prior-day Redis as a fallback

#### Scenario: Realtime shadow is evaluated for promotion
- **WHEN** promotion to on is considered
- **THEN** evidence MUST include listener count, group count, raw and derived bar count, heap high-water mark,
  growth and GC behavior
- **AND** it MUST show that retained bars and heap do not continue unbounded growth after active groups stabilize
- **AND** it MUST show that final-consumer removal releases the group's raw, derived, Indicator and quantity
  projection state
- **AND** it MUST show that trading-day rollover leaves no prior-day window, analysis or episode state retained
- **AND** it MUST show no process restart caused by memory pressure during the accepted session
- **AND** missing evidence, continued growth, failed release or a memory-pressure restart MUST block promotion
- **AND** V1 MUST NOT introduce an aggregate memory budget, numeric bar cap or capacity environment variable
- **AND** any later hard limit or aggregate budget MUST be owned by a separate capacity change

### Requirement: Market Context Readers Shall Inherit Backend Error Governance
MySQL and Redis market-context readers SHALL follow the shared Mist backend error-handling governance rather
than defining strategy-specific persistence or dependency exception behavior.

#### Scenario: A reader dependency fails
- **WHEN** TypeORM, MySQL, a Redis client or its connection fails
- **THEN** the low-level reader MUST propagate the infrastructure exception
- **AND** it MUST NOT convert the failure to evaluation unavailable, retry it, read back another store or apply
  fallback
- **AND** the worker boundary MUST record and isolate the failed operation without silently reporting success

#### Scenario: A bounded read succeeds without enough bars
- **WHEN** the reader successfully returns an empty or insufficient collection
- **THEN** that result MUST NOT be classified as a database or Redis exception
- **AND** the approved realtime `insufficient_history` behavior MUST decide its meaning

#### Scenario: A read deadline is implemented
- **WHEN** the reader applies a connection, query or operation deadline
- **THEN** it MUST use the shared infrastructure configuration and cancellation behavior actually supported by
  the client
- **AND** it MUST NOT use an application-only timeout that leaves an unbounded underlying query running

#### Scenario: A context implementation task begins
- **WHEN** one of its resource or seam decisions remains open
- **THEN** implementation MUST pause

### Requirement: The Projected Strategy Bar View Shall Carry An OHLC Imputation And An Extended Resolution

The shared projected strategy bar view SHALL expose an OHLC imputation view alongside the
existing quantity views: `ohlc` with `raw` (the original four-tuple or null), `effective` (the
imputed four-tuple or null) and `resolution`. The shared `resolution` vocabulary SHALL extend to
four values: `observed | forwardFilled | backfilled | unavailable`. The raw bar SHALL never be
modified; imputation exists only in the evaluation view. Effective OHLC values SHALL be monotonic
once determined (see the imputation spec).

#### Scenario: A projected bar exposes its OHLC view
- **WHEN** a bar is projected through the shared series imputer
- **THEN** the projected bar MUST expose `ohlc.raw`, `ohlc.effective` and `ohlc.resolution`
- **AND** the raw bar's OHLC MUST be unchanged
- **AND** the resolution MUST be one of `observed | forwardFilled | backfilled | unavailable`

#### Scenario: An observed OHLC is preserved
- **WHEN** a bar has complete finite OHLC
- **THEN** `ohlc.resolution` MUST be `observed`
- **AND** `ohlc.effective` MUST equal `ohlc.raw`

#### Scenario: Quantity resolution vocabulary is extended
- **WHEN** a quantity field is back-filled from a later anchor
- **THEN** its resolution MUST be `backfilled`
- **AND** existing `observed` / `forwardFilled` / `unavailable` semantics MUST remain unchanged

### Requirement: The DSL Field Catalog Shall Read Effective OHLC Values

The DSL field catalog entries `k.open`, `k.high`, `k.low` and `k.close` SHALL read the imputed
effective OHLC four-tuple when the projected bar carries one. A bar whose effective OHLC is
`unavailable` SHALL make any referenced OHLC field unavailable (`field_unavailable`) rather
than exposing the raw non-finite value. The raw bar SHALL remain untouched; the switch exists
only in the evaluation view consumed by the DSL.

#### Scenario: A DSL OHLC field reads the effective value
- **WHEN** a projected bar has `ohlc.effective` populated and the DSL references `k.close`
- **THEN** the field value MUST be the effective close
- **AND** it MUST NOT be the raw close when the two differ

#### Scenario: An unavailable effective OHLC makes the field unavailable
- **WHEN** a projected bar has `ohlc.effective === null` and the DSL references `k.open`
- **THEN** the evaluation context MUST report `field_unavailable`
- **AND** no raw non-finite value MUST leak into the context

