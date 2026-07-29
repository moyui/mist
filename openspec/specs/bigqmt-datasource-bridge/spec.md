# bigqmt-datasource-bridge Specification

## Purpose
TBD - created by archiving change add-bigqmt-datasource-bridge. Update Purpose after archive.
## Requirements
### Requirement: QMT service exposes only the native production surface
The QMT datasource service SHALL expose only `/health`, native QMT bars, and
HTTP polling bridge endpoints required by the full-QMT built-in Python script.

#### Scenario: QMT service route table is inspected
- **WHEN** the QMT FastAPI app is inspected
- **THEN** it MUST expose `GET /health`
- **AND** it MUST expose `POST /v1/bars/query`
- **AND** it MUST expose `POST /qmt/bridge/owner`,
  `POST /qmt/bridge/poll`, `POST /qmt/bridge/result`, and
  `GET /qmt/bridge/health`
- **AND** it MUST NOT expose legacy QMT route groups and adapter-backed realtime quote routes, or `/qmt/bridge/ws` routes

### Requirement: QMT datasource service has independent Windows deployment
The QMT datasource SHALL be deployable as its own Windows WinSW service,
separate from the TDX datasource service and separate from full-QMT strategy
script lifecycle actions.

#### Scenario: QMT datasource service is managed by deployment automation
- **WHEN** the QMT datasource deployment workflow runs
- **THEN** it MUST manage the `mist-qmt-datasource` WinSW service on `:9002`
- **AND** it MUST start `qmt.main:app`
- **AND** it MUST check `/health` and `/qmt/bridge/health`
- **AND** it MUST NOT validate or write TDX SDK settings
- **AND** it MUST NOT create, load, register, or delete full-QMT strategy
  scripts

### Requirement: QMT bars query uses official snake_case market-data parameters
The QMT bars endpoint SHALL accept QMT native request fields shaped after
`ContextInfo.get_market_data_ex`.

#### Scenario: QMT bars request is accepted
- **WHEN** a caller posts to `:9002/v1/bars/query`
- **THEN** the request body MUST accept `fields`, `stock_list`, `period`,
  `start_time`, `end_time`, `count`, `dividend_type`, `fill_data`, and
  `include_raw`
- **AND** the request body MUST NOT accept TDX-style `symbols`, `startTime`,
  `endTime`, `dividendType`, or `fillData`
- **AND** the HTTP API MUST NOT expose `subscribe`
- **AND** the datasource MUST execute historical semantics equivalent to
  `get_market_data_ex(..., subscribe=False)`

#### Scenario: Historical period is requested
- **WHEN** a caller supplies a QMT period
- **THEN** the datasource MUST forward it unchanged to `get_market_data_ex`
- **AND** it MUST preserve any native unsupported-period failure instead of
  guessing another data source

### Requirement: QMT bars response is native marketData
The QMT bars endpoint SHALL return QMT native column-oriented market data
instead of the TDX row contract.

#### Scenario: Native bridge bars are returned
- **WHEN** the full-QMT bridge completes `get_market_data_ex`
- **THEN** the response envelope MUST set `provider` to `qmt`
- **AND** `data.marketData` MUST map stock code to `{field: {stime: value}}`
- **AND** `data.source` MUST identify the source as `native_bridge`
- **AND** the response MUST NOT include `data.bars[]` or the TDX bar row model rows

#### Scenario: Raw evidence is requested
- **WHEN** the request sets `include_raw=true`
- **THEN** the response MUST include bounded bridge evidence with the native
  method and command id
- **AND** it MUST NOT expose the owner lease token

### Requirement: QMT history has no DAT dependency
The QMT datasource SHALL NOT contain a local DAT reader or require a QMT data
directory path.

#### Scenario: Native bridge is unavailable
- **WHEN** the product bars path has no fresh bridge owner or native execution fails
- **THEN** the datasource MUST return a stable bridge error
- **AND** it MUST NOT open or parse a DAT file

#### Scenario: Service configuration is inspected
- **WHEN** operators inspect QMT datasource settings and WinSW configuration
- **THEN** no QMT DAT path or DAT reader setting MUST be present

### Requirement: Production bridge uses HTTP polling only
The full-QMT production bridge SHALL use a QMT-initiated stdlib HTTP polling
protocol.

#### Scenario: Bridge script polls for work
- **WHEN** the QMT bridge `run_time` callback fires
- **THEN** it MUST register a single owner, poll the local command gateway,
  execute commands serially, and post results back
- **AND** it MUST NOT require `handlebar` K-line callbacks or `subscribe`
  quote callbacks for command intake

#### Scenario: Bridge script is inspected
- **WHEN** static checks inspect the production QMT bridge script
- **THEN** it MUST NOT import realtime-duplex packages, `requests`, thread/process
  APIs, subprocess APIs, or unverified third-party dependencies

### Requirement: QMT historical status reflects bounded lifecycle state
The QMT historical command API SHALL distinguish active, completed, and unknown
commands while preserving the existing single-owner, one-command/one-result
bridge protocol.

#### Scenario: Command is still active
- **WHEN** status is requested for a pending or in-flight command
- **THEN** the API returns HTTP `202` with pending status

#### Scenario: Command result is retained
- **WHEN** status is requested for a completed command within result retention
- **THEN** the API returns HTTP `200` with its terminal success or failure

#### Scenario: Command is unknown or expired
- **WHEN** status is requested for an ID that is neither active nor retained
- **THEN** the API returns HTTP `404`
- **AND** it MUST NOT describe that ID as indefinitely pending

#### Scenario: Command intake is over capacity
- **WHEN** an HTTP caller submits a command that cannot be safely accepted
- **THEN** the API returns a stable structured capacity or payload error
- **AND** no native command is exposed to the terminal bridge
