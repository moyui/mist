## ADDED Requirements

### Requirement: WebSocket broadcast isolates connections and bounds sends
The datasource WebSocket manager SHALL snapshot its connection mapping under synchronization and SHALL send outside the lock with finite timeout and bounded concurrency.

#### Scenario: A connection changes during broadcast
- **WHEN** a backend connects, disconnects, or replaces the same client ID while a broadcast is in progress
- **THEN** collection mutation does not fail the broadcast
- **AND** cleanup does not remove a replacement WebSocket

#### Scenario: One backend send blocks or fails
- **WHEN** one WebSocket exceeds the send timeout or raises an exception
- **THEN** healthy snapshot connections still receive the message without waiting serially for that client
- **AND** the failed connection is removed safely
