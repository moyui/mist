## ADDED Requirements

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
