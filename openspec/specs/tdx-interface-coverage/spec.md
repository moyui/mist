# tdx-interface-coverage Specification

## Purpose
Defines the reviewed TdxQuant interface coverage matrix, exposure policy, and
non-trading implementation priorities for the TDX datasource provider.
## Requirements
### Requirement: TDX coverage matrix
The project SHALL maintain a TDX official-interface coverage matrix that
classifies every reviewed TdxQuant method by datasource exposure policy.

#### Scenario: Official method is reviewed
- **WHEN** a TdxQuant method is added to the reviewed matrix
- **THEN** the matrix records the method name, function family, exposure
  classification, source type, normalized endpoint family if any, QMT alignment
  note, risk, and smoke or contract-test strategy

#### Scenario: Method classification changes
- **WHEN** a method moves from `raw-only` or `normalized-later` to
  `normalized-now`
- **THEN** the change includes a normalized contract, tests, and a QMT
  alignment decision before product code consumes it

### Requirement: Complete non-trading data coverage
The TDX provider SHALL target broad normalized coverage for non-trading
read-data APIs while excluding trading/account execution interfaces from the
market datasource boundary.

#### Scenario: Read-data method is reviewed
- **WHEN** an official TdxQuant method returns market, reference, instrument,
  finance, report, formula, calendar, or metadata data without placing trades
- **THEN** it is classified into a normalized implementation phase unless it is
  unsafe, mutation-only, or not actually an official provider API

#### Scenario: Non-data utility method is reviewed
- **WHEN** an official TdxQuant method controls the client, sends files or
  messages, refreshes local client state, or mutates user sectors
- **THEN** it is classified as admin-only, raw-only, or do-not-expose rather
  than as an ordinary datasource endpoint

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

### Requirement: Security metadata, sectors, and calendar coverage
The TDX provider SHALL normalize security lists, sector membership, and trading
calendar capabilities in the first implementation phase before finance,
formula, or admin-only utility APIs.

#### Scenario: Sector membership is classified
- **WHEN** `get_stock_list_in_sector` is reviewed
- **THEN** it is classified as `normalized-now` through the sector-membership
  endpoint family

#### Scenario: Sector list is classified
- **WHEN** `get_sector_list` is reviewed
- **THEN** it is classified as `normalized-now` or the next near-term endpoint
  because it is required to discover valid sector inputs

#### Scenario: Trading calendar is classified
- **WHEN** `get_trading_dates` is reviewed
- **THEN** it is classified as `normalized-now` or the next near-term endpoint
  because both TDX and QMT can align to a calendar contract

#### Scenario: Security details are classified
- **WHEN** `get_stock_list`, `get_valid_stock_codes`, `get_stock_info`,
  `get_more_info`, or `get_match_stkinfo` are reviewed
- **THEN** they are classified as normalized security-metadata work with QMT
  alignment notes before backend product code uses them

#### Scenario: Reference security data is classified
- **WHEN** `get_relation`, `get_ipo_info`, `get_kzz_info`, `get_cb_info`,
  `get_trackzs_etf_info`, `get_gb_info`, `get_gb_info_by_date`, or
  `get_divid_factors` are reviewed
- **THEN** they are classified as normalized reference-data targets after core
  market, sector, calendar, and security-metadata endpoints are stable

### Requirement: Finance and report coverage
The TDX provider SHALL implement finance and report methods as normalized data
endpoint families after core market, security, sector, calendar, and reference
instrument endpoints are stable.

#### Scenario: Financial data method is reviewed
- **WHEN** `get_financial_data` or `get_financial_data_by_date` is reviewed
- **THEN** it is classified as a normalized finance-data target with a TDX
  method mapping, QMT alignment note, fixtures, and smoke or contract-test plan

#### Scenario: Report or valuation method is reviewed
- **WHEN** `get_gp_one_data`, `get_gpjy_value`, `get_gpjy_value_by_date`,
  `get_bkjy_value`, `get_bkjy_value_by_date`, `get_scjy_value`,
  `get_scjy_value_by_date`, or `get_report_data` is reviewed
- **THEN** it is classified as a normalized finance/report target and MUST NOT
  be added to product code through raw TDX calls

### Requirement: Formula coverage
The TDX provider SHALL treat formula methods as a separate normalized formula
capability instead of mixing formula payloads into ordinary market-data
endpoints.

