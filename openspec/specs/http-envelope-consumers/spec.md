# http-envelope-consumers Specification

## Purpose

定义 Mist 前端与 Python Skills HTTP 客户端消费统一公共 envelope 时的严格校验、错误分类、
stable code 分支和 204 no-content 行为。

## Requirements

### Requirement: HTTP Consumers Shall Require The Unified Envelope
Mist frontend and Skills HTTP clients SHALL require the archived Mist public envelope for every non-204 JSON
response and SHALL NOT accept a bare business payload.

#### Scenario: A valid success envelope is received
- **WHEN** the real HTTP status is successful and the body contains `success=true`, the matching
  `statusCode`, all required metadata and a `data` property
- **THEN** the client MUST return the typed `data`

#### Scenario: A bare payload is received
- **WHEN** a non-204 response body is an array or business object without the unified envelope
- **THEN** the client MUST reject it as a contract error
- **AND** it MUST NOT cast or return the bare payload

#### Scenario: An additive envelope field is received
- **WHEN** all required known fields and branch semantics are valid and the body also contains an unknown
  additive field
- **THEN** the external HTTP consumer MUST ignore that additive field
- **AND** it MUST continue validating every known field

### Requirement: Consumers Shall Verify Real Status Consistency
HTTP consumers SHALL keep transport status separate from domain outcome and SHALL verify that body
`statusCode` mirrors the real HTTP status.

#### Scenario: Status and envelope agree
- **WHEN** the HTTP response and body `statusCode` contain the same integer status
- **THEN** the client MUST continue parsing the declared success or error branch

#### Scenario: Status and envelope disagree
- **WHEN** the real HTTP status differs from body `statusCode`
- **THEN** the client MUST raise a contract error
- **AND** it MUST NOT return data or reinterpret `statusCode` as a business code

#### Scenario: A non-success HTTP response declares success
- **WHEN** a non-2xx response body contains `success=true`
- **THEN** the client MUST raise a contract error

### Requirement: Valid API Rejections Shall Produce Typed Errors
Both consumers SHALL represent a valid HTTP-200 business rejection and a valid non-2xx technical failure as a
typed Mist API error containing stable public error information.

#### Scenario: An expected business rejection is received
- **WHEN** the real HTTP status is 200 and the valid envelope contains `success=false`, `statusCode=200` and a
  non-empty string `code`
- **THEN** the client MUST raise `MistApiError`
- **AND** the error MUST preserve `code`, safe `message`, `httpStatus`, `requestId` and approved optional
  `data/errors`

#### Scenario: A technical HTTP failure is received
- **WHEN** a valid non-2xx error envelope contains a matching `statusCode` and non-empty string `code`
- **THEN** the client MUST raise the same typed `MistApiError`
- **AND** callers MUST be able to distinguish it through `code` and `httpStatus`

### Requirement: Malformed Responses Shall Remain Contract Failures
Consumers SHALL distinguish malformed wire data from server-declared API rejection and network failure.

#### Scenario: A required envelope field is missing or invalid
- **WHEN** `success`, `statusCode`, `message`, `timestamp`, `requestId`, `path`, success `data` or error `code`
  is missing or has an invalid type
- **THEN** the client MUST raise `MistApiContractError`
- **AND** it MUST NOT fabricate a domain or technical error code

#### Scenario: The response is not valid JSON
- **WHEN** a non-204 JSON operation receives an empty, invalid or non-JSON body
- **THEN** the client MUST raise `MistApiContractError`

#### Scenario: The connection or deadline fails
- **WHEN** the HTTP request cannot connect or reaches its client deadline before a response is received
- **THEN** the Python client MUST continue raising `MistConnectionError`
- **AND** neither consumer may treat the failure as a valid server API rejection

### Requirement: Skills Shall Branch On Stable Error Code
Mist Skills shared client and runners SHALL use the public string `code` for business branching and SHALL keep
the real HTTP status as diagnostic transport information only.

#### Scenario: An API error is constructed
- **WHEN** `mist-skills` parses a valid error envelope
- **THEN** `MistApiError.code` MUST contain the envelope `code`
- **AND** `MistApiError.http_status` MUST contain the real HTTP status
- **AND** the legacy numeric `error_code` business meaning MUST NOT remain

#### Scenario: K-line auto collection is considered
- **WHEN** a K-line query raises `MistApiError`
- **THEN** the shared runner MUST compare `error.code` against an explicitly approved stable-code allowlist
- **AND** an adjacent error with the same HTTP status but a different code MUST NOT trigger collection

### Requirement: No-Content Operations Shall Be Explicit
Consumers SHALL handle HTTP 204 only through an operation explicitly declared as no-content.

#### Scenario: A declared no-content operation returns 204
- **WHEN** a no-content helper receives HTTP 204
- **THEN** it MUST return void without parsing JSON
- **AND** it MUST make the server-generated `X-Request-Id` available for diagnostics when present

#### Scenario: A JSON operation receives 204
- **WHEN** a helper declared to return business data receives HTTP 204
- **THEN** it MUST raise `MistApiContractError`
- **AND** it MUST NOT fabricate `data=null` or an empty success envelope

### Requirement: Consumer Migration Shall Not Include UI Or Backend Changes
This capability SHALL be implemented within the shared HTTP client boundaries and their contract tests.

#### Scenario: The frontend consumer is migrated
- **WHEN** `mist-fe` adopts the strict envelope parser and typed errors
- **THEN** React pages and components MUST NOT be changed by this change

#### Scenario: The Skills consumer is migrated
- **WHEN** `mist-skills` adopts string error codes
- **THEN** only the shared client, shared runners and tests required for the contract migration MAY change
- **AND** concrete Skills business output MUST remain unchanged
