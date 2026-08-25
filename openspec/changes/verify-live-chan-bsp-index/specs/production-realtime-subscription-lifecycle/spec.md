## MODIFIED Requirements

### Requirement: Realtime assignments persist one immutable route per security

Mist SHALL persist realtime subscription routing separately from historical source selection. Each assignment MUST reference exactly one STOCK or INDEX Security and one enabled TDX or QMT `SecuritySourceConfig` belonging to that Security; its source config, source, provider symbol and enabled state MUST become immutable after initialization. Assignment persistence MUST NOT contain a second desired boolean: an assigned Security is desired exactly when `Security.status=ACTIVE`.

#### Scenario: A new security assignment is initialized

- **WHEN** an operator submits a valid new ACTIVE STOCK or INDEX Security and exact TDX/QMT provider symbol
- **THEN** backend MUST create the Security, source config and routing assignment in one short database transaction
- **AND** the public result MUST map the persisted entities to a realtime subscription VO

#### Scenario: An existing source config is assigned

- **WHEN** an operator selects an enabled TDX/QMT source config belonging to an ACTIVE STOCK or INDEX Security without an assignment
- **THEN** backend MUST create exactly one routing assignment for that Security and source config
- **AND** it MUST NOT copy or infer another provider symbol

### Requirement: Realtime subscription management uses bounded version-first HTTP contracts

Backend SHALL expose `/v1/realtime-subscriptions` GET/POST through shared HTTP envelopes, explicit DTO/VO mappings and bounded cursor pagination. It SHALL accept both `SecurityType.STOCK` and `SecurityType.INDEX` in subscription initialization DTOs and VOs.

#### Scenario: An INDEX security assignment is initialized via API

- **WHEN** a caller submits `POST /v1/realtime-subscriptions` with `securityType='INDEX'`
- **THEN** validation MUST accept the `INDEX` security type without HTTP 400 rejection
- **AND** the created assignment MUST be recognized by allowlist and desired authority queries
