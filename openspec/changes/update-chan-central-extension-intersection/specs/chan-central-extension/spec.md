# chan-central-extension Specification Delta

## Requirements
### Requirement: ChanCore Shall Resolve Channel Central Expansion At Both Levels

#### Scenario: Channel extension computes dynamic common intersection bounds
- **WHEN** either `createChannels` or `createDuanChannels` extends a base Channel by constituent units during Phase B
- **THEN** the central zone bounds (`zd` and `zg`) MUST be updated to the common overlapping intersection of all constituent units (`zd = max(all lows)`, `zg = min(all highs)`)
- **AND** extension is permitted only as long as the new window maintains a valid common intersection (`zg > zd`)
- **AND** the wave range extrema (`dd = min(all lows)`, `gg = max(all highs)`) and boundary IDs/timestamps MUST reflect the full extended window

#### Scenario: Existing Chan output and algorithm version change together
- **WHEN** extension intersection semantics change at both levels
- **THEN** the output of `mergeK/findFenxings/createBi/createDuan` MUST equal the pre-change full-output fingerprint exactly
- **AND** `ChanCore.algorithmVersion` MUST increment from `3` to `4` and the full-output fingerprint MUST be updated and explained in the same owning change
