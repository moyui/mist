# chan-central-extension Specification Delta

## MODIFIED Requirements
### Requirement: ChanCore Shall Resolve Channel Central Expansion At Both Levels

`ChanCore.createChannels` (Bi-level) and `ChanCore.createDuanChannels` (Duan-level) SHALL derive
Channels using a sequential confirmation lifecycle state machine:
1. Base Channel formation from valid confirmed units;
2. Extension strictly bounded by Lesson 20 touch-zone condition (`high >= ZD` AND `low <= ZG`);
3. Closure (sealing) triggered by departure with 3rd Buy/Sell-Point confirmation (`low > ZG` or `high < ZD` on callback) or 9-unit level enlargement (3+3+3 combinations);
4. Adjacent pairwise central expansion resolution per Lesson 20 Theorem 2 without unbounded transitive collapsing.

The derivation MUST NOT produce multi-month single-channel artifacts in oscillating markets.
The semantic change SHALL be released with `ChanCore.algorithmVersion` incrementing `6 → 7`.

#### Scenario: Channel extension obeys Lesson 20 touch rule
- **WHEN** a candidate or confirmed Channel in Phase B is extended with incoming units
- **THEN** incoming units MUST touch the current central zone `[zd, zg]` (`high >= zd` and `low <= zg`)
- **AND** the dynamic central zone MUST reflect the common intersection of all constituent units
- **AND** if an incoming unit completely departs the zone and the subsequent pullback does not re-enter the zone, the Channel MUST be closed and sealed immediately

#### Scenario: Channel closure via 3rd Buy/Sell Point
- **WHEN** a unit departs the central zone and the subsequent counter-unit does not touch `[zd, zg]`
- **THEN** a 3rd Buy/Sell Point condition MUST be established
- **AND** the current Channel MUST be finalized and sealed up to the last unit before departure
- **AND** subsequent units MUST be processed as independent new trend / channel candidates

#### Scenario: Channel level enlargement via 9-wave accumulation
- **WHEN** a Channel extends continuously without departure for 9 constituent units (3+3+3)
- **THEN** the Channel MUST be marked with `expanded: true`
- **AND** it MUST be closed as a completed higher-level Central

#### Scenario: Pairwise central expansion is strictly bounded
- **WHEN** two adjacent independent completed same-level Channels are evaluated for expansion
- **THEN** expansion MUST hold if and only if their central zones are strictly separated AND their wave ranges `[dd, gg]` overlap or touch
- **AND** expansion resolution MUST NOT transitively collapse non-adjacent multi-month market structures into a single composite channel
