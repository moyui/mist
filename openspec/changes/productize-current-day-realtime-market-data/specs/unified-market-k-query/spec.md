## ADDED Requirements

### Requirement: One market-K boundary merges historical and current-day data

Mist consumers SHALL obtain market K data through one backend query boundary that routes by `Asia/Shanghai` natural day.

#### Scenario: Query covers only past days

- **WHEN** a `Period.ONE_MIN` query ends before the current natural day
- **THEN** the boundary MUST read only source-specific MySQL history

#### Scenario: Query covers the current day

- **WHEN** a `Period.ONE_MIN` query includes the current natural day and productization mode is `on`
- **THEN** historical dates MUST come from MySQL and current-day candles MUST come from Redis
- **AND** results MUST be sorted by timestamp and deduplicated by `source + security + period + timestamp`

#### Scenario: Query requests a higher period

- **WHEN** a caller requests a period other than one minute
- **THEN** the boundary MUST continue to use the existing MySQL history path
- **AND** it MUST NOT synthesize that period from Redis in this change

### Requirement: All market-data consumers share the routing boundary

Indicator calculation, K-line APIs, and Chan input SHALL reuse the unified market-K boundary rather than implementing separate hot/cold merges.

#### Scenario: Consumer requests cross-day context

- **WHEN** any supported consumer requests a range crossing the natural-day boundary
- **THEN** it MUST receive the same ordered, deduplicated series from the shared boundary
