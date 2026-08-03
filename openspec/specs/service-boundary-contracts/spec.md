# service-boundary-contracts Specification

## Purpose
TBD - created by archiving change standardize-service-boundary-contracts. Update Purpose after archive.
## Requirements
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

#### Scenario: A successful controller has no business data
- **WHEN** a successful 200, 201 or 202 controller returns `undefined`
- **THEN** the response envelope MUST contain `data=null`

#### Scenario: A controller returns no content
- **WHEN** the actual HTTP response status is `204`
- **THEN** the response MUST NOT contain a JSON envelope or any response body
- **AND** it MUST still include the server-generated `X-Request-Id` header

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

### Requirement: OpenAPI Shall Describe The Real Envelope
Existing envelope-documented endpoints and all new or materially changed endpoints SHALL describe the actual
HTTP wire shape rather than declaring the raw business data as the complete response.

#### Scenario: HTTP 200 can be success or business rejection
- **WHEN** an operation can return both a success envelope and an expected business-rejection envelope at status
  200
- **THEN** one shared `ApiEnvelopeResponse` declaration MUST describe both variants with `oneOf`
- **AND** each variant MUST use the shared envelope schema plus its domain-owned data schema
- **AND** separate same-status decorators MUST NOT overwrite one another

#### Scenario: One technical status has multiple codes
- **WHEN** an operation can return more than one approved error variant at the same real 4xx or 5xx status
- **THEN** `ApiTechnicalErrorResponse` MUST combine those variants with `oneOf`
- **AND** the operation MUST NOT mechanically claim unrelated technical statuses

#### Scenario: OpenAPI documents a created or no-content response
- **WHEN** an operation returns 201 with business data
- **THEN** its schema MUST be `ApiResponseDto` with `data` referencing the domain-owned schema
- **WHEN** an operation returns 204
- **THEN** its OpenAPI response MUST contain no content or envelope schema

#### Scenario: A legacy response decorator is migrated
- **WHEN** this change replaces an existing raw `@ApiResponse` declaration
- **THEN** the generated OpenAPI JSON MUST match the runtime envelope
- **AND** transport MUST NOT take ownership of the domain VO or TypeORM entity
- **AND** this change MUST NOT invent missing business documentation for every previously unannotated endpoint

### Requirement: HTTP Rejections Shall Separate Status Code And Business Code
`ApiErrorDto<TCode,TData>` SHALL contain a required stable `code`, a safe readable `message`, and optional typed
`data`. Its `statusCode` SHALL always mirror the real HTTP response status.

#### Scenario: A nested DTO fails validation
- **WHEN** class-validator reports constraints on nested objects or array elements
- **THEN** the response MUST be real HTTP 400 with `code=VALIDATION_ERROR`
- **AND** `message` MUST be the safe readable validation message
- **AND** `errors` MUST recursively flatten constraints to stable dotted paths including numeric array segments
- **AND** parent and child constraints MUST both be retained without overwriting messages for the same path
- **AND** target, value, children and raw request input MUST NOT appear in the wire response

#### Scenario: Validation transforms an incoming DTO
- **WHEN** the shared ValidationPipe processes body, query or path DTO data
- **THEN** whitelist, forbid-non-whitelisted and transform behavior MUST remain enabled
- **AND** global implicit conversion MUST remain disabled
- **AND** explicit DTO `@Type()` and `@Transform()` declarations MAY still convert fields
- **AND** validation MUST collect all available field failures rather than stopping at the first one

#### Scenario: A non-DTO bad request occurs
- **WHEN** malformed JSON, a normal `BadRequestException` or a Parse pipe rejects the request outside DTO
  validation
- **THEN** the response MUST use `code=BAD_REQUEST`
- **AND** it MUST omit validation `errors`

#### Scenario: A domain rejection is mapped to HTTP
- **WHEN** a public adapter explicitly classifies a local application outcome or RPC rejection as an expected
  business rejection
- **THEN** it MUST construct the shared generic `HttpBusinessRejection` class instance
- **AND** the real HTTP response and `ApiErrorDto.statusCode` MUST both be `200`
- **AND** `success` MUST be false and `ApiErrorDto.code` MUST contain the domain-owned stable code
- **AND** `message` MUST contain only the approved safe readable text
- **AND** it MUST NOT place a synthetic `404`, `409`, or `500` in `ApiErrorDto.statusCode`
- **AND** the RPC domain contract MUST NOT contain HTTP status fields

