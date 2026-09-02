# chan-central-lifecycle Specification Delta

## ADDED Requirements

### Requirement: ChanCore Shall Guard Channel Central Extension Against Trend Reversals

`ChanCore.createChannels` (Bi-level) SHALL enforce trend structure preservation during central extension (中枢延伸).
When a central extends with successive alternating pairs $(b_1, b_2)$, it MUST NOT incorporate waves that violate the
directional boundary of the originating trend structure:
1. For an **Upward Central** (originating from lower extreme $DD$), if any candidate extending unit dips below $DD$
   ($b.low < DD$), the upward central MUST be immediately sealed and terminated before the breaking unit;
2. For a **Downward Central** (originating from upper extreme $GG$), if any candidate extending unit surges above $GG$
   ($b.high > GG$), the downward central MUST be immediately sealed and terminated before the breaking unit.

#### Scenario: Downward central extension is sealed before surging above originating GG
- **WHEN** a Downward Central is extending and encounters a strong rebound whose high exceeds the central's initial $GG$
- **THEN** `createChannels` MUST immediately terminate and seal the central at the low before the surge
- **AND** the breaking surge MUST NOT be included inside the downward central

#### Scenario: Upward central extension is sealed before dipping below originating DD
- **WHEN** an Upward Central is extending and encounters a pullback whose low dips below the central's initial $DD$
- **THEN** `createChannels` MUST immediately terminate and seal the central at the high before the dip
- **AND** the breaking dip MUST NOT be included inside the upward central

## MODIFIED Requirements

### Requirement: ChanCore Shall Validate Channel Geometry Against ZD and ZG Boundaries

`ChanCore.createChannels` SHALL validate 5-bi base candidate channels using the central zone boundaries $[ZD, ZG]$
derived from the core 3-bi intersection ($ZG = \min(high_2, high_4), ZD = \max(low_2, low_4)$):
1. For an **Upward Central**:
   - The entry bi (Bi 1, Up) MUST enter from below $ZD$ ($firstBi.low < ZD$), while its peak ($firstBi.high$) is permitted
     to coincide with $ZG$;
   - The exit bi (Bi 5, Up) MUST exit above $ZG$ ($lastBi.high > ZG$), while its trough ($lastBi.low$) is permitted to
     coincide with $ZD$;
2. For a **Downward Central**:
   - The entry bi (Bi 1, Down) MUST enter from above $ZG$ ($firstBi.high > ZG$), while its trough ($firstBi.low$) is permitted
     to coincide with $ZD$;
   - The exit bi (Bi 5, Down) MUST exit below $ZD$ ($lastBi.low < ZD$), while its peak ($lastBi.high$) is permitted to
     coincide with $ZG$.

#### Scenario: Entry and exit bis touching ZD or ZG endpoints are accepted as valid base channels
- **WHEN** a 5-bi candidate window has an entry bi whose interior extreme equals $ZG$ (for Up) or $ZD$ (for Down)
- **THEN** `createChannels` MUST accept the window as a valid base channel as long as its exterior extreme is outside
  $[ZD, ZG]$ and $ZG > ZD$
