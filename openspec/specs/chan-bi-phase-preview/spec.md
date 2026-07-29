# chan-bi-phase-preview Specification

## Purpose
规定 Chan 测试快照和 `/chan-tests` 页面如何保存、加载、切换并展示 Bi Phase A
与 Phase B 结果，同时维持旧快照的读取兼容性。

## Requirements
### Requirement: Chan test snapshots preserve both Bi phases
The Chan test snapshot workflow SHALL represent Bi data as an object with
`phaseA` and `phaseB` arrays and SHALL preserve existing array-form snapshots
by normalizing the same array into both phases.

#### Scenario: Canonical Phase A/B snapshot is loaded
- **WHEN** a Chan test case contains a `bi.json` object with `phaseA` and
  `phaseB` arrays
- **THEN** the loader SHALL expose both arrays to the chart conversion path
- **AND** it SHALL preserve their order and entries without merging them in the
  frontend

#### Scenario: Legacy array snapshot is loaded
- **WHEN** a Chan test case contains the previous array-form `bi.json`
- **THEN** the loader SHALL expose that array as both `phaseA` and `phaseB`
- **AND** the test case SHALL remain renderable without regenerating its other
  fixture files

#### Scenario: Phase-aware snapshot is malformed
- **WHEN** a `bi.json` object omits either phase or supplies a non-array phase
- **THEN** the loader SHALL reject that snapshot through the existing
  unavailable-snapshot error path
- **AND** it SHALL NOT silently render a partial Bi overlay

### Requirement: Chan test console selects one inspectable Bi phase
The `/chan-tests` page SHALL render a single Bi overlay selected from the
loaded Phase A and Phase B arrays, with Phase B selected by default.

#### Scenario: Page opens a phase-aware case
- **WHEN** a reviewer opens `/chan-tests` for a case with both phases
- **THEN** the page SHALL select and provide the Phase B Bi array to `KPanel`
- **AND** it SHALL present controls labelled `Phase A 原始` and `Phase B 归约`
- **AND** the selected control SHALL expose `aria-pressed="true"`

#### Scenario: Reviewer switches to Phase A
- **WHEN** a reviewer activates the `Phase A 原始` control
- **THEN** the page SHALL provide the Phase A Bi array to `KPanel`
- **AND** the Phase A control SHALL become the only pressed phase control
- **AND** the K-line, merged-K, fenxing, and channel inputs SHALL remain those
  of the selected test case

#### Scenario: Reviewer changes test case after selecting a phase
- **WHEN** a reviewer selects a different registered test case after choosing
  a phase
- **THEN** the page SHALL retain that phase selection for the newly selected
  case
- **AND** it SHALL render an empty selected Bi array as an empty overlay rather
  than treating the whole snapshot as unavailable

### Requirement: Chan test statistics expose Phase A and Phase B counts
The `/chan-tests` statistics SHALL display the count for each Bi phase while
preserving legacy metadata compatibility.

#### Scenario: Phase-specific snapshot metadata is available
- **WHEN** a selected snapshot provides `phaseABiCount` and `phaseBBiCount`
- **THEN** the page SHALL display both values in its statistics panel
- **AND** the existing `biCount` metadata SHALL remain the Phase B count

#### Scenario: Legacy snapshot metadata is available
- **WHEN** a selected snapshot has only the previous `biCount` field
- **THEN** the page SHALL use that value as a compatible count for both phase
  labels
- **AND** it SHALL not hide the phase comparison controls

### Requirement: Snapshot generation records the current phase-aware result
The Chan snapshot generator SHALL accept legacy arrays or phase-aware Chan API
responses for both Bi and channel data, and SHALL write canonical phase-aware
fixture data with compatible count metadata.

#### Scenario: Generator receives a phase-aware backend response
- **WHEN** the configured Chan backend returns `{ phaseA, phaseB }` for a
  registered case
- **THEN** the generator SHALL write those two arrays to the corresponding Bi
  or channel snapshot file
- **AND** it SHALL write the compatible count equal to the Phase B count
- **AND** it SHALL record the corresponding Phase A and Phase B counts

#### Scenario: Shanghai regression snapshot is regenerated
- **WHEN** the current algorithm regenerates the Shanghai-index test case
- **THEN** its Bi Phase A data SHALL include `2024-10-07 → 2024-10-15 down`
  marked Invalid
- **AND** its Bi Phase B data SHALL include `2024-10-07 → 2025-01-12 down`
  marked Valid

#### Scenario: Channel snapshot is regenerated from merged-K data
- **WHEN** offline snapshot generation recalculates channels for a registered
  case
- **THEN** it SHALL replace the legacy channel array with a canonical
  `{ phaseA, phaseB }` object
- **AND** it SHALL preserve the existing K, merged-K, and fenxing snapshot files
