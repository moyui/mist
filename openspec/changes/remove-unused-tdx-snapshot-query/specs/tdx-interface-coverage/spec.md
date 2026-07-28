## MODIFIED Requirements

### Requirement: Core market data coverage

The TDX provider SHALL expose normalized market-data methods only when an owned
product consumer exists, while terminal-owned realtime acquisition SHALL remain
on the dedicated bridge path.

#### Scenario: K-line data is classified

- **WHEN** `get_market_data` is reviewed
- **THEN** it is classified as `normalized-now` through `/v1/bars/query` and
  must preserve support for native TDX HTTP shape variants such as `Value`
  wrappers

#### Scenario: Snapshot data is classified

- **WHEN** `get_market_snapshot` is reviewed
- **THEN** terminal-local use is classified as realtime bridge acquisition
- **AND** it MUST NOT be exposed as `/v1/snapshots/query`

#### Scenario: Secondary quote methods are classified

- **WHEN** `get_pricevol` or `get_benchmark_data` are reviewed
- **THEN** they are classified as normalized market-data candidates only after
  an owned consumer and live behavior are established

#### Scenario: Example helper is found

- **WHEN** `get_real_time_data` is found in official example code
- **THEN** it is classified as `example-helper-not-api` unless a native
  `tq.get_real_time_data` API is verified in the target TDX runtime

### Requirement: TDX native HTTP validation

TDX runtime smoke SHALL validate native HTTP behavior only for supported
normalized HTTP product capabilities; realtime snapshot validation SHALL use the
dedicated terminal bridge and WebSocket HIL.

#### Scenario: Native K-line shape is validated

- **WHEN** the runtime smoke test calls native TDX HTTP `get_market_data`
- **THEN** it checks for the documented result shape including K-line field
  arrays before checking `/v1/bars/query`

#### Scenario: Realtime snapshot shape is validated

- **WHEN** TDX realtime HIL runs
- **THEN** it verifies terminal-local `get_market_snapshot` acquisition,
  bridge acceptance, WebSocket delivery, and backend ingress
- **AND** it MUST NOT call `/v1/snapshots/query`

#### Scenario: Native sector shape is validated

- **WHEN** the runtime smoke test calls native TDX HTTP
  `get_stock_list_in_sector`
- **THEN** it checks that a non-empty list or documented value wrapper is
  returned before checking the normalized sector endpoint
