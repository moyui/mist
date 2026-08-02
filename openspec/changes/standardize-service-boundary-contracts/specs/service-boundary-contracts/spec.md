## ADDED Requirements

### Requirement: Service Boundary Contracts Shall Use The Transport Library
Mist SHALL provide shared public HTTP and internal request-response primitives through the Nest library
`transport` at `libs/transport`.

#### Scenario: An application uses a service-boundary primitive
- **WHEN** `apps/mist`, `apps/chan`, `apps/backtest` or `apps/signal` needs an HTTP or RPC envelope
- **THEN** it MUST import the approved `@app/transport/http` or `@app/transport/rpc` export
- **AND** it MUST NOT import another application's source implementation

### Requirement: HTTP And RPC Envelopes Shall Remain Distinct
Mist SHALL keep public HTTP status/message/OpenAPI semantics separate from internal RPC result semantics.

#### Scenario: An internal RPC command is sent
- **WHEN** a NestJS request-response caller constructs the wire message
- **THEN** it MUST NOT include HTTP `statusCode`, `message`, `timestamp`, `requestId` or `Location`
- **AND** the HTTP adapter MUST remain responsible for mapping the RPC outcome to a public response

### Requirement: HTTP Success Status Shall Match The Real Response
The public success envelope SHALL report the actual HTTP response status rather than a fixed `200`.

#### Scenario: A controller returns a non-200 success
- **WHEN** Nest assigns or the controller declares `201`, `202` or another successful status
- **THEN** the response body `statusCode` MUST equal that actual status
- **AND** the interceptor MUST NOT replace it with `200`

### Requirement: HTTP Success Messages Shall Be Explicit
Public success responses SHALL default to `SUCCESS` and SHALL use explicit response metadata for a different
envelope message.

#### Scenario: A controller declares a success message
- **WHEN** the controller uses `@HttpResponseMessage("BACKTEST_ACCEPTED")`
- **THEN** the success envelope `message` MUST be `BACKTEST_ACCEPTED`
- **AND** the interceptor MUST NOT infer the envelope message from the returned business data

#### Scenario: A controller returns data containing a message property
- **WHEN** no response-message metadata is declared
- **THEN** the envelope message MUST remain `SUCCESS`
- **AND** the business `message` property MUST remain inside `data`

### Requirement: HTTP Rejections Shall Separate Status Code And Business Code
`ApiError<TCode,TData>` SHALL contain a required stable `code`, a safe readable `message`, and optional typed
`data`. Its `statusCode` SHALL always mirror the real HTTP response status.

#### Scenario: A domain rejection is mapped to HTTP
- **WHEN** a public adapter receives an approved local application rejection or `RpcResultV1.error.code`
- **THEN** it MUST use the shared generic business-rejection primitive
- **AND** the real HTTP response and `ApiError.statusCode` MUST both be `200`
- **AND** `success` MUST be false and `ApiError.code` MUST contain the domain-owned stable code
- **AND** `message` MUST contain only the approved safe readable text
- **AND** it MUST NOT place a synthetic `404`, `409`, or `500` in `ApiError.statusCode`
- **AND** the RPC domain contract MUST NOT contain HTTP status fields

#### Scenario: A protocol or dependency failure is returned
- **WHEN** validation, authentication, authorization, route resolution, dependency access, deadline, or an
  unexpected internal operation fails
- **THEN** the response MUST use its approved real 4xx or 5xx HTTP status
- **AND** `ApiError.statusCode` MUST equal that real status
- **AND** `ApiError.code` MUST contain the approved stable technical code
- **AND** an unexpected error MUST NOT be converted to an HTTP-200 business rejection

#### Scenario: A created resource fails during a later handoff
- **WHEN** the controller throws a structured HTTP exception containing safe resource identity data
- **THEN** the error envelope MUST preserve that typed data
- **AND** it MUST preserve the real HTTP status and stable message

#### Scenario: An unknown exception is filtered
- **WHEN** no approved typed error data exists
- **THEN** the response MUST omit `data`
- **AND** it MUST NOT expose stack, SQL, provider raw payload or arbitrary exception properties

### Requirement: One Server Request Identity Shall Span HTTP And RPC
Each HTTP request SHALL receive one server-generated request identity that is reused by success/error
envelopes, request logs and the first internal RPC correlation chain.

#### Scenario: An HTTP request invokes an internal RPC
- **WHEN** the public adapter submits an internal request-response command
- **THEN** `RpcRequestV1.meta.correlationId` MUST equal that HTTP request's `requestId`
- **AND** the RPC result MUST echo the same non-empty correlation id

#### Scenario: An HTTP request fails
- **WHEN** the exception filter creates the public error envelope
- **THEN** it MUST use the request identity created at request entry
- **AND** it MUST NOT generate an unrelated error-only identity

### Requirement: Internal RPC Shall Use One Versioned Envelope
All Mist NestJS request-response microservice calls SHALL use `RpcRequestV1<T>` and
`RpcResultV1<T, TCode>` from `@app/transport/rpc`.

#### Scenario: A domain command is defined
- **WHEN** a Backtest, Signal or later domain adds a request-response handler
- **THEN** its pattern MUST use `domain.resource.action.vN`
- **AND** its request MUST place domain payload under `data`
- **AND** its expected rejection MUST use a domain-owned stable error-code union
- **AND** it MUST NOT place domain payload or error-code definitions in the shared transport primitive

#### Scenario: The V1 RPC wire shape changes incompatibly
- **WHEN** a required field, result union or field meaning must change
- **THEN** the owning command MUST introduce a new pattern version
- **AND** the migration MUST deploy consumer support before switching the producer

### Requirement: Unexpected RPC Errors Shall Fail Closed
Unexpected request-response handler errors SHALL use the Nest RPC error channel through the shared transport
exception filter and SHALL NOT become a domain result.

#### Scenario: A handler encounters an unexpected database or program error
- **WHEN** a request-response handler throws an unexpected database, persistence or program error
- **THEN** the wire error MUST contain only `status=error` and `message=RPC_INTERNAL_ERROR`
- **AND** it MUST NOT return an `ok=false` `RpcResultV1`
- **AND** it MUST NOT expose exception objects, stack, SQL, driver messages, constraint names or arbitrary
  internal details
- **AND** the service boundary MUST log the original error with the available application, pattern and
  correlation context

#### Scenario: A caller receives an RPC internal error
- **WHEN** the request-response error channel yields `RPC_INTERNAL_ERROR`
- **THEN** the caller MUST treat it as an unexpected service failure
- **AND** it MUST NOT reinterpret it as a domain-owned rejection code

### Requirement: RPC Correlation Shall Be Mandatory And Non-Domain
Every `RpcRequestV1` and `RpcResultV1` SHALL contain a non-empty `meta.correlationId`, while domain
idempotency remains owned by the command payload or persistence identity.

#### Scenario: An RPC payload omits correlation
- **WHEN** correlation id is absent or empty
- **THEN** strict validation MUST reject the payload before business execution

#### Scenario: A Backtest command is retried or deduplicated
- **WHEN** the runtime decides whether two commands represent the same work
- **THEN** it MUST use `BacktestRun.id` rather than `correlationId`
- **AND** correlation MUST remain an observability identity only

### Requirement: RPC And One-Way Events Shall Not Be Conflated
The `rpc` transport boundary SHALL apply only to request-response operations.

#### Scenario: A future one-way event is proposed
- **WHEN** an application needs NestJS `EventPattern()` delivery
- **THEN** it MUST define a separately reviewed event contract
- **AND** it MUST NOT disguise the one-way event as `RpcRequestV1/RpcResultV1`
