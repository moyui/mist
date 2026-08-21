## MODIFIED Requirements

### Requirement: Existing Chan Output Shall Remain Unchanged By Duan Introduction

Introducing Duan SHALL NOT alter the output of the existing `mergeK/findFenxings/createBi/createChannels`
facades. `ChannelLevel.Duan` is wired by the Duan-level Channel change (`createDuanChannels`), not by the Duan
change itself.

#### Scenario: Existing facades are replayed after Duan introduction
- **WHEN** the same approved ordered input is supplied to `mergeK/findFenxings/createBi/createChannels`
- **THEN** their output MUST equal the pre-Duan full-output fingerprint exactly
- **AND** `ChanCore.algorithmVersion` MUST remain `1`

#### Scenario: The Duan-level Channel enum is wired by the Duan-level Channel change
- **WHEN** the Duan-level Channel (段级中枢) change introduces `createDuanChannels`
- **THEN** `ChannelLevel.Duan` MUST be used as the `level` of Duan-level Channels emitted by
  `createDuanChannels`
- **AND** the Bi-level Channel scope requirement (`createChannels` produces `level=bi` only) MUST remain
  unchanged
