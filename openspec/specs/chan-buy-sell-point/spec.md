# chan-buy-sell-point Specification

## Purpose
Define buy/sell point (买卖点) detection as a shared pure ChanCore function: first-, second- and
third-type buy/sell points derived from unit (Bi or Duan) and Channel sequences with caller-computed
force values, without ChanCore computing momentum indicators itself.
## Requirements
### Requirement: ChanCore Shall Detect Buy And Sell Points As A Shared Pure Function

ChanCore SHALL expose a stateless `detectBuySellPoints(input)` facade that detects first-, second-
and third-type buy/sell points (一/二/三类买卖点) as a shared pure function reusable across Bi-level
and Duan-level structures. The input SHALL carry the unit sequence (Bi or Duan, including per-unit
high/low prices), the Channel sequence (Bi-level or Duan-level) and caller-computed per-unit force
values; ChanCore SHALL NOT compute MACD or any momentum indicator itself. The output SHALL cover
all three point types symmetrically for buy and sell.

#### Scenario: A caller requests buy/sell point detection
- **WHEN** a caller requests buy/sell point output
- **THEN** it MUST invoke `ChanCore.detectBuySellPoints` with a `ChanBspInput`
- **AND** the input MUST include the unit sequence (with high/low), the Channel sequence and
  per-unit force values
- **AND** ChanCore MUST NOT compute momentum indicators (the caller supplies force values)
- **AND** the recommended force source is the shared indicator computation core (`@app/indicators`)

#### Scenario: Units and Channels of either level are accepted
- **WHEN** a caller supplies Bi units with Bi-level Channels
- **THEN** `detectBuySellPoints` MUST accept them through the minimal structural interfaces
- **WHEN** a caller supplies Duan units with Duan-level Channels
- **THEN** `detectBuySellPoints` MUST accept them through the same minimal structural interfaces

#### Scenario: An empty input is evaluated
- **WHEN** `detectBuySellPoints` receives an input with no units
- **THEN** it MUST return `[]`
- **AND** no empty result MUST be represented as a database, contract or algorithm error

### Requirement: First-Type Points Shall Derive From Trend Divergence