#### Scenario: An RPC rejection has non-business HTTP semantics
- **WHEN** the owning HTTP adapter classifies an RPC rejection as capacity, availability, deadline or dependency
  failure
- **THEN** the adapter MUST return the explicitly owned real 4xx or 5xx HTTP status
- **AND** shared transport MUST NOT automatically convert the rejection to HTTP 200
- **AND** shared transport MUST NOT own an RPC-code-to-HTTP-status mapping table

#### Scenario: A protocol or dependency failure is returned
- **WHEN** validation, authentication, authorization, route resolution, dependency access, deadline, or an
  unexpected internal operation fails
- **THEN** the response MUST use its approved real 4xx or 5xx HTTP status
- **AND** `ApiErrorDto.statusCode` MUST equal that real status
- **AND** `ApiErrorDto.code` MUST contain the approved stable technical code
- **AND** an unexpected error MUST NOT be converted to an HTTP-200 business rejection

#### Scenario: An exception omits a stable technical code
- **WHEN** a validation, protocol, dependency, deadline or internal exception has no approved non-empty code
- **THEN** transport MUST select the documented default code for the real HTTP status
- **AND** validation MUST use `VALIDATION_ERROR`
- **AND** unknown database, program and other internal failures MUST use `INTERNAL_ERROR`
- **AND** an exception carrying a non-error status such as 200 MUST be normalized to real HTTP 500 and
  `INTERNAL_ERROR`

#### Scenario: A public HTTP code is emitted
- **WHEN** a business marker, structured exception or transport fallback builds an error envelope
- **THEN** code MUST be a string matching `^[A-Z][A-Z0-9_]{0,63}$`
- **AND** numeric, empty, lowercase, whitespace or hyphenated values MUST NOT be coerced into compatibility
- **AND** an invalid business-marker code MUST fail as real HTTP 500 with `INTERNAL_ERROR`
- **AND** an invalid structured 5xx code MUST also prevent its message/data from being exposed

#### Scenario: A known domain capacity rejection is mapped
- **WHEN** an adapter maps a domain-specific queue-capacity result such as Backtest `queue_full`
- **THEN** it SHOULD use the explicit public domain code such as `BACKTEST_QUEUE_FULL` with real HTTP 429
- **AND** the generic `TOO_MANY_REQUESTS` MUST remain the fallback for a 429 with no more specific approved
  domain meaning
- **AND** transport MUST NOT automatically uppercase or otherwise translate the RPC code

#### Scenario: A created resource fails during a later handoff
- **WHEN** the controller throws a structured HTTP exception containing safe resource identity data
- **THEN** the error envelope MUST preserve that typed data
- **AND** it MUST preserve the real HTTP status and stable message

#### Scenario: An unknown exception is filtered
- **WHEN** no approved typed error data exists
- **THEN** the response MUST omit `data`
- **AND** non-validation errors MUST omit `errors` rather than returning `errors=null`
- **AND** it MUST NOT expose stack, SQL, provider raw payload or arbitrary exception properties

#### Scenario: A structured HTTP exception is filtered
- **WHEN** an `HttpException` carries a structured response object
- **THEN** only approved `code`, safe `message`, typed `data` and validation-only `errors` MAY enter the public
  envelope
- **AND** a plain 5xx response message MUST fail closed to the safe transport default
- **AND** explicit safe 5xx message/data MAY pass only when the structured response carries an approved stable
  code
- **AND** `error`, exception `statusCode`, stack, cause, SQL, driver message, constraint and arbitrary fields
  MUST NOT be copied to the public response

#### Scenario: TypeORM raises an unknown persistence error
- **WHEN** a `QueryFailedError` or another unknown database error reaches the HTTP boundary unchanged
- **THEN** the public response MUST be real HTTP 500 with `code=INTERNAL_ERROR`
- **AND** shared transport MUST NOT import TypeORM or expose a database-specific public code
- **AND** the authoritative internal log MUST retain the original exception for diagnosis

#### Scenario: The response metadata is generated
- **WHEN** the success interceptor or exception filter writes an envelope
- **THEN** `timestamp` MUST be generated at response time as UTC ISO
- **AND** `path` MUST contain the request path without the query string

### Requirement: Synchronous HTTP Failures Shall Have One Authoritative Log
The final HTTP exception boundary SHALL own the authoritative log for a synchronous request failure, while
non-HTTP execution boundaries SHALL retain ownership of their own failures.

