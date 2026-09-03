# chan-adjacent-bounded-channel Specification Delta

## ADDED Requirements

### Requirement: ChanCore Shall Support Adjacent Bounded Channel Central Computation

`ChanCore.createAdjacentBoundedChannels` SHALL partition a sequence of sub-level strokes (`subBis`) using the temporal
boundaries $[T_{start}, T_{end}]$ of each valid parent-level stroke (`macroBis`), and compute channel centrals
strictly within each slice.

1. **Filtering of Valid Macro Strokes**:
   Only parent-level strokes with `status === BiStatus.Valid` SHALL define bounding intervals $[T_{start}, T_{end}]$.
   Invalid candidate strokes or unknown tail strokes MUST NOT be used as bounding containers.
2. **Sub-stroke Assignment**:
   A sub-stroke $S$ belongs to macro stroke $M$ if and only if $S.startTime \ge M.startTime$ and $S.endTime \le M.endTime$.
   Sub-strokes bridging across macro stroke boundaries MUST NOT be incorporated into centrals of either slice.
3. **Internal Channel Isolation**:
   Centrals computed within macro stroke $M_k$ MUST NOT extend, merge, or expand into any strokes belonging to $M_{k-1}$
   or $M_{k+1}$.
4. **Ordered Channel Aggregation**:
   The resulting Phase A and Phase B channels from each partitioned slice MUST be aggregated in ascending order of
   `startTime` into a unified `ChanChannelTwoPhaseResult`.

#### Scenario: Sub-level centrals are strictly contained within their parent macro stroke
- **WHEN** a parent-level stroke spans from 09:30 to 11:30 and the sub-level produces multiple strokes within that window
- **THEN** `createAdjacentBoundedChannels` MUST compute sub-level centrals whose `startTime >= 09:30` and `endTime <= 11:30`
- **AND** no sub-level central is permitted to cross the 11:30 boundary into the subsequent macro stroke

#### Scenario: Macro stroke with insufficient sub-strokes yields zero centrals
- **WHEN** a strong trending macro stroke contains fewer than 5 sub-level strokes
- **THEN** `createAdjacentBoundedChannels` MUST yield zero centrals for that slice without throwing an error

#### Scenario: Empty macro strokes list returns empty channel result
- **WHEN** `macroBis` is empty or contains no valid strokes
- **THEN** `createAdjacentBoundedChannels` MUST return empty arrays for both `phaseA` and `phaseB`

### Requirement: ChanVisualAdapter Shall Support Macro Bounded Centrals

`ChanVisualAdapter.convert` SHALL accept an optional `macroBis` field in `ChanVisualOptions`. When `macroBis` is provided
and `includeZhongshu` is enabled, `ChanVisualAdapter` MUST compute sub-level centrals using `createAdjacentBoundedChannels`
instead of single-period unconstrained channel detection.

#### Scenario: Visual commands render centrals bounded by macro strokes
- **WHEN** `ChanVisualAdapter.convert` is invoked with `macroBis` containing valid higher-timeframe strokes
- **THEN** the returned `band` visual commands for `chan_zs_bi` MUST strictly align with the bounded slices defined by `macroBis`
