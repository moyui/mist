## ADDED Requirements

### Requirement: Live market views consume backend product APIs

The frontend SHALL display current-day one-minute candles and latest snapshot state only from Mist backend APIs.

#### Scenario: Current-day K view is opened

- **WHEN** the backend reports productization data available
- **THEN** the chart MUST render only valid provisional closed candles from the unified ordered series
- **AND** it MUST display source, freshness, event time, captured time, and quality for the latest snapshot
- **AND** missing or discarded minutes MUST remain absent from the series rather than being synthesized
- **AND** it MAY display recent product discard/degraded status without maintaining a minute-continuity state

#### Scenario: Productization is unavailable

- **WHEN** the backend reports productization mode off or degraded
- **THEN** the frontend MUST show the explicit data state
- **AND** it MUST NOT connect directly to Redis or datasource realtime routes
