## ADDED Requirements

### Requirement: Channel Phase A preserves classified base candidates
The Chan channel calculation SHALL retain every detected base channel in Phase A
and SHALL classify it with the established internal-range and endpoint-extreme
rules after the initial overlap checks.

#### Scenario: Detected candidate fails a final validity rule
- **WHEN** a five-Bi candidate has a valid overlap zone but fails its internal
  range or endpoint-extreme rule
- **THEN** Phase A SHALL retain the candidate with status Invalid
- **AND** the candidate SHALL remain available for Phase B reduction

#### Scenario: Detected candidate passes all validity rules
- **WHEN** a detected candidate passes overlap, internal-range, and
  endpoint-extreme rules
- **THEN** Phase A SHALL mark the candidate Valid

### Requirement: Channel Phase B performs constrained fixed-point reduction
Channel Phase B SHALL reduce complete channel spans in shortest-span,
leftmost-first order and SHALL expose only Valid channels after reaching a fixed
point.

#### Scenario: Overlapping span contains an Invalid channel
- **WHEN** a span has same-trend endpoints, overlapping endpoint time ranges, a
  compatible combined zone, an in-envelope middle sequence, and at least one
  Invalid channel
- **THEN** Phase B SHALL replace the span with a revalidated merged channel
- **AND** it SHALL restart scanning from the shortest span

#### Scenario: Endpoint channel time ranges are separated
- **WHEN** otherwise compatible endpoint channels do not overlap in time
- **THEN** Phase B MUST NOT merge them

#### Scenario: Invalid channel remains after reduction
- **WHEN** an Invalid channel cannot participate in any permitted reduction
- **THEN** the public Phase B result SHALL omit it

### Requirement: Channel API exposes the canonical two-phase contract
`POST /v1/chan/channel` SHALL return the standard API envelope whose `data`
contains `phaseA` and `phaseB` channel arrays and SHALL document that response
in OpenAPI.

#### Scenario: Channel calculation succeeds
- **WHEN** the endpoint calculates channels from the requested K-line range
- **THEN** the response envelope's `data` SHALL contain both ordered phase arrays
- **AND** the OpenAPI 200 response schema SHALL reference the envelope and its
  two-phase response model rather than the request DTO

### Requirement: Frontend accepts legacy and canonical channel payloads
The frontend SHALL normalize both a legacy channel array and a canonical
two-phase channel object at its API and snapshot boundaries.

#### Scenario: Legacy channel array is received
- **WHEN** a live response or `channel.json` contains a bare array
- **THEN** the frontend SHALL expose that array as both Phase A and Phase B

#### Scenario: Canonical channel object is received
- **WHEN** a live response or `channel.json` contains `phaseA` and `phaseB`
  arrays
- **THEN** the frontend SHALL preserve the two arrays independently
- **AND** live chart rendering SHALL use Phase B by default

#### Scenario: Two-phase channel object is malformed
- **WHEN** either required phase is missing or is not an array
- **THEN** the frontend SHALL reject the payload instead of rendering a partial
  result

### Requirement: Channel fixtures remain frontend-owned
Backend Channel unit tests SHALL use self-contained synthetic data, while the
frontend snapshot workflow SHALL own real market channel fixtures and their
phase-specific statistics.

#### Scenario: Backend tests run in an isolated checkout
- **WHEN** the `mist` test suite runs without a sibling `mist-fe` checkout
- **THEN** Channel and Bi tests SHALL run without reading frontend fixtures

#### Scenario: Frontend snapshots are regenerated
- **WHEN** the generator recalculates a registered real snapshot from its
  committed merged-K data
- **THEN** it SHALL write canonical `{ phaseA, phaseB }` channel data
- **AND** metadata SHALL record the Phase A count, Phase B count, and compatible
  Phase B `channelCount`
