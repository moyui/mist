# tdx-provider-boundaries Specification

## Purpose
Define the TDX provider boundary: a stable facade, capability-scoped implementation and isolated native response normalization separate from provider orchestration.
## Requirements
### Requirement: TDX provider facade remains stable

The datasource SHALL keep `src.datasource.tdx_provider.TdxDatasourceProvider` as the public normalized provider facade while allowing its implementation to delegate to smaller internal capability modules.

#### Scenario: Normalized routes use the existing facade

- **WHEN** normalized `/v1/*` routes call TDX product operations
- **THEN** they MUST continue to receive a `TdxDatasourceProvider` facade from route dependencies
- **AND** they MUST NOT import capability-specific operation classes directly

#### Scenario: Collector uses the existing snapshot method

- **WHEN** the WebSocket collector needs fresh quote snapshots
- **THEN** it MUST continue to call the facade-level snapshot method used before the refactor
- **AND** the returned normalized snapshot shape MUST remain unchanged

### Requirement: Provider implementation is capability scoped

The TDX provider implementation SHALL split product operations into focused capability modules instead of accumulating all behavior in one monolithic provider file.

#### Scenario: Market capability is implemented

- **WHEN** market operations such as bars, snapshots, and price-volume are implemented
- **THEN** their HTTP/RPC parameter mapping and provider method bodies MUST live in a market-scoped module
- **AND** `tdx_provider.py` MUST delegate through the facade rather than owning the full market implementation

#### Scenario: Formula capability is implemented

- **WHEN** formula formatting, metadata, execution, or batch execution operations are implemented
- **THEN** formula timeout handling and formula-specific operation mapping MUST live in a formula-scoped module
- **AND** tests MUST cover timeout and request-limit behavior through the public facade

#### Scenario: Financial and reference capabilities are implemented

- **WHEN** finance, security, sector, IPO, share-capital, dividend, convertible-bond, or ETF operations are implemented
- **THEN** each operation MUST belong to a focused domain module
- **AND** adding a new operation in one domain MUST NOT require editing unrelated domain operation modules

### Requirement: Native response normalization is isolated from provider orchestration

TDX native response unwrapping, field alias lookup, symbol matching, and domain normalization SHALL live outside the provider facade and SHALL be testable as pure or mostly pure helpers.

#### Scenario: Domain normalizer handles native shapes

- **WHEN** a provider operation receives a supported TDX native payload shape
- **THEN** the corresponding domain normalizer MUST convert it to the normalized datasource shape
- **AND** the normalizer test MUST cover the native shape without creating an HTTP client

#### Scenario: Missing requested symbol is detected

- **WHEN** a native response is wrapped in a supported shape but does not contain the requested symbol
- **THEN** the normalizer or lookup helper MUST raise the existing structured datasource error
- **AND** it MUST NOT return the entire native payload as a fallback

### Requirement: TDX runtime has one provider and one realtime bridge boundary

The datasource SHALL expose normalized product REST routes backed by official
TDX HTTP and a dedicated builtin realtime bridge without an in-process SDK
adapter.

#### Scenario: Legacy REST and adapter code are inspected

- **WHEN** the FastAPI app and production source tree are inspected
- **THEN** `/api/tdx/*`, `adapter_legacy`, and `tdx_legacy` MUST NOT exist
- **AND** no runtime mode switch may restore those paths

#### Scenario: Normalized REST route files are registered

- **WHEN** the FastAPI app registers normalized TDX product routes
- **THEN** those modules MUST live under a normalized v1 route package
- **AND** they MUST keep the existing `/v1/*` paths and provider-backed dependency boundary

#### Scenario: WebSocket route remains a separate runtime boundary

- **WHEN** the FastAPI app registers the TDX realtime WebSocket
- **THEN** it MUST remain outside the normalized REST package
- **AND** it MUST use the builtin bridge gateway and its dedicated WebSocket
  manager without legacy collector dependencies

### Requirement: Capability metadata distinguishes provider and native methods

The provider manifest SHALL distinguish normalized provider facade methods from native TDX backing methods.

#### Scenario: Provider capability is serialized

- **WHEN** `GET /providers` returns a TDX capability
- **THEN** `providerMethods` MUST list callable normalized provider facade method names
- **AND** `nativeMethods` MUST list TDX native HTTP, SDK, or RPC backing method names when known

#### Scenario: Unsupported provider capability is serialized

- **WHEN** a provider capability is unsupported or planned
- **THEN** `providerMethods` and `nativeMethods` MUST accurately describe callable methods as empty or planned
- **AND** `unsupportedReason` MUST remain available for unsupported capabilities

### Requirement: Boundary tests protect route and provider structure

The datasource SHALL include automated tests that fail when route families, provider facade ownership, or capability metadata semantics regress.

#### Scenario: Route families are checked

- **WHEN** datasource repository hygiene or route contract tests run
- **THEN** they MUST verify legacy REST, normalized REST, and WebSocket route code remain in separate packages
- **AND** they MUST verify the registered external paths remain unchanged

#### Scenario: Provider facade imports are checked

- **WHEN** provider boundary tests run
- **THEN** they MUST verify public callers can still import and use `TdxDatasourceProvider`
- **AND** they MUST verify routes do not import internal capability operation classes directly
