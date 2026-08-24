## ADDED Requirements

### Requirement: Chan Bsp Strategies Shall Be A Distinct Strategy Kind With A Declarative Configuration

A strategy definition with `kind=chan_bsp` SHALL carry a rule object `{ units, points,
direction }` where `units` selects the structural unit level (`bi` or `duan`), `points`
selects which of the three point types are enabled (`first`/`second`/`third`), and `direction`
selects buy/sell reporting (`buy`, `sell` or `both`). The evaluation level SHALL be the
single `periods` value of the definition, restricted to the realtime periods
(1/5/15/30/60 minutes). The configuration SHALL NOT carry a minimum-bar setting: the window
budget is an internal detector constant and the detector's output semantics are simply
"this is a first/second/third buy/sell point". Day-level and longer periods SHALL be rejected
for the realtime evaluation kind.

#### Scenario: A chan_bsp strategy is configured
- **WHEN** a caller creates a strategy definition with `kind='chan_bsp'`
- **THEN** the rule MUST be `{ units, points, direction }`
- **AND** `units` MUST be `bi` or `duan`
- **AND** at least one of `points.first`/`points.second`/`points.third` MUST be true
- **AND** `direction` MUST be `buy`, `sell` or `both`
- **AND** `periods` MUST be exactly one value in {1, 5, 15, 30, 60}

#### Scenario: A chan_bsp strategy with invalid configuration is rejected
- **WHEN** a chan_bsp rule is invalid (unknown units, empty points, invalid direction) or
  `periods` has more than one value or a non-realtime period
- **THEN** the configuration MUST be rejected through the existing validation envelope
- **AND** the registry MUST refuse to compile it

### Requirement: Chan Bsp Evaluation Shall Be A Stateless Window To Events Detector

The engine SHALL evaluate a `chan_bsp` plan through a stateless detector: given a realtime
window of `StrategyBar`s (loaded through the shared realtime market-data port) and the plan,
the detector SHALL return ALL confirmed points in the window as events — no mutation, no
cross-call state. The detector SHALL internally run the Chan pipeline (merge, fenxing, bi,
duan when configured, channels, momentum forces via the shared indicator core) and the shared
`detectBuySellPoints` pure function. The detector SHALL filter output by the plan's `points`
and `direction`. When the window or structure is insufficient to confirm any point, the
detector SHALL return an empty list — insufficient structure is not an error.

#### Scenario: A window is evaluated
- **WHEN** the detector receives a window and a chan_bsp plan
- **THEN** it MUST return every confirmed point in the window as a `ChanBspEvent`
- **AND** only points enabled by the plan's `points` and `direction` MUST be returned
- **AND** the same window and plan MUST produce the same result on every call (deterministic)

#### Scenario: An insufficient window is evaluated
- **WHEN** the window cannot confirm any point (too few bars, no trend structure, no divergence)
- **THEN** the detector MUST return `[]`
- **AND** an empty result MUST NOT be represented as an error

### Requirement: Chan Bsp Events Shall Carry Confirmation Semantics

A `ChanBspEvent` SHALL identify one confirmed point: the type (`first_buy`/`first_sell`/
`second_buy`/`second_sell`/`third_buy`/`third_sell`), the structural unit level (`bi`/`duan`),
the confirmation time (the end of the confirming unit), the price (the confirming unit's low
for buys / high for sells), the related channel index and its upper/lower bounds when
applicable, and the confirming unit index.

#### Scenario: A confirmed point is mapped to an event
- **WHEN** a confirmed point is emitted
- **THEN** the event MUST carry the point type, unit level, confirmation time, price and
  confirming unit index
- **AND** for first/third-type points the related channel index and zg/zd bounds MUST be
  resolved from the channel sequence
- **AND** for second-type points (which are not channel-bound) the channel fields MUST be null

### Requirement: Chan Bsp Emission Shall Be Incremental With A Monotonic Cursor

The engine SHALL emit only newly confirmed points: per `(definitionId, securityId, source,
level, units)` it SHALL keep a monotonic cursor over the confirming unit index and emit only
events whose unit index advances the cursor. Points that disappear and reappear due to
structure evolution (e.g. channel extension invalidating a third-type point) MUST NOT be
re-emitted. The cursor SHALL reset on trading-day rollover and SHALL be pruned together with
the registry scopes on registry reconciliation.

#### Scenario: A new point is confirmed
- **WHEN** the detector returns events and at least one event has a unit index greater than
  the cursor
- **THEN** those events MUST be emitted
- **AND** the cursor MUST advance to the greatest emitted unit index

#### Scenario: A previously confirmed point disappears and reappears
- **WHEN** structure evolution removes a confirmed point and a later evaluation confirms the
  same structure again
- **THEN** no event MUST be emitted for the reappeared point (the unit index does not advance)
- **AND** the reappearance MUST NOT reset or regress the cursor