#### Scenario: Formula storage method is reviewed
- **WHEN** `formula_format_data`, `formula_set_data`,
  `formula_set_data_info`, `formula_get_data`, `formula_get_all`, or
  `formula_get_info` is reviewed
- **THEN** it is classified as a normalized formula-data target with explicit
  input limits, output shape, and QMT alignment notes

#### Scenario: Formula execution method is reviewed
- **WHEN** `formula_zb`, `formula_xg`, `formula_exp`,
  `formula_process_mul_zb`, `formula_process_mul_xg`, or
  `formula_process_mul_exp` is reviewed
- **THEN** it is classified as a normalized formula-execution target and
  requires explicit execution limits, error mapping, and QMT alignment before
  product use

### Requirement: Subscription coverage
The TDX provider SHALL keep native subscription methods internal to the Python
datasource runtime.

#### Scenario: Subscribe method is reviewed
- **WHEN** `subscribe_hq`, `unsubscribe_hq`, or
  `get_subscribe_hq_stock_list` is reviewed
- **THEN** it is classified as `internal-only` and exposed to NestJS only
  through normalized WebSocket commands and events

#### Scenario: Alternate subscription helper is reviewed
- **WHEN** `subscribe_stocks`, `unsubscribe_stocks`, `batch_subscribe`,
  `unsubscribe_single_stock`, or `get_full_tick` is found in examples or docs
- **THEN** it is classified as `internal-only` or `normalized-later` after
  confirming whether it is an official supported method in the target TDX
  runtime

### Requirement: TDX client utility and user-sector coverage
The TDX provider SHALL prevent client-control, file, message, cache-refresh, and
user-sector mutation methods from becoming accidental product dependencies.

#### Scenario: Client utility method is reviewed
- **WHEN** `send_message`, `send_file`, `send_warn`, `send_bt_data`,
  `send_trade_warn`, `send_warnings_for_stocks`, `download_file`,
  `exec_to_tdx`, `refresh_cache`, or `refresh_kline` is reviewed
- **THEN** it is classified as `raw-only` or `do-not-expose` and MUST NOT be
  required by normal NestJS market-data flows

#### Scenario: User sector mutation method is reviewed
- **WHEN** `create_sector`, `delete_sector`, `rename_sector`, `clear_sector`,
  `get_user_sector`, or `send_user_block` is reviewed
- **THEN** read-only discovery may be considered later, but mutation methods
  are not exposed without a separate operator/admin design

### Requirement: Trading and account coverage
The TDX provider SHALL classify trading and account methods as outside the
market datasource boundary.

#### Scenario: Account method is reviewed
- **WHEN** `stock_account`, `query_stock_asset`, `query_stock_orders`, or
  `query_stock_positions` is reviewed
- **THEN** it is classified as `do-not-expose` for the market datasource

#### Scenario: Trading method is reviewed
- **WHEN** `order_stock` or `cancel_order_stock` is reviewed
- **THEN** it is classified as `do-not-expose` and requires a separate trading
  service spec before any implementation

### Requirement: TDX native HTTP validation

TDX runtime smoke SHALL validate native HTTP behavior only for supported
normalized HTTP product capabilities; realtime snapshot validation SHALL use the
dedicated terminal bridge and WebSocket HIL.

#### Scenario: Native K-line shape is validated

- **WHEN** the runtime smoke test calls native TDX HTTP `get_market_data`
- **THEN** it checks for the documented result shape including K-line field
  arrays before checking `/v1/bars/query`

#### Scenario: Native snapshot shape is validated

- **WHEN** the runtime smoke suite verifies the retired HTTP snapshot capability
- **THEN** it confirms `get_market_snapshot` and `/v1/snapshots/query` are not
  called by the normalized HTTP smoke path

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

### Requirement: Coverage artifacts stay current
The repository SHALL store the TDX coverage matrix and smoke-reference notes in
versioned files so future datasource work can continue without re-scraping the
official docs from scratch.

#### Scenario: Coverage document is updated
- **WHEN** new TDX methods are classified or reclassified
- **THEN** the repository documentation is updated with official source links,
  reviewed date, classification, endpoint family, QMT note, and test status

#### Scenario: Official docs differ from live runtime
- **WHEN** live TDX behavior differs from an official example
- **THEN** the documented fixture or smoke-reference note records the runtime
  shape and the normalizer test that covers it