#### Scenario: A synchronous HTTP call chain fails
- **WHEN** a repository, service or provider adapter propagates an exception to the HTTP filter
- **THEN** a business rejection MUST NOT emit an error stack
- **AND** a 4xx or 429 failure MUST emit at most one boundary warning without a stack
- **AND** a 5xx failure MUST emit one authoritative boundary error with request id and original exception cause
- **AND** a lower layer that only wraps or rethrows MUST NOT emit a duplicate error log

#### Scenario: A non-HTTP task fails
- **WHEN** a scheduled task, worker, realtime consumer, startup hook or HIL runner cannot reach an HTTP filter
- **THEN** its own outer execution boundary MUST retain failure logging ownership
- **AND** removing a shared lower-layer `log + rethrow` MUST NOT leave that execution path without a boundary log

#### Scenario: An HTTP failure is logged
- **WHEN** the HTTP boundary writes its authoritative warning or error
- **THEN** it MAY include method, path without query, status, code, request id and 5xx exception type/stack/cause
- **AND** it MUST NOT include request body, full query, SQL parameters, provider raw payload, token, cookie or
  credentials

### Requirement: One Server Request Identity Shall Span HTTP And RPC
Each HTTP request SHALL receive one server-generated request identity that is reused by success/error
envelopes, request logs and the first internal RPC correlation chain.

#### Scenario: An HTTP request invokes an internal RPC
- **WHEN** the public adapter submits an internal request-response command
- **THEN** `RpcRequestV1.meta.correlationId` MUST equal that HTTP request's `requestId`
- **AND** the RPC result MUST echo the same non-empty correlation id

#### Scenario: One HTTP request invokes multiple RPC commands
- **WHEN** an HTTP adapter sends parallel or sequential child commands
- **THEN** each child MUST reuse the server-generated HTTP request id as correlation
- **AND** pattern plus domain identity MUST distinguish the individual calls
- **AND** V1 MUST NOT add a span id solely for this distinction

#### Scenario: An HTTP request fails
- **WHEN** the exception filter creates the public error envelope
- **THEN** it MUST use the request identity created at request entry
- **AND** it MUST NOT generate an unrelated error-only identity

#### Scenario: A request fails before controller dispatch
- **WHEN** malformed JSON or another parser failure rejects a request before controller execution
- **THEN** request-context installation MUST already have run before the body parser
- **AND** the response header, error envelope and authoritative boundary log MUST use the same request id
- **AND** the exception filter MUST generate a fallback identity only when no request context exists

#### Scenario: A non-HTTP boundary initiates RPC commands
- **WHEN** startup compensation or another internal producer submits multiple logical commands
- **THEN** each command attempt MUST receive its own `rpc-${randomUUID()}` correlation
- **AND** a whole batch MUST NOT share one correlation id
- **AND** correlation MUST NOT be persisted or used as the command idempotency identity

### Requirement: Internal RPC Shall Use One Versioned Envelope
All Mist NestJS request-response microservice calls SHALL use `RpcRequestV1<TData>` and
`RpcResultV1<TData,TErrorCode,TErrorData=never>` from `@app/transport/rpc`.

#### Scenario: A domain command is defined
- **WHEN** a Backtest, Signal or later domain adds a request-response handler
- **THEN** its pattern MUST use `domain.resource.action.vN`
- **AND** its request MUST place domain payload under `data`
- **AND** its expected rejection MUST use a domain-owned stable error-code union
- **AND** it MUST NOT place domain payload or error-code definitions in the shared transport primitive

#### Scenario: A business RPC contract is shared by two applications
- **WHEN** a caller and handler require the same pattern, versioned domain types and decoder
- **THEN** those definitions MUST be owned by the bounded-domain library rather than either application source
- **AND** Backtest contracts MUST be owned by `libs/backtest`
- **AND** Signal control-plane contracts MUST be owned by `libs/signal`
- **AND** only genuinely shared strategy evaluation contracts MAY be owned by `libs/strategy`
- **AND** the repository MUST NOT create a global contracts/protocol bucket or place business contracts in
  `libs/transport`
- **AND** both applications MUST import the same pattern constant rather than duplicating a wire string

