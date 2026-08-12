## ADDED Requirements

### Requirement: WS transport lifecycle events are structured-logged

The realtime WS clients (TDX and QMT) SHALL emit structured logs for every
connection lifecycle event — connecting, connected, ready, ready_rejected,
error, disconnected, reconnecting — carrying bounded diagnostic fields, so
that connection state is answerable from logs without any diagnostic endpoint.
Lifecycle logs SHALL be emitted through the existing pino → OTLP logs pipeline
into OpenObserve.

#### Scenario: Connection is established

- **WHEN** the client creates a WebSocket, the socket opens, and a valid
  `realtime.ready` frame passes contract validation
- **THEN** info logs `event=connecting`, `event=connected`, and `event=ready`
  MUST be emitted in order
- **AND** each log MUST carry the same `connectionId` and the source prefix
  (`tdx`/`qmt`)
- **AND** `connecting` MUST carry the `wsUrl`

#### Scenario: Connection fails or drops

- **WHEN** the socket emits an error or closes unexpectedly
- **THEN** an error log `event=error` MUST be emitted with `errorMessage`
- **AND** a warn log `event=disconnected` MUST be emitted with `lastMessageAt`
  and `willReconnect`
- **AND** an info log `event=reconnecting` MUST be emitted with
  `reconnectDelayMs`
- **AND** when the client is shutting down, `event=disconnected` MUST be info
  level instead of warn

#### Scenario: Ready frame fails contract validation

- **WHEN** a `realtime.ready` frame fails contract validation
- **THEN** a warn log `event=ready_rejected` MUST be emitted carrying the
  existing `recordReject` reason code
- **AND** the existing reject counters MUST keep working unchanged

### Requirement: Lifecycle logging avoids per-message volume

Message-level data SHALL NOT be logged per frame. The client SHALL track
`lastMessageAt` in memory only and surface it as a field on lifecycle events,
so high-frequency snapshot flow does not amplify log volume.

#### Scenario: Normal snapshot flow

- **WHEN** snapshots flow at normal market frequency
- **THEN** no per-message log MUST be emitted beyond the existing
  `candle ingest start` snapshot log
- **AND** the in-memory `lastMessageAt` MUST be updated on every message and
  appear on subsequent lifecycle event logs
