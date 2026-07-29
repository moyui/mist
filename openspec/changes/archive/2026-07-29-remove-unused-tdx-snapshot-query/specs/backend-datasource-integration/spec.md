## REMOVED Requirements

### Requirement: Normalized snapshot query mapping

**Reason**: The endpoint and `TdxSource.fetchSnapshot` have no production
consumer and duplicate the dedicated terminal-bridge realtime acquisition path.

**Migration**: Product realtime consumers MUST use the formal TDX realtime
WebSocket ingress. Historical consumers MUST continue to use `/v1/bars/query`.
No on-demand snapshot replacement is provided.

## MODIFIED Requirements

### Requirement: Interface test coverage

The backend datasource integration SHALL include automated tests for supported
request shapes, response mapping, error handling, WebSocket protocol behavior,
deployment script URL resolution, and datasource WebSocket envelope behavior.

#### Scenario: HTTP unit tests cover normalized contracts

- **WHEN** backend unit tests run for `TdxSource`
- **THEN** they verify `/v1/bars/query`, successful envelope mapping, failure
  envelope handling, and invalid payload handling
- **AND** they verify `TdxSource` does not expose an on-demand snapshot method

#### Scenario: WebSocket unit tests cover datasource protocol

- **WHEN** backend unit tests run for the TDX realtime client
- **THEN** they verify `ready`, full-set `sync_subscriptions`, native snapshot,
  `stream_started`, reconnect, and error behavior

#### Scenario: Deployment script tests cover configured URL

- **WHEN** deployment script tests run
- **THEN** they verify the Windows Docker health check covers both host
  datasource health and container-to-host datasource health

#### Scenario: Datasource tests cover canonical WebSocket envelopes

- **WHEN** datasource tests run for WS protocol and quote routes
- **THEN** they verify pong timestamps, canonical error payloads, data-based
  subscription acknowledgements, and centrally serialized TDX native snapshots

#### Scenario: Removed route tests cover the stable boundary

- **WHEN** datasource route contract tests run
- **THEN** they verify `/api/tdx/*`, `/ws/quote/*`, and
  `/v1/snapshots/query` are absent
- **AND** they verify `/v1/bars/query` and the builtin realtime route remain

### Requirement: Integration documentation

The project SHALL document how the backend client connects to each supported
datasource path and how to verify that connection locally and on Windows.

#### Scenario: Developer reads backend datasource docs

- **WHEN** a developer needs to understand the backend datasource connection
- **THEN** the docs identify `TdxSource`, `QmtSource`, the TDX and QMT realtime
  clients, `TDX_BASE_URL`, `QMT_BASE_URL`, `/v1/bars/query`, the dedicated
  builtin realtime WebSockets, and the relevant test commands
- **AND** the docs MUST NOT advertise an on-demand TDX snapshot product route

#### Scenario: Operator follows Windows verification docs

- **WHEN** an operator deploys backend and datasource on Windows
- **THEN** the docs show startup order, health checks, supported normalized API
  probes, realtime proof, expected success output, and rollback path
