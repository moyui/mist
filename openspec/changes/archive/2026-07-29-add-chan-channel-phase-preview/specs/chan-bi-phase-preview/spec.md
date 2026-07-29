## MODIFIED Requirements

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
