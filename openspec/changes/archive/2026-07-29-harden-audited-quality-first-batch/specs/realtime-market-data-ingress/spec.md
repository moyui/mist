## ADDED Requirements

### Requirement: Realtime messages are bounded and parsed once
Each backend realtime client SHALL enforce the raw UTF-8 frame byte limit before JSON parsing and SHALL route ready, control, and native snapshot messages from that single parsed object.

#### Scenario: An oversized message arrives
- **WHEN** a WebSocket message exceeds the configured raw byte limit
- **THEN** the backend rejects it before `JSON.parse`
- **AND** no protocol, bridge, or snapshot state is updated

#### Scenario: A native snapshot arrives
- **WHEN** a bounded message parses to a native snapshot envelope
- **THEN** strict native-map validation consumes the parsed envelope
- **AND** the raw text is not parsed a second time