A first-type buy point (一买) or sell point (一卖) SHALL be produced for each **trend** divergence
(the divergence of the last Channel of a same-direction Channel chain). Consolidation divergence
(occurring inside a Channel's oscillation) MUST NOT produce a first-type point — buy/sell points
inside a Channel belong to the second type. The direction SHALL be the trend of the leaving unit: a
leaving unit trending down produces a first-type buy point, and a leaving unit trending up produces
a first-type sell point. The point SHALL be located at the end of the leaving unit and SHALL carry
the leaving unit's low (buy) or high (sell) as its price.

#### Scenario: A trend divergence produces a first-type point
- **WHEN** a trend divergence is detected on a Channel whose leaving unit trends down
- **THEN** a first-type buy point MUST be reported at the leaving unit's index with the leaving
  unit's low as price
- **WHEN** a trend divergence is detected on a Channel whose leaving unit trends up
- **THEN** a first-type sell point MUST be reported at the leaving unit's index with the leaving
  unit's high as price

#### Scenario: A consolidation divergence does not produce a first-type point
- **WHEN** only a consolidation divergence is detected on a Channel
- **THEN** no first-type point MUST be produced from it
- **AND** buy/sell points inside the Channel's oscillation MUST be classified as second-type points
  when their structural conditions hold

#### Scenario: No force values are supplied
- **WHEN** the input force array is empty
- **THEN** no first-type point MUST be produced
- **AND** second- and third-type points MUST still be produced when their structural conditions hold

### Requirement: Second-Type Points Shall Be Structural And Require A First-Type Precondition

A second-type buy point (二买) or sell point (二卖) SHALL be produced from an adjacent triple of
consecutive units **whose first unit is a confirmed first-type point** (a first-type buy point for
a buy, a first-type sell point for a sell). The confirmation SHALL be a structural comparison
inside the Channel's oscillation and MUST NOT require any divergence or force check. A
`down → up → down` triple whose pullback unit's low is strictly higher than the first down unit's
low SHALL produce a second-type buy point; an `up → down → up` triple whose pullback unit's high is
strictly lower than the first up unit's high SHALL produce a second-type sell point. Second-type
points SHALL NOT be associated with any Channel.

#### Scenario: A first-type precondition is required
- **WHEN** three consecutive units form the required down-up-down or up-down-up structure
- **THEN** a second-type point MUST be reported ONLY IF the first unit of the triple is a
  confirmed first-type point of the same side
- **AND** without such a first-type precondition the triple MUST NOT produce a second-type point
  even when the structure holds

#### Scenario: A down-up-down triple confirms a second-type buy point
- **WHEN** the first unit is a first-type buy point, the triple trends down, up, down and the last
  unit's low is strictly greater than the first unit's low
- **THEN** a second-type buy point MUST be reported at the last unit's index with its low as price
- **AND** its Channel association MUST be null

#### Scenario: An up-down-up triple confirms a second-type sell point
- **WHEN** the first unit is a first-type sell point, the triple trends up, down, up and the last
  unit's high is strictly less than the first unit's high
- **THEN** a second-type sell point MUST be reported at the last unit's index with its high as price
- **AND** its Channel association MUST be null

#### Scenario: The comparison is strict
- **WHEN** the pullback unit's low equals the first unit's low (or the high equals for sell)
- **THEN** no second-type point MUST be reported

#### Scenario: No divergence or force is required
- **WHEN** the input force array is empty
- **THEN** second-type points MUST still be produced when the structural conditions and the
  first-type precondition hold

### Requirement: Third-Type Points Shall Be Geometric

A third-type buy point (三买) or sell point (三卖) SHALL be produced from a Channel's leaving unit
and its immediately following pullback unit, following the lesson-20 third buy/sell point theorem:
a buy point requires an up leaving unit followed by a down pullback unit whose low is strictly ABOVE
the Channel's upper edge (zg); a sell point requires a down leaving unit followed by an up pullback
unit whose high is strictly BELOW the Channel's lower edge (zd). The comparison SHALL be strict:
a pullback touching the Channel edge exactly SHALL NOT qualify (touching the edge means re-entering
the Channel per the lesson-20 center theorem — interval overlap includes edge contact, so the
Channel is still extending and has not ended). A Channel without an adjacent pullback unit SHALL be
skipped. An expansion-merged Channel (`expanded=true`) SHALL be treated like any ordinary Channel.

#### Scenario: A pullback strictly above the Channel upper edge confirms a third-type buy point
- **WHEN** a Channel is followed by an up leaving unit and a down pullback unit whose low is
  strictly greater than the Channel's zg
- **THEN** a third-type buy point MUST be reported at the pullback unit's index with its low as price
- **AND** the point MUST carry the Channel's index

#### Scenario: A pullback strictly below the Channel lower edge confirms a third-type sell point
- **WHEN** a Channel is followed by a down leaving unit and an up pullback unit whose high is
  strictly less than the Channel's zd
- **THEN** a third-type sell point MUST be reported at the pullback unit's index with its high as price
- **AND** the point MUST carry the Channel's index

#### Scenario: A Channel without a leaving or pullback unit is skipped
- **WHEN** a Channel has no leaving unit or no immediately following pullback unit
- **THEN** it MUST be skipped and MUST NOT produce a third-type point

#### Scenario: The comparison is strict
- **WHEN** the pullback unit's low equals the Channel's zg (or the high equals the zd for sell)
- **THEN** no third-type point MUST be reported (touching the edge = re-entering the Channel =
  the Channel is still extending, so the third-type point is not formed)

### Requirement: Results Shall Be Ordered, Deterministic And Non-Mutating

`detectBuySellPoints` SHALL return its results ordered by unit index (ascending), then point type
(enum declaration order), then Channel index (ascending, null last). Each second- and third-type
point SHALL carry a reference to the nearest preceding first-type point of the same side
(`firstTypeIndex`), or null when none exists. Repeated calls with the same input SHALL return the
same structure, values and ordering, and the input SHALL NOT be mutated.

#### Scenario: Results are ordered
- **WHEN** `detectBuySellPoints` returns its results
- **THEN** they MUST be ordered by unit index ascending, then type ascending, then Channel index
  ascending with null last

#### Scenario: Preceding first-type references are resolved
- **WHEN** a second- or third-type point has a preceding first-type point of the same side
- **THEN** its `firstTypeIndex` MUST reference that nearest preceding first-type point's index in
  the result array
- **WHEN** no such preceding first-type point exists
- **THEN** `firstTypeIndex` MUST be null

#### Scenario: Results are deterministic and non-mutating
- **WHEN** `detectBuySellPoints` is called repeatedly with the same input
- **THEN** it MUST return the same structure, values and ordering
- **AND** the input MUST NOT be mutated

