# cross-repo-redundancy-pruning Delta Specification

## ADDED Requirements

### Requirement: Shared Utility Single Authority
The workspace SHALL enforce single-authority reuse for all foundational domain utilities (timezone, trading day resolution, date formatting, Chan momentum forces calculation, and currency/decimal formatting), prohibiting inline or local reimplementations across backend apps, libs, and frontend components.

#### Scenario: Trading day formatting or previous trading day resolution is needed
- **WHEN** an application component needs to format a trading day as `YYYYMMDD` or resolve a previous trading day with holiday awareness
- **THEN** it MUST invoke `@app/timezone` (`TimezoneService` or `formatTradingDayString`) rather than constructing date strings or lookback loops manually.

#### Scenario: Chan unit momentum forces are computed for buy/sell points
- **WHEN** visual adapter or signal pipeline evaluates momentum forces across Bi or Duan sequences
- **THEN** it MUST invoke the shared `computeChanUnitForces` helper rather than maintaining private MACD area and peak extraction logic.

### Requirement: Over-Engineering and Dead Code Elimination
The workspace SHALL eliminate speculative wrappers, unused DTOs, and orphaned controllers that provide zero production value, adhering to the principle: "If deleting this code preserves full functionality and contracts, delete it."

#### Scenario: Residual persistence DTOs exist without database storage
- **WHEN** CRUD DTOs exist for derived-only computational models (e.g. Chan analysis)
- **THEN** they MUST be removed entirely to prevent confusion.

#### Scenario: Generic fetcher or wrapper is unconsumed in production
- **WHEN** a frontend wrapper (such as `useApi`) is only exercised by its own test suite and not by any business pages
- **THEN** it MUST be pruned in favor of standard direct client calls.
