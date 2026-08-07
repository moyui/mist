## ADDED Requirements

### Requirement: Market Candle Redis Shall Retain An Owned Namespace
The Windows appliance SHALL provide the persistent runtime Redis service used by market-data state, with
market-owned keys, health checks and capacity observations. In the accepted single-node V1 topology the same
endpoint and volume MAY also host realtime BullMQ keys under a separate prefix and connection owner.

#### Scenario: The candle foundation is deployed
- **WHEN** Compose configuration is resolved
- **THEN** market keys MUST remain separate from BullMQ keys
- **AND** the shared Redis MUST enable AOF and use `maxmemory-policy noeviction`
- **AND** queue write or processing failure MUST NOT roll back a committed candle
- **AND** candle product mode MUST default to `off`