#### Scenario: Domain libraries are composed into an application
- **WHEN** Mist, Backtest or Signal adapters assemble a business command with the shared RPC envelope
- **THEN** the application MAY depend on transport and its required domain libraries
- **AND** Backtest or Signal domain libraries MAY depend one-way on shared Strategy contracts only when needed
- **AND** Strategy MUST NOT depend back on Backtest or Signal
- **AND** Transport MUST NOT depend on any business domain or persistence library
- **AND** domain contracts MUST remain independent of transport, Nest decorators, HTTP, Swagger, TypeORM and
  Redis

#### Scenario: An application imports a domain contract
- **WHEN** an application consumes Backtest, Signal or Strategy public types
- **THEN** it MUST use the exact root barrel alias
- **AND** wildcard aliases and external deep imports MUST be rejected by the dependency-boundary tests

#### Scenario: The V1 RPC wire shape changes incompatibly
- **WHEN** a required field, result union or field meaning must change
- **THEN** the owning command MUST introduce a new pattern version
- **AND** the migration MUST deploy consumer support before switching the producer

#### Scenario: A seemingly optional RPC field or error code is added
- **WHEN** a request/result field, error code or typed error data is added to a strict existing contract
- **THEN** the owning command MUST introduce a new pattern version and matching domain types/decoder
- **AND** the V1 decoder MUST continue rejecting the V2-only field or code
- **AND** payload MUST NOT add a duplicate `contractVersion`

#### Scenario: An RPC implementation changes without changing the wire
- **WHEN** implementation, algorithm, logging, persistence, HTTP mapping or non-wire runtime configuration
  changes while the documented RPC shape and semantics remain identical
- **THEN** the pattern version MUST remain unchanged

#### Scenario: A caller migrates from V1 to V2
- **WHEN** a released command contract requires a new pattern version
- **THEN** the handler MUST support V2 before the caller begins sending it
- **AND** V1 and V2 handlers MUST coexist during the cutover interval
- **AND** the caller MUST NOT retry a V2 timeout or connection failure by sending V1
- **AND** V1 removal MUST be owned by a later explicit change after V1 traffic has ceased

### Requirement: Unexpected RPC Errors Shall Fail Closed
Unexpected request-response handler errors SHALL use the Nest RPC error channel through the shared transport
exception filter and SHALL NOT become a domain result.

#### Scenario: An RPC request fails strict validation
- **WHEN** the request envelope, correlation id or domain command data is malformed
- **THEN** validation MUST reject it before the business handler executes
- **AND** the RPC error channel MUST contain only `status=error` and `message=RPC_INVALID_REQUEST`
- **AND** the failure MUST NOT become an `ok=false` domain result

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

#### Scenario: A hybrid HTTP and RPC runtime installs filters
- **WHEN** an application connects its Nest request-response microservice
- **THEN** the shared RPC module MUST NOT register a global `APP_FILTER`
- **AND** each RPC controller or handler MUST explicitly apply the shared contract pipe/filter composition
- **AND** the connected microservice MUST use `inheritAppConfig=false` so HTTP global providers do not handle the
  RPC wire

### Requirement: RPC Wire Validation Shall Be Strict At Runtime
Runtime decoders SHALL validate the shared envelope independently from domain command and result data.

#### Scenario: A request envelope is decoded
- **WHEN** a raw RPC request reaches the shared pipe
- **THEN** the top level MUST contain exactly `meta` and `data`
- **AND** meta MUST contain exactly one correlation id matching `^[A-Za-z0-9._:-]{1,128}$`
- **AND** the owning domain decoder MUST validate data before handler execution

#### Scenario: A normal RPC result is decoded by the caller
- **WHEN** the caller receives a value on the normal result channel
- **THEN** success MUST contain exactly `ok=true`, meta and data
- **AND** rejection MUST contain exactly `ok=false`, meta and error
- **AND** both/neither branches, unknown envelope/meta/error fields and fields on the wrong branch MUST be rejected
- **AND** the owning domain decoder MUST validate success data, error code and optional typed error data
- **AND** result correlation MUST exactly equal the request correlation
- **AND** any malformed result MUST be treated as a transport failure rather than a business rejection

#### Scenario: The RPC error channel is observed
- **WHEN** a caller receives `RPC_INVALID_REQUEST` or `RPC_INTERNAL_ERROR`
- **THEN** it MUST correlate the failure using the locally known send-attempt correlation
- **AND** the safe error object MUST NOT duplicate correlation
- **AND** a server MUST log a received correlation only after it passes strict format validation

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
