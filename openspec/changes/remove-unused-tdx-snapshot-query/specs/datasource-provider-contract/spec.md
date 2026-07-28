## MODIFIED Requirements

### Requirement: Internal realtime frames preserve provider native data

The datasource SHALL expose provider-native realtime objects only through the
authenticated internal realtime WebSocket envelope, while public normalized
`/v1` HTTP endpoints SHALL be limited to actively owned product capabilities.

#### Scenario: Internal realtime consumer receives a frame

- **WHEN** the authorized backend leader receives a TDX or QMT realtime frame
- **THEN** the frame contains the complete validated provider-native object and
  a source acquisition profile

#### Scenario: Public normalized endpoint is called

- **WHEN** a product caller requests historical bars
- **THEN** `/v1/bars/query` returns the existing provider-neutral response
  contract

#### Scenario: Removed snapshot endpoint is called

- **WHEN** a caller requests `/v1/snapshots/query`
- **THEN** the datasource returns HTTP 404
- **AND** no provider-specific alias or compatibility route is used
