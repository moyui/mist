## ADDED Requirements

### Requirement: Backtest Runtime Shall Use The Backtest Application
Mist SHALL run historical backtest execution in the Nest project `backtest` located at `apps/backtest` and
rooted at `BacktestAppModule`.

#### Scenario: The backtest application is built
- **WHEN** the `backtest` Nest project is compiled or started
- **THEN** its root application module MUST be `BacktestAppModule`
- **AND** it MUST NOT register public strategy business APIs

### Requirement: Backtest Control And Execution Shall Have Separate Owners
`apps/mist` SHALL own public backtest request and query APIs, while `apps/backtest` SHALL own historical
reading, bounded context construction, execution, run progression and result persistence.

#### Scenario: A backtest request is accepted
- **WHEN** `apps/mist` validates a public `/v1/strategy-backtests` request
- **THEN** it MUST delegate historical execution through the approved command boundary
- **AND** it MUST NOT execute the historical replay in the API process

#### Scenario: Mist application services are separated
- **WHEN** the public Backtest controller is migrated
- **THEN** `BacktestRunCommandService` MUST own durable registration, RPC submission and submit-error mapping
- **AND** `BacktestRunQueryService` MUST own run and signals MySQL reads, publication gates and HTTP VO mapping
- **AND** query operations MUST NOT call Backtest RPC

#### Scenario: The synchronous executor is retired
- **WHEN** the new `mist-backend` is cut over to the Backtest command boundary
- **THEN** the old `StrategyBacktestService.executeRun()` and its API-process K/evaluator/context dependencies
  MUST be removed
- **AND** `apps/mist` MUST NOT retain a historical replay facade, feature flag, double-run path or local fallback
- **AND** an unavailable Backtest service MUST use the approved failure mapping rather than execute locally

#### Scenario: Runtime deployment is ordered
- **WHEN** the production cutover is performed
- **THEN** the unconsumed `backtest` service MUST be deployed and pass its approved health/readiness checks first
- **AND** the RPC-only `mist-backend` MUST be deployed after that evidence exists
- **AND** V1 MUST NOT introduce a dedicated rollback protocol for this cutover

### Requirement: Backtest V1 Shall Only Accept TDX And QMT Sources
The public Backtest V1 create contract SHALL accept only TDX and QMT, without changing the global datasource
enum used by other Mist capabilities.

#### Scenario: A supported Backtest source is submitted
- **WHEN** `CreateBacktestRunDto.source` is `tdx` or `qmt`
- **THEN** source validation MAY proceed to the remaining request and business validation
- **AND** the HTTP/OpenAPI contract MUST expose only those two Backtest source values

#### Scenario: A run contains multiple target securities
- **WHEN** a valid BacktestRun resolves one or more securities from `targetUniverse`
- **THEN** every replay group MUST use the single required `BacktestRun.source`
- **AND** a target item MUST NOT override or add another source
- **AND** one execution context MUST NOT merge bars from TDX and QMT

#### Scenario: The selected source has no bar for a security or time
- **WHEN** the run's selected source has no persisted K for part of the requested replay
- **THEN** Backtest MUST preserve that absence for the selected source
- **AND** it MUST NOT query, merge or fall back to another source

#### Scenario: Provider price-adjustment modes differ
- **WHEN** TDX supplies its configured `front` series and QMT supplies its configured `front_ratio` series
- **THEN** the strategy engine MUST evaluate each run only within its selected source series
- **AND** it MUST NOT normalize the two adjustment modes or claim cross-source price equivalence
- **AND** runs using different sources MUST be treated as independent experiments whose results need not match
- **AND** V1 MUST NOT add an adjustment-mode field or database migration for this decision

#### Scenario: EF or another source is submitted
- **WHEN** `CreateBacktestRunDto.source` is `ef` or any other value
- **THEN** DTO validation MUST return actual HTTP `400` with `ApiErrorDto.code=VALIDATION_ERROR`
- **AND** no StrategyVersion query, `BacktestRun` insert or RPC submission MAY occur

#### Scenario: Startup or abnormal data exposes an unsupported pending run
- **WHEN** the runner claims a persisted PENDING run whose source is EF or another unsupported value
- **THEN** it MUST enter the runner-owned FAILED path with safe class `BACKTEST_SOURCE_UNSUPPORTED`
- **AND** it MUST do so before the first historical page query, provider call or evaluation
- **AND** an existing COMPLETED or FAILED run MUST remain queryable through the existing run-resource contract

#### Scenario: EF scope is inspected
- **WHEN** this change is implemented or released
- **THEN** it MUST NOT add an EF replay reader, quantity profile, provider call, data repair, backfill or migration
- **AND** a future Backtest source MUST be introduced through focused review

### Requirement: Backtest POST Shall Only Submit An Asynchronous Run
`POST /v1/strategy-backtests` SHALL register and submit one backtest run command and SHALL NOT wait for
historical execution or results.

#### Scenario: A backtest command is accepted
- **WHEN** `apps/mist` has committed a PENDING `BacktestRun` and the TCP handler accepts its run identity
- **THEN** the API MUST return `202 Accepted` without waiting for the runner or replay
- **AND** the shared HTTP envelope `statusCode` MUST also be `202`
- **AND** its message MUST be the explicit `BACKTEST_ACCEPTED`
- **AND** its data MUST be `BacktestRunReceiptVo` containing the created `runId` and literal
  `initialStatus=PENDING`
- **AND** the response MUST set `Location` to `/v1/strategy-backtests/{runId}`
- **AND** it MUST NOT create a second `commandId`

#### Scenario: The accepted run starts before the HTTP response arrives
- **WHEN** `apps/backtest` changes the run from PENDING to RUNNING before the client receives the POST response
- **THEN** the POST body MUST still contain the documented creation-state receipt `initialStatus=PENDING`
- **AND** the POST path MUST NOT perform another database read merely to refresh that receipt
- **AND** the client MUST use `GET /v1/strategy-backtests/{runId}` for current state

#### Scenario: A timeout readback proves that the run was accepted
- **WHEN** the timeout readback finds the run in RUNNING, COMPLETED or FAILED and the API returns normal `202`
- **THEN** the response MUST use the same `BacktestRunReceiptVo`
- **AND** `initialStatus=PENDING` MUST continue to mean the persisted creation state rather than current state

#### Scenario: A client needs backtest progress or results
- **WHEN** the client follows the POST `Location`
- **THEN** `GET /v1/strategy-backtests/{runId}` MUST remain the current run resource
- **AND** `GET /v1/strategy-backtests/{runId}/signals` MUST remain the signal-result collection
- **AND** the POST response MUST NOT embed replay results or aggregate completion statistics

### Requirement: Backtest Run Query Shall Use The Mist HTTP DTO/VO Boundary
`GET /v1/strategy-backtests/{runId}` SHALL remain an `apps/mist` MySQL-backed resource query and SHALL use the
approved Mist Backend DTO/VO and shared HTTP conventions.

#### Scenario: A valid run resource is queried
- **WHEN** `BacktestRunIdParamDto` accepts a positive safe-integer `runId` and the corresponding run exists
- **THEN** `apps/mist` MUST query the authoritative `BacktestRun` directly from MySQL
- **AND** the query MUST NOT call Backtest RPC or depend on `backtest.ready`
- **AND** the response MUST be `200` with `ApiResponseDto<BacktestRunVo>`
- **AND** the success envelope message MUST be `SUCCESS`
- **AND** `BacktestRunVo.id` MUST contain the same persistent identity referenced by the request `runId`

#### Scenario: The public run representation is produced
- **WHEN** a persisted `BacktestRun` is mapped to the HTTP response
- **THEN** `BacktestRunVo` MUST expose the existing public fields `id`, `strategyDefinitionId`,
  `strategyVersionId`, `targetUniverse`, `period`, `source`, `startDate`, `endDate`, `status`, `signalCount`,
  `matchedSecurityCount`, `startedAt`, `completedAt`, `errorMessage`, `createdAt` and `updatedAt`
- **AND** it MUST expose `targetIssues: BacktestTargetIssueVo[]` as an always-present field
- **AND** `startedAt`, `completedAt` and `errorMessage` MUST have explicit nullable HTTP semantics
- **AND** the controller MUST NOT expose the TypeORM entity as the public OpenAPI contract
- **AND** the change MUST NOT rename the response `id` field or change existing database column nullability

#### Scenario: A persisted lifecycle state is queried
- **WHEN** the run status is PENDING, RUNNING, COMPLETED or FAILED
- **THEN** the existing resource MUST return `200` with that persisted current status
- **AND** FAILED MUST NOT be converted into an HTTP execution error
- **AND** `signalCount` and `matchedSecurityCount` MUST be treated as final aggregate statistics only when the
  status is COMPLETED

#### Scenario: A run identifier is invalid
- **WHEN** `runId` is zero, negative, non-integer, non-numeric or not a safe integer
- **THEN** `BacktestRunIdParamDto` MUST reject it with `400` and `ApiErrorDto.code=VALIDATION_ERROR`
- **AND** the request MUST NOT reach TypeORM

#### Scenario: A valid run identifier has no resource
- **WHEN** the TypeORM lookup succeeds and returns null
- **THEN** the application service MUST return actual HTTP `200` with `success=false`, `statusCode=200` and
  `ApiErrorDto.code=BACKTEST_RUN_NOT_FOUND`
- **AND** it MUST NOT classify the successful null result as a database error

#### Scenario: Run lookup throws a database error
- **WHEN** the TypeORM/MySQL lookup throws
- **THEN** repository and ordinary service code MUST NOT retry, read back, repair or convert it to not-found
- **AND** the shared HTTP boundary MUST return `500` with
  `ApiErrorDto.code=INTERNAL_ERROR`
- **AND** the response MUST omit `data` and `Location`

#### Scenario: Run lookup throws another unexpected error
- **WHEN** the query path encounters an unexpected non-database program error
- **THEN** the shared HTTP boundary MUST return `500` with
  `ApiErrorDto.code=INTERNAL_ERROR`
- **AND** the response MUST omit `data` and `Location`

#### Scenario: A failed run contains persistence failure evidence
- **WHEN** `BacktestRunVo.errorMessage` is produced
- **THEN** it MUST expose only an approved bounded stable Backtest failure class
- **AND** an unrecognized historical string MUST be represented as `BACKTEST_EXECUTION_FAILED`
- **AND** SQL, driver message, stack and raw exception objects MUST NOT cross the HTTP boundary
- **AND** the mapper MUST NOT rewrite the database or add retry, readback or repair behavior

#### Scenario: An accepted run can be followed through the public contract
- **WHEN** a caller receives the POST accepted data
- **THEN** its `runId` and `Location` MUST identify the run GET resource
- **AND** `BacktestRunReceiptVo` and `BacktestRunVo` MUST remain different public response types
- **AND** the backend/OpenAPI contract MUST make clear that non-COMPLETED counts are not final completed
  statistics
- **AND** this change MUST NOT require a `mist-fe` implementation change; UI consumption belongs to a separate
  frontend change

### Requirement: Target-Level Business Gaps Shall Be Persisted As Run Issues
Backtest V1 SHALL preserve bounded target-level business gaps on the run resource without adding a PARTIAL
lifecycle state or downgrading system failures into warnings.

#### Scenario: Target issue persistence is introduced
- **WHEN** the Backtest schema change is prepared
- **THEN** schema inventory MUST first confirm the next unused migration number and the absence of
  `backtest_runs.target_issues`
- **AND** a forward-only migration MUST add `target_issues` as JSON NOT NULL with an empty-array default that is
  compatible with MySQL 8.4 and rolling inserts
- **AND** that migration file MUST contain only the one `backtest_runs` schema alteration and MUST NOT also add
  the result-pagination index
- **AND** matching `BacktestRun` entity metadata MUST map it to `targetIssues`
- **AND** existing rows MUST read as an empty array without reconstructing historical issues from signal rows
- **AND** preflight, postflight and readback MUST verify the column type, nullability, default and entity mapping

#### Scenario: A public target issue is represented
- **WHEN** `BacktestRunVo.targetIssues` contains an item
- **THEN** the item MUST be an explicit `BacktestTargetIssueVo` with only `securityCode` and `code`
- **AND** `code` MUST be either `SECURITY_NOT_FOUND` or `NO_HISTORICAL_BARS`
- **AND** it MUST NOT expose raw exceptions, SQL, provider payloads or free-form messages
- **AND** duplicate normalized `{securityCode,code}` items MUST be removed while preserving the first target
  appearance order

#### Scenario: A run is not yet terminal
- **WHEN** the run is created as PENDING or remains RUNNING
- **THEN** `targetIssues` MUST be an empty array
- **AND** the API MUST NOT infer provisional issues from physical partial results or logs

#### Scenario: A target is syntactically invalid
- **WHEN** `CreateBacktestRunDto` receives an empty target, an invalid security-code format or an empty universe
- **THEN** it MUST return `400 + VALIDATION_ERROR` before creating a durable run
- **AND** this input failure MUST NOT be converted into a target issue

#### Scenario: A valid-looking target has no security identity
- **WHEN** target resolution cannot find a Security registry identity for a syntactically valid security code
- **THEN** the runner MUST record `SECURITY_NOT_FOUND` for that target and skip only that target
- **AND** it MUST NOT query historical K or fall back to another security or source

#### Scenario: A resolved target has no public-range history
- **WHEN** a resolved target has no persisted K in the inclusive public `[startAt,endAt]` range for the run's
  selected source and period
- **THEN** the runner MUST record `NO_HISTORICAL_BARS` and skip only that target
- **AND** seed bars before `startAt` MUST NOT make an otherwise empty public range executable

#### Scenario: At least one target is executable
- **WHEN** one or more targets are executable and all executable targets finish normally
- **THEN** the runner MUST conditionally transition RUNNING to COMPLETED
- **AND** final counts and the complete target issue array MUST be persisted in the same short completion
  transaction
- **AND** skipped targets MUST NOT add a PARTIAL status, `hasWarnings` flag or processed-target count
- **AND** `matchedSecurityCount` MUST continue to count only securities with final signals

#### Scenario: Historical bars never produce a boolean evaluation
- **WHEN** a resolved target has at least one historical K in the public range but every strategy observation is
  `unknown` or `unavailable` because of warmup, missing previous state or unavailable quantity
- **THEN** the target MUST still be treated as normally executed
- **AND** the run MUST be allowed to complete with zero signals when no real execution error occurs
- **AND** V1 MUST NOT add `NO_EVALUABLE_BARS`, another target issue or a failure status for this condition

#### Scenario: Every target is skipped for an approved business gap
- **WHEN** every nonempty target is skipped as `SECURITY_NOT_FOUND` or `NO_HISTORICAL_BARS`
- **THEN** the runner MUST conditionally transition the run to FAILED with stable failure class
  `BACKTEST_NO_EXECUTABLE_TARGETS`
- **AND** it MUST persist the complete target issue array in that same short transaction
- **AND** it MUST delete partial results only when the conditional transition succeeds

#### Scenario: An executable replay produces no signals
- **WHEN** at least one target has public-range historical K and no rule produces a signal
- **THEN** the run MUST complete normally with zero signal counts
- **AND** the absence of signals, including an entirely `unknown/unavailable` evaluation range, MUST NOT create
  a target issue

#### Scenario: A non-target execution failure occurs
- **WHEN** MySQL, TypeORM, canonical K validation, quantity mapping, Indicator/evaluator, result persistence or
  another unexpected program operation fails
- **THEN** the runner MUST stop the whole run and use the applicable existing failure-cleanup path
- **AND** it MUST NOT catch the failure as a target issue and continue another target
- **AND** it MUST NOT persist a traversal-order-dependent partial issue list as if it were complete

#### Scenario: A caller polls for completion warning visibility
- **WHEN** run GET first returns COMPLETED or FAILED
- **THEN** actual HTTP and body `statusCode` MUST remain `200`, the success resource message MUST remain
  `SUCCESS`, and `targetIssues` MUST expose the persisted final array
- **AND** the contract MUST permit a caller to distinguish complete success, completed-with-skips,
  no-executable-target failure and system failure from `status`, `targetIssues` and safe `errorMessage`
- **AND** V1 MUST NOT add WebSocket, SSE, webhook, WeCom, AstrBot, AlertEvent or a notification queue for this
  warning
- **AND** if a caller stops polling or closes its page, V1 MUST NOT claim an out-of-band notification
- **AND** actual toast, detail-view and page behavior MUST remain outside this backend change

### Requirement: Partial Backtest Results Shall Remain Unpublished
`BacktestSignalResult` rows MAY be committed in bounded batches while a run is RUNNING, but COMPLETED SHALL
be the only public result-publication state.

#### Scenario: Result batch capacity is defined
- **WHEN** `apps/backtest` buffers matched results for persistence
- **THEN** it MUST use the internal constant `BACKTEST_RESULT_BATCH_SIZE=100`
- **AND** every active run MUST own an isolated result buffer containing at most 100 complete pending results
- **AND** the buffer MUST NOT contain raw historical K or mutable state belonging to another run
- **AND** the constant MUST NOT be configurable through environment, HTTP, RPC or strategy data

#### Scenario: A full result batch is reached
- **WHEN** a run buffers its one-hundredth pending result
- **THEN** the runner MUST persist those 100 rows through one short TypeORM multi-row insert
- **AND** it MUST clear the in-memory buffer only after that insert succeeds
- **AND** it MUST apply the approved deadline checks before and after persistence

#### Scenario: Replay ends with a partial result batch
- **WHEN** evaluation finishes with between 1 and 99 pending results
- **THEN** the runner MUST persist that remainder before attempting RUNNING to COMPLETED
- **AND** zero pending results MUST NOT issue an empty insert
- **AND** replay-page or security-group boundaries MUST NOT permit the buffer to exceed 100

#### Scenario: A result batch insert fails
- **WHEN** any full or remainder batch insert throws
- **THEN** the runner MUST stop that run and enter the existing non-target persistence failure path
- **AND** it MUST NOT fall back to per-row save, split-and-retry, skip a row or replay the failed batch
- **AND** earlier committed batches MUST be removed only through the approved conditional FAILED cleanup
- **AND** the buffer MUST be released when the run and its execution slot are closed

#### Scenario: A running replay persists a result batch
- **WHEN** `apps/backtest` persists one bounded result batch for a RUNNING run
- **THEN** the batch MAY commit without holding a transaction across the complete replay
- **AND** those physical rows MUST remain internal and unpublished
- **AND** the run MUST remain RUNNING until every result batch is durable and final counts are known

#### Scenario: A replay publishes its final result collection
- **WHEN** every result batch is durable and final counts have been calculated
- **THEN** the runner MUST conditionally change only RUNNING to COMPLETED and persist the final counts
- **AND** it MUST NOT write another result row for that run after COMPLETED

#### Scenario: Signals are requested before completion
- **WHEN** the authoritative run status is PENDING or RUNNING
- **THEN** `GET /v1/strategy-backtests/{runId}/signals` MUST return actual HTTP `200` with
  `success=false` and `statusCode=200`
- **AND** `ApiErrorDto.code` MUST be `BACKTEST_RESULTS_NOT_READY`
- **AND** typed `ApiErrorDto.data` MUST contain only the confirmed `{runId,status}`
- **AND** no physical partial result row MUST cross the HTTP boundary

#### Scenario: Signals are requested for a failed run
- **WHEN** the authoritative run status is FAILED
- **THEN** `GET /v1/strategy-backtests/{runId}/signals` MUST return actual HTTP `200` with
  `success=false` and `statusCode=200`
- **AND** `ApiErrorDto.code` MUST be `BACKTEST_RESULTS_UNAVAILABLE`
- **AND** typed `ApiErrorDto.data` MUST contain only `{runId,status:FAILED}`
- **AND** no physical partial result row MUST cross the HTTP boundary

#### Scenario: Signals are requested for a completed run
- **WHEN** the authoritative run status is COMPLETED
- **THEN** `GET /v1/strategy-backtests/{runId}/signals` MUST return `200` using the approved bounded result
  collection contract
- **AND** the collection MUST contain only final results
- **AND** zero matches MUST be represented as a successful empty final collection

#### Scenario: The signals resource has no owning run
- **WHEN** the run lookup succeeds and returns null
- **THEN** the signals API MUST return actual HTTP `200` with `success=false`, `statusCode=200` and
  `ApiErrorDto.code=BACKTEST_RUN_NOT_FOUND`
- **AND** it MUST NOT classify the successful null result as a database failure

#### Scenario: A runner-owned failure closes a partial run
- **WHEN** a runner execution failure conditionally changes PENDING or RUNNING to FAILED
- **THEN** the same short transaction MUST delete every `BacktestSignalResult` row for that run
- **AND** the transition and deletion MUST commit or roll back together
- **AND** the replay itself MUST NOT be enclosed in that transaction

#### Scenario: Failure cleanup no longer owns the run state
- **WHEN** the PENDING/RUNNING-to-FAILED conditional update affects zero rows
- **THEN** cleanup MUST NOT delete result rows
- **AND** it MUST NOT overwrite a run that is already COMPLETED or FAILED

#### Scenario: Partial-result cleanup fails
- **WHEN** the single short failure-cleanup transaction throws
- **THEN** the runner MUST NOT recursively retry cleanup or report success
- **AND** the public signals API MUST continue enforcing the persisted run-status publication gate

#### Scenario: An interrupted run is closed during startup
- **WHEN** startup reconciliation finds a stale RUNNING run
- **THEN** the interruption transition to FAILED and deletion of its partial results MUST occur in the same
  short transaction
- **AND** startup reconciliation MUST fail rather than become ready if that cleanup transaction fails

#### Scenario: Partial-result schema is inspected
- **WHEN** the publication boundary is implemented
- **THEN** it MUST NOT add `isPartial`, `published`, a staging table or another result column
- **AND** the partial-publication decision itself MUST NOT require a database migration or read-time repair

#### Scenario: A non-completed run retains an explicit signals gate
- **WHEN** the run GET returns PENDING, RUNNING or FAILED
- **THEN** the signals resource MUST continue enforcing the not-ready or unavailable response defined above
- **AND** the backend contract MUST NOT depend on a frontend implementation to protect physical partial rows

### Requirement: Completed Backtest Results Shall Use Bounded Cursor Pagination
The completed signals resource SHALL expose a stable keyset-paginated HTTP collection and SHALL NOT load or
return an unbounded result set.

#### Scenario: A completed signals page is requested
- **WHEN** `BacktestRunIdParamDto` and `BacktestSignalResultQueryDto` accept the request and the run is COMPLETED
- **THEN** the API MUST return `ApiResponseDto<BacktestSignalResultPageVo>`
- **AND** `BacktestSignalResultPageVo` MUST contain only `items` and nullable `nextCursor`
- **AND** each item MUST be an explicit `BacktestSignalResultVo` rather than a TypeORM entity

#### Scenario: The public signal-result item is represented
- **WHEN** a persisted result is mapped to `BacktestSignalResultVo`
- **THEN** it MUST expose `id`, `backtestRunId`, `securityCode`, `signalTime`, `contextSnapshot`,
  `ruleSnapshot` and `createdAt`
- **AND** its timestamps MUST use the approved HTTP ISO-string representation
- **AND** its context and rule snapshots MUST remain non-null JSON objects
- **AND** its context snapshot MUST preserve the shared strategy serializer shape without a Backtest-specific
  quantity representation

#### Scenario: Page limit is omitted or supplied
- **WHEN** `limit` is omitted
- **THEN** `BacktestSignalResultQueryDto` MUST use `50`
- **AND** an explicit limit MUST be an integer from `1` through `100`
- **AND** invalid, repeated or out-of-range values MUST return `400 + VALIDATION_ERROR`

#### Scenario: A signals page is ordered
- **WHEN** the result query executes
- **THEN** it MUST use `signalTime ASC, id ASC` as the stable total order
- **AND** it MUST use keyset pagination rather than offset pagination
- **AND** it MUST query at most `limit + 1` rows

#### Scenario: A next page exists
- **WHEN** the query returns more than the requested limit
- **THEN** the API MUST return only the first limit items
- **AND** it MUST create `nextCursor` from the last returned item's runId, signalTime and id
- **AND** when no additional item exists `nextCursor` MUST be null
- **AND** the page query MUST NOT execute an additional `COUNT(*)`

#### Scenario: A cursor is decoded
- **WHEN** a cursor is supplied
- **THEN** it MUST be a non-empty unpadded Base64URL token no longer than 512 characters containing only a
  supported version, runId, signalTime and id
- **AND** runId and id MUST be positive safe integers and token runId MUST equal the path runId
- **AND** malformed, padded, oversized, extra-field, unsupported, invalid-time or cross-run tokens MUST return
  `400 + VALIDATION_ERROR` before the result query
- **AND** validation failure MUST NOT log the raw cursor
- **AND** the client MUST NOT be required to construct or parse the token

#### Scenario: Cursor confidentiality and integrity are considered
- **WHEN** the internal V1 cursor contract is implemented
- **THEN** it MUST NOT add signing, encryption, cursor keys or key rotation
- **AND** the token MUST NOT contain secrets
- **AND** every result query MUST still constrain `backtest_run_id` using the validated path runId

#### Scenario: Completed result pages are read sequentially
- **WHEN** a client follows nextCursor for a COMPLETED run
- **THEN** every page MUST read the immutable completed result set
- **AND** the API MUST NOT add a snapshot token, cross-page transaction, retry, readback or temporary table
- **AND** a final empty page MUST remain a successful completed result

#### Scenario: The result page contract supports incremental consumption
- **WHEN** the first completed page is returned
- **THEN** it MUST be a page object rather than a bare result array
- **AND** another page MUST be addressable only through the returned nextCursor
- **AND** the API MUST NOT require a consumer to automatically drain every page
- **AND** actual `mist-fe` page-state and load-more implementation MUST remain in a separate frontend change

### Requirement: Completed Result Pagination Shall Have An Index Gate
Chronological keyset pagination SHALL have a matching Mist-managed index before production cutover.

#### Scenario: Pagination schema work is prepared
- **WHEN** implementation prepares the result page query
- **THEN** it MUST inventory real `schema_migrations` and existing production indexes
- **AND** it MUST capture representative large-run `EXPLAIN` evidence
- **AND** it MUST NOT guess or reuse an already-applied migration number
- **AND** repository files ending at `013` MAY identify `014/015` only as candidate numbers and MUST NOT prove
  that either production migration number is available

#### Scenario: The pagination index is absent
- **WHEN** preflight confirms the required index is absent
- **THEN** a new forward-only migration and matching entity metadata MUST add
  `idx_backtest_signal_results_run_time_id(backtest_run_id, signal_time, id)`
- **AND** that migration file MUST contain only the one `backtest_signal_results` schema alteration and MUST be
  recorded independently from the target-issues migration
- **AND** the pagination-index operation MUST NOT modify the existing unique key, existing columns or result data
- **AND** postflight and readback MUST verify name, column order, uniqueness and query plan

### Requirement: Backtest V1 Shall Not Support User Cancellation
Backtest V1 SHALL retain the four-state PENDING, RUNNING, COMPLETED and FAILED lifecycle and SHALL NOT expose
user cancellation as a public or internal capability.

#### Scenario: Backtest public routes and contracts are inspected
- **WHEN** the V1 HTTP API and OpenAPI are inspected
- **THEN** there MUST NOT be a `/v1/strategy-backtests/{runId}/cancel` or equivalent cancel operation
- **AND** there MUST NOT be a cancel DTO or cancel VO
- **AND** an unknown cancel-shaped request MUST NOT be converted into a Backtest domain operation

#### Scenario: Backtest internal contracts and persistence are inspected
- **WHEN** RPC patterns, run status, TypeORM metadata and MySQL schema are inspected
- **THEN** there MUST NOT be a cancel RPC pattern or database cancellation intent
- **AND** `BacktestRunStatus` and the MySQL status enum MUST remain limited to PENDING, RUNNING, COMPLETED and
  FAILED
- **AND** there MUST NOT be CANCELLING, CANCELLED, `cancelRequestedAt`, `cancelledAt` or a cancellation
  migration

#### Scenario: A persisted run is no longer observed by its HTTP client
- **WHEN** the client disconnects, closes the page or stops polling after the run is durable
- **THEN** the run MUST remain governed by its existing lifecycle
- **AND** the client action MUST NOT remove it from the local queue, delete its registry row or stop a RUNNING
  evaluator

#### Scenario: A run reaches an execution bound or is interrupted
- **WHEN** a run reaches its approved deadline or fails because of process interruption, database failure or
  another execution error
- **THEN** it MUST use the applicable stable failure class and FAILED lifecycle
- **AND** it MUST NOT be represented as user cancellation
- **AND** the absence of user cancellation MUST NOT remove historical paging, deadline, cleanup or resource
  hard-limit requirements

#### Scenario: User cancellation is requested in a future version
- **WHEN** product scope later requires users to cancel PENDING or RUNNING runs
- **THEN** a separate OpenSpec change MUST define HTTP/RPC contracts, state and migration, queue/runner races,
  partial-result cleanup, frontend behavior and monitoring before implementation
- **AND** the future change MUST NOT overload FAILED or delete a run as an implicit cancellation

### Requirement: Backtest Non-Target Database Errors Shall Fail Closed
Backtest APIs and runtime components SHALL treat every TypeORM/MySQL error other than an explicitly approved
exact constraint conflict as an unexpected persistence failure.

#### Scenario: Database persistence fails before a durable run exists
- **WHEN** strategy-version lookup, PENDING run creation or its transaction fails before a `BacktestRun` is
  committed
- **THEN** the API MUST return `500 Internal Server Error`
- **AND** `ApiErrorDto.code` MUST be `INTERNAL_ERROR`
- **AND** the response MUST omit `data` and `Location`
- **AND** it MUST NOT invent a `runId` or automatically retry

#### Scenario: A database operation fails after the run identity is durable
- **WHEN** a PENDING run has been committed and a later conditional update or readback fails with a database
  error
- **THEN** the API MUST return `500 Internal Server Error`
- **AND** `ApiErrorDto.code` MUST be `INTERNAL_ERROR`
- **AND** `ApiErrorDto.data` MUST contain only the known `runId`
- **AND** the response MUST retain `/v1/strategy-backtests/{runId}` as `Location`
- **AND** it MUST NOT return or infer an unconfirmed run status
- **AND** it MUST NOT perform another readback or retry

#### Scenario: A public run or result query fails
- **WHEN** either backtest GET resource encounters a database error
- **THEN** the API MUST return `500` with `ApiErrorDto.code=INTERNAL_ERROR`
- **AND** it MUST NOT report a `BACKTEST_RUN_NOT_FOUND` business rejection, a successful empty collection or
  partial success

#### Scenario: A TypeORM query succeeds without a business match
- **WHEN** a lookup returns null, a collection returns empty or a conditional update affects zero rows
- **THEN** the owning use case MUST interpret that successful result according to the documented resource or
  state semantics
- **AND** it MUST NOT classify the result as `INTERNAL_ERROR`

### Requirement: BacktestRun Shall Be The Durable Task Registry
V1 SHALL use MySQL `BacktestRun` records as the authoritative durable backtest task registry and SHALL NOT
require a Redis or BullMQ backtest queue.

#### Scenario: A valid backtest request is registered
- **WHEN** `apps/mist` accepts the request
- **THEN** it MUST create one PENDING `BacktestRun`
- **AND** it MUST trigger `apps/backtest` using the approved run identity after the database commit

#### Scenario: The backtest service is temporarily unavailable
- **WHEN** a PENDING run has been committed but no worker is available
- **THEN** the run MUST remain discoverable in MySQL
- **AND** API availability MUST NOT depend on synchronous historical execution

### Requirement: NestJS TCP Shall Be The Primary Backtest Trigger
Normal V1 execution SHALL use NestJS Microservices TCP request-response messaging with a versioned pattern and
a Backtest payload containing only the `BacktestRun` identity.

#### Scenario: A committed pending run is triggered
- **WHEN** `apps/mist` has committed the PENDING run
- **THEN** it MUST send `backtest.run.submit.v1` through a bounded NestJS TCP ClientProxy call
- **AND** `apps/backtest` MUST receive it through a `@MessagePattern` handler
- **AND** the handler MUST NOT wait for the historical replay to complete

### Requirement: Backtest RPC Shall Reuse The Shared Transport Contract
The Backtest command SHALL use `RpcRequestV1<SubmitBacktestRunCommandV1>` and
`RpcResultV1<null, SubmitBacktestRunErrorCodeV1>` from the approved shared RPC boundary. The command SHALL
contain only `runId`, and the error-code union SHALL contain only `queue_full|not_ready|run_failed`.

Its pattern, command, error-code union and decoder SHALL be owned by `libs/backtest` and imported through the
same domain barrel by both caller and handler; they SHALL NOT be owned by transport, strategy or application
source.

#### Scenario: A Backtest command is encoded
- **WHEN** `apps/mist` sends `backtest.run.submit.v1`
- **THEN** `data` MUST contain exactly the positive safe-integer `runId`
- **AND** `meta.correlationId` MUST contain the non-empty current HTTP request identity or startup-boundary
  correlation identity
- **AND** the payload MUST NOT contain strategy rules, K rows, target universe, results, `commandId` or a
  duplicate `contractVersion`

#### Scenario: A Backtest result is returned
- **WHEN** the handler accepts or rejects a valid command
- **THEN** the result MUST echo the request correlation id
- **AND** success MUST use `ok=true,data=null`
- **AND** an expected rejection MUST use only `queue_full`, `not_ready` or `run_failed`

#### Scenario: A Backtest RPC payload is invalid or hits an unexpected failure
- **WHEN** correlation or runId validation fails, the run identity does not exist, or an unexpected database
  error occurs
- **THEN** the handler MUST NOT fabricate a recognized business rejection
- **AND** it MUST use the strict validation or Nest RPC error path

#### Scenario: The Backtest handler encounters an unexpected database error
- **WHEN** run lookup, state validation or another handler database operation throws an unexpected error
- **THEN** the shared RPC exception filter MUST send only
  `{status:error,message:RPC_INTERNAL_ERROR}` through the error channel
- **AND** the handler MUST NOT return `ok=false` with `queue_full`, `not_ready` or `run_failed`
- **AND** the wire error MUST NOT include stack, SQL, driver messages, constraint names or arbitrary internal
  objects
- **AND** the backtest boundary MUST log the original error with available pattern, runId, correlation and
  execution-stage context

#### Scenario: RPC correlation and idempotency are evaluated
- **WHEN** two commands refer to the same durable run with different correlation ids
- **THEN** dedupe MUST use `BacktestRun.id`
- **AND** correlation MUST remain an observability identity only
- **AND** admission for that run MUST be serialized before capacity reservation
- **AND** each response MUST be reconstructed with its own request correlation rather than reusing a cached
  complete result

### Requirement: Backtest Command Timeout Shall Use One Shared Configuration
The `apps/mist` command client SHALL use one end-to-end `BACKTEST_COMMAND_TIMEOUT_MS` value validated by
`libs/config` `mistEnvSchema` and injected through Nest `ConfigService`.

#### Scenario: Command timeout configuration is omitted
- **WHEN** `BACKTEST_COMMAND_TIMEOUT_MS` is not configured
- **THEN** `mistEnvSchema` MUST supply `3000`
- **AND** the command client MUST receive the value through `ConfigService`

#### Scenario: Command timeout configuration is explicit
- **WHEN** `BACKTEST_COMMAND_TIMEOUT_MS` is configured
- **THEN** the schema MUST accept only integers from `500` through `30000`
- **AND** an invalid value MUST fail `apps/mist` startup configuration validation
- **AND** command business code MUST NOT use a direct `process.env` read or fallback

#### Scenario: A TCP command is sent
- **WHEN** the `ClientProxy.send()` request-response subscription starts
- **THEN** the configured timeout MUST cover connection, handler validation, queue or idempotency decision and
  accepted/rejected response
- **AND** the client MUST NOT apply separate connect and response timeout budgets

#### Scenario: The end-to-end command timeout expires
- **WHEN** no accepted or rejected response arrives within `BACKTEST_COMMAND_TIMEOUT_MS`
- **THEN** the client MUST execute the approved PENDING conditional update and readback path
- **AND** it MUST NOT automatically resend the command

#### Scenario: Startup redispatch sends a command
- **WHEN** `apps/mist` performs its approved one-time startup compensation
- **THEN** each command MUST use the same `BACKTEST_COMMAND_TIMEOUT_MS`
- **AND** no separate TCP-command timeout or command retry loop MAY be introduced

#### Scenario: Trigger delivery fails or is rejected
- **WHEN** TCP connection, timeout or bounded-queue acceptance fails
- **THEN** `apps/mist` MUST mark the run FAILED only through a `status=PENDING` conditional update
- **AND** it MUST NOT overwrite a run already claimed as RUNNING

#### Scenario: The command returns an RPC internal error
- **WHEN** the request-response error channel yields `RPC_INTERNAL_ERROR`
- **THEN** `apps/mist` MUST attempt the approved PENDING-to-FAILED conditional update exactly once
- **AND** a successful transition MUST return `500` with
  `ApiErrorDto.code=INTERNAL_ERROR`
- **AND** its typed data MUST contain the confirmed `{runId,status:FAILED}`
- **AND** the response MUST retain the run-resource `Location`
- **AND** the error MUST NOT be mapped to `429`, `503` or a Backtest rejection code

#### Scenario: An RPC internal error arrives after the run progressed
- **WHEN** the PENDING-to-FAILED update for `RPC_INTERNAL_ERROR` affects zero rows
- **THEN** `apps/mist` MUST read back the run exactly once
- **AND** RUNNING or COMPLETED MUST be treated as a successfully accepted command and return `202`
- **AND** an already FAILED run MUST return `500` with
  `ApiErrorDto.code=INTERNAL_ERROR`
- **AND** that FAILED response MUST retain `{runId,status:FAILED}` typed data and the run-resource `Location`
- **AND** the client MUST NOT resend the command automatically

#### Scenario: RPC internal-error cleanup cannot query the database
- **WHEN** the PENDING-to-FAILED update or its required readback throws a database error
- **THEN** the API MUST return `500` with `ApiErrorDto.code=INTERNAL_ERROR`
- **AND** typed data MUST contain only the known `runId`
- **AND** the response MUST retain `Location` and omit unconfirmed status
- **AND** no further readback, cleanup attempt or RPC resend MAY occur

#### Scenario: The TCP handler rejects a new run because the queue is full
- **WHEN** the handler returns the stable `queue_full` rejection
- **THEN** `apps/mist` MUST conditionally change the created run from PENDING to FAILED
- **AND** after that transition succeeds the API MUST return `429 Too Many Requests`
- **AND** `ApiErrorDto.code` MUST be `BACKTEST_QUEUE_FULL`
- **AND** the shared `ApiErrorDto.data` MUST include the failed `runId` and current FAILED status
- **AND** the response MUST include its run-resource `Location`

#### Scenario: Backtest submission is unavailable
- **WHEN** backtest-scoped readiness is false or the TCP connection fails
- **THEN** `apps/mist` MUST conditionally change the created run from PENDING to FAILED
- **AND** after that transition succeeds the API MUST return `503 Service Unavailable`
- **AND** readiness false MUST use `ApiErrorDto.code=BACKTEST_NOT_READY`
- **AND** TCP connection failure MUST use `ApiErrorDto.code=BACKTEST_UNAVAILABLE`
- **AND** the shared `ApiErrorDto.data` MUST include the failed `runId` and current FAILED status
- **AND** the response MUST include its run-resource `Location`

#### Scenario: TCP response times out while the run is still pending
- **WHEN** the TCP response timeout occurs and the PENDING-to-FAILED conditional update succeeds
- **THEN** the API MUST return `504 Gateway Timeout`
- **AND** `ApiErrorDto.code` MUST be `BACKTEST_COMMAND_TIMEOUT`
- **AND** the shared `ApiErrorDto.data` MUST include the failed `runId` and current FAILED status
- **AND** the response MUST include its run-resource `Location`

#### Scenario: TCP response is lost after the worker claims the run
- **WHEN** the TCP response times out and the PENDING-to-FAILED conditional update affects zero rows
- **THEN** `apps/mist` MUST read back the run exactly once
- **AND** a RUNNING, COMPLETED or FAILED run MUST be treated as an accepted command and return the approved
  `202 Accepted` response
- **AND** a still-PENDING or missing run MUST return `500` with `ApiErrorDto.code=INTERNAL_ERROR`
- **AND** a readback database error MUST return `500` with `ApiErrorDto.code=INTERNAL_ERROR`, typed data containing
  only the known `runId`, and the run-resource `Location`
- **AND** it MUST NOT overwrite state, perform another readback/cleanup or resend the command

#### Scenario: A failed submission is explicitly requested again
- **WHEN** a user chooses to resubmit after receiving `429`, `503` or `504`
- **THEN** the previous failed run MUST remain queryable for audit
- **AND** the new submission MUST create a new `BacktestRun` identity
- **AND** clients MUST NOT automatically reuse or resume the failed run

### Requirement: Backtest Waiting Queue Capacity Shall Use Shared Configuration
The bounded local waiting queue capacity SHALL be provided by `libs/config` through a
`backtestEnvSchema`-validated `BACKTEST_QUEUE_CAPACITY` value and injected through Nest `ConfigService`.
The schema SHALL accept only integers from `1` through `64` and SHALL default the value to `8`.

#### Scenario: The backtest application starts with valid capacity
- **WHEN** `BACKTEST_QUEUE_CAPACITY` passes `backtestEnvSchema` validation
- **THEN** the local FIFO queue MUST use that injected integer capacity
- **AND** queue or execution business code MUST NOT read `process.env` directly

#### Scenario: Queue capacity is omitted
- **WHEN** `BACKTEST_QUEUE_CAPACITY` is not configured
- **THEN** `backtestEnvSchema` MUST supply the value `8`
- **AND** the queue MUST receive that value through `ConfigService`

#### Scenario: Queue occupancy is calculated
- **WHEN** one or more runs are executing and other distinct run identities are waiting
- **THEN** only the waiting identities MUST count toward `BACKTEST_QUEUE_CAPACITY`
- **AND** a duplicate `runId` MUST NOT consume another queue slot

#### Scenario: The waiting queue is full
- **WHEN** every execution slot is occupied and another distinct PENDING run is delivered after the waiting
  capacity is exhausted
- **THEN** the TCP handler MUST reject it with the stable `queue_full` reason
- **AND** `apps/mist` MUST apply only the approved conditional PENDING-to-FAILED transition

#### Scenario: A duplicate or successfully progressed run is delivered
- **WHEN** the same `runId` is already waiting, RUNNING or COMPLETED
- **THEN** the TCP handler MUST return an idempotent `ok=true` no-op response
- **AND** it MUST NOT consume another queue slot or move the run back to PENDING
- **AND** dedupe MUST occur before queue-full evaluation

#### Scenario: Two commands concurrently deliver the same pending run
- **WHEN** different correlation ids concurrently reference one PENDING run
- **THEN** a short-lived keyed admission chain MUST serialize decisions for that run
- **AND** after one command reserves active or waiting identity, the next MUST observe it and return an
  idempotent success
- **AND** capacity check and in-memory reservation MUST execute synchronously without an await between them
- **AND** the keyed chain MUST be removed after settlement while scheduler-owned active/waiting identity remains
- **AND** no run MAY occupy more than one active slot or waiting position

#### Scenario: A failed run is delivered again
- **WHEN** the referenced run is already FAILED
- **THEN** the TCP handler MUST return `ok=false,error.code=run_failed`
- **AND** it MUST NOT report the failed run as accepted or enqueue it
- **AND** `apps/mist` MUST map the confirmed domain state to real HTTP 200 with
  `success=false`, `ApiErrorDto.code=BACKTEST_RUN_ALREADY_FAILED` and typed `{runId,status:FAILED}`
- **AND** the response MUST retain the run-resource `Location` without another database readback
- **AND** a client MUST NOT automatically resend that run; an explicit later submission creates a new run

#### Scenario: Queue capacity configuration fails validation
- **WHEN** an explicit `BACKTEST_QUEUE_CAPACITY` is non-integer, less than `1` or greater than `64`
- **THEN** the `backtest` application MUST fail startup validation
- **AND** it MUST NOT continue with a business-code fallback capacity

### Requirement: Backtest Execution Concurrency Shall Be Bounded And Configured
The single Backtest service instance SHALL use `BACKTEST_CONCURRENCY` logical execution slots supplied by
`backtestEnvSchema` and `ConfigService`. The schema SHALL accept only integers from `1` through `8` and SHALL
default the value to `2`.

#### Scenario: Concurrency configuration is omitted or explicit
- **WHEN** `BACKTEST_CONCURRENCY` is omitted
- **THEN** `backtestEnvSchema` MUST supply `2`
- **AND** an explicit value MUST be an integer from `1` through `8`
- **AND** invalid input MUST fail application startup without a business-code fallback

#### Scenario: An execution slot is free
- **WHEN** a distinct valid PENDING run is accepted while active count is below `BACKTEST_CONCURRENCY`
- **THEN** it MAY proceed directly to atomic claim and execution without consuming waiting capacity
- **AND** the same runId MUST NOT occupy another active slot or waiting position

#### Scenario: A command is accepted before durable claim
- **WHEN** the handler has reserved active or waiting identity and returns `ok=true`
- **THEN** the durable run MAY remain PENDING until the runner actually obtains an execution slot
- **AND** handler acceptance MUST NOT require a new persistent reservation state
- **AND** a process exit in this interval MUST leave durable PENDING recovery to the next startup's one-time
  compensation rather than a runtime scanner

#### Scenario: The runner claims an accepted run
- **WHEN** an accepted identity obtains an execution slot
- **THEN** the runner MUST conditionally change exactly that run from PENDING to RUNNING before evaluation
- **AND** `affected=0` MUST prevent execution, discard the memory identity without readback or PENDING restore,
  release the slot exactly once and admit at most one oldest waiting identity

#### Scenario: Claim or scheduling fails
- **WHEN** claim throws, cleanup throws, or synchronous runner scheduling fails
- **THEN** claim failure MUST attempt at most one PENDING-to-FAILED cleanup
- **AND** cleanup failure MUST be logged without recursive retry
- **AND** synchronous schedule failure MUST undo its active reservation before task failure closure
- **AND** every path MUST release its slot in a finally-equivalent boundary and MUST NOT leave capacity occupied

#### Scenario: All execution slots are occupied
- **WHEN** active count equals `BACKTEST_CONCURRENCY` and waiting capacity remains
- **THEN** newly accepted distinct runs MUST enter the FIFO waiting queue
- **AND** completion or failure of one active run MUST release exactly one slot and admit the oldest waiting run

#### Scenario: Multiple runs execute concurrently
- **WHEN** more than one execution slot is active
- **THEN** every run MUST own independent context, Indicator, quantity projector, result-batch, deadline and
  failure-cleanup state
- **AND** one run's failure or cleanup MUST NOT mutate another run's state or results
- **AND** each approved calculation or page boundary MUST provide a scheduling opportunity for the other active
  runs

#### Scenario: Calculation batch capacity is defined
- **WHEN** an active run evaluates canonical historical bars
- **THEN** it MUST use the separate internal constant `BACKTEST_CALCULATION_BATCH_SIZE=100`
- **AND** bars within one security group MUST remain sequentially ordered rather than use bar-level parallelism
- **AND** seed bars consumed by quantity projection MUST count toward this calculation boundary
- **AND** the constant MUST NOT be supplied by environment, HTTP, RPC or strategy data

#### Scenario: One calculation batch completes
- **WHEN** a run finishes processing each one-hundredth consumed bar
- **THEN** it MUST check its cooperative deadline
- **AND** it MUST yield the event loop once through promise-based `setImmediate`
- **AND** the yield MUST NOT release the run's execution slot or reset its deadline
- **AND** elapsed yield time MUST remain part of the run's wall-clock execution budget

#### Scenario: A replay page ends before another full calculation batch
- **WHEN** a replay page ends after fewer than another 100 bars
- **THEN** the runner MUST check its deadline and yield through `setImmediate` at page end
- **AND** a page end that coincides with a 100-bar boundary MUST produce only one yield
- **AND** a final partial page MUST retain the same page-end scheduling opportunity

#### Scenario: An ineffective event-loop yield is considered
- **WHEN** calculation scheduling code is inspected
- **THEN** it MUST NOT use `Promise.resolve()` microtasks or `setTimeout(0)` as the approved yield mechanism
- **AND** it MUST NOT use `Promise.all`, worker threads or bar-level concurrency within an ordered group
- **AND** calculation and result batching MUST remain separate constants even though both V1 values are 100

#### Scenario: One run contains multiple security groups
- **WHEN** one active run resolves more than one deduplicated `(securityId,source,period)` replay group
- **THEN** V1 MUST replay those groups sequentially within that run
- **AND** `BACKTEST_CONCURRENCY` MUST continue to count active runs rather than security groups
- **AND** V1 MUST NOT add an intra-run worker pool or another security-concurrency configuration
- **AND** each group's bounded context, Indicator and quantity-projector state MUST remain isolated
- **AND** the internal group traversal order MUST NOT be exposed as an HTTP, RPC or result-schema contract
- **AND** changing only that group traversal order MUST NOT change the final domain signal set or completed counts

#### Scenario: Runtime parallelism is inspected
- **WHEN** V1 runs concurrent work in the single Node process
- **THEN** it MUST claim only page-I/O and page-boundary concurrency
- **AND** it MUST NOT claim worker-thread, multi-process or multi-core parallel execution
- **AND** production concurrency MUST remain gated by MySQL pool, CPU, heap and event-loop evidence

### Requirement: Each Running Backtest Shall Use An Independent Cooperative Deadline
Every claimed run SHALL use a `BACKTEST_RUN_TIMEOUT_MS` execution budget validated by `backtestEnvSchema` and
injected through `ConfigService`. The schema SHALL accept only integers from `60000` through `86400000` and
SHALL default the value to `1800000`.

#### Scenario: Run deadline configuration is omitted or explicit
- **WHEN** `BACKTEST_RUN_TIMEOUT_MS` is omitted
- **THEN** `backtestEnvSchema` MUST supply `1800000`
- **AND** an explicit value MUST be an integer from `60000` through `86400000`
- **AND** invalid input MUST fail `apps/backtest` startup without a business-code fallback
- **AND** runner code MUST receive the value through `ConfigService` rather than read `process.env`

#### Scenario: A run waits before an execution slot is available
- **WHEN** a PENDING run remains in the FIFO waiting queue
- **THEN** its queue waiting time MUST NOT consume `BACKTEST_RUN_TIMEOUT_MS`
- **AND** its independent deadline MUST start only after the atomic PENDING-to-RUNNING claim succeeds
- **AND** the deadline MUST NOT be supplied or overridden through HTTP, RPC, strategy definition or caller input

#### Scenario: A running backtest progresses through bounded work
- **WHEN** the runner is about to enter or has returned from historical-page I/O, a bounded calculation batch or
  result-batch persistence, or is about to commit RUNNING to COMPLETED
- **THEN** it MUST check that run's independent deadline
- **AND** deadline, clock and cleanup state MUST NOT be shared as mutable state between active runs

#### Scenario: The cooperative deadline is observed as expired
- **WHEN** a deadline check observes that a RUNNING run has exhausted `BACKTEST_RUN_TIMEOUT_MS`
- **THEN** the runner MUST stop further evaluation and ordinary result writes for only that run
- **AND** it MUST invoke the existing single failure-cleanup transaction with stable failure class
  `BACKTEST_EXECUTION_TIMEOUT`
- **AND** partial results MUST be deleted only when the conditional RUNNING-to-FAILED transition succeeds
- **AND** the run's execution slot MUST be isolated and released even if cleanup itself fails
- **AND** the oldest waiting run MUST then be eligible for that slot while other active runs continue unaffected
- **AND** the expired run MUST NOT be retried, resumed, restored or requeued automatically

#### Scenario: Work is in flight when the deadline passes
- **WHEN** synchronous calculation or a MySQL driver operation has already started before the deadline is
  observed
- **THEN** V1 MUST NOT use `Promise.race` to represent that operation as cancelled while it can still mutate
  process or database state
- **AND** the runner MUST apply the deadline at the next required safe boundary after control returns
- **AND** this deadline MUST NOT claim to replace a driver query timeout or provide worker-thread preemption

### Requirement: Each Backtest Run Shall Have One Total Consumed-Bar Limit
Every run SHALL use one `BACKTEST_MAX_BARS_PER_RUN` limit across all replay groups. The value SHALL be validated
by `backtestEnvSchema`, injected through `ConfigService`, default to `10000000` and accept only integers from
`10000` through `50000000`.

#### Scenario: Consumed-bar limit configuration is omitted or explicit
- **WHEN** `BACKTEST_MAX_BARS_PER_RUN` is omitted
- **THEN** `backtestEnvSchema` MUST supply `10000000`
- **AND** an explicit value MUST be an integer from `10000` through `50000000`
- **AND** invalid input MUST fail `apps/backtest` startup without a business-code fallback
- **AND** runner code MUST receive the value through `ConfigService` rather than read `process.env`
- **AND** HTTP, RPC, strategy definitions and callers MUST NOT supply or override the limit

#### Scenario: A target universe is prepared for replay
- **WHEN** a Backtest request or persisted run provides `targetUniverse`
- **THEN** the public DTO MUST require at least one syntactically valid target item
- **AND** the runner MUST resolve canonical targets to securityId identities and deduplicate by securityId
- **AND** one security identity MUST NOT create duplicate replay groups or duplicate consumed-bar counts
- **AND** an anomalous persisted empty or syntactically invalid universe MUST fail before historical paging with
  stable class `BACKTEST_TARGET_UNIVERSE_EMPTY`
- **AND** a syntactically valid target missing from the Security registry MUST instead use the approved
  `SECURITY_NOT_FOUND` target-issue path
- **AND** it MUST NOT represent an invalid empty universe as a successful zero-signal run

#### Scenario: Historical bars are consumed across replay groups
- **WHEN** a canonical historical bar is about to enter quantity projection or strategy evaluation
- **THEN** the run MUST increment one total consumed-bar count exactly once
- **AND** the count MUST span every deduplicated securityId, source and period replay group in the run
- **AND** bars before public `startAt` that are consumed to seed quantity forward-fill MUST also count
- **AND** seed bars MUST remain ineligible for result publication before `startAt`

#### Scenario: The consumed-bar count exactly reaches the configured limit
- **WHEN** processing one bar makes the total count equal `BACKTEST_MAX_BARS_PER_RUN`
- **THEN** that bar MAY be evaluated and the run MAY complete if no further bar exists
- **AND** the limit MUST NOT cause an off-by-one failure at the exact boundary

#### Scenario: Another bar would exceed the configured limit
- **WHEN** the runner is about to consume bar `BACKTEST_MAX_BARS_PER_RUN + 1`
- **THEN** it MUST stop subsequent page consumption, evaluation and ordinary result persistence for that run
- **AND** it MUST invoke the existing single failure-cleanup transaction with stable class
  `BACKTEST_BAR_LIMIT_EXCEEDED`
- **AND** it MUST not publish partial success, shorten the requested range or retain partial result rows after a
  successful conditional RUNNING-to-FAILED cleanup
- **AND** the run's execution slot MUST be released and other active runs MUST continue unaffected
- **AND** the failed run MUST NOT be retried, resumed, restored or requeued automatically

#### Scenario: Other possible per-run caps are inspected
- **WHEN** V1 validates or executes a Backtest request
- **THEN** it MUST NOT add a period-specific date-range matrix, a separate target-count cap, a result-count cap
  or another date-span cap
- **AND** it MUST NOT execute a preliminary `COUNT(*)` to estimate total historical bars
- **AND** fixed replay pages, the cooperative deadline and total consumed-bar limit MUST retain separate I/O,
  time and total-work responsibilities

### Requirement: Pending Backtest Compensation Shall Run Only At Startup
V1 SHALL NOT periodically poll MySQL for PENDING backtests and SHALL perform only bounded one-time startup
reconciliation.

#### Scenario: The API application starts with pending runs
- **WHEN** `apps/mist` records its startup cutoff and finds runs that were PENDING at or before that cutoff
- **THEN** its isolated startup-compensation task MUST request `BACKTEST_HEALTH_URL` exactly once with internal
  `BACKTEST_STARTUP_HEALTH_TIMEOUT_MS=3000`
- **AND** only a contract-valid HTTP 200 response with `status=ok,backtest.ready=true` MAY allow one bounded TCP
  redispatch for each still-PENDING eligible run
- **AND** a failed redispatch MUST leave the run FAILED rather than schedule another retry

#### Scenario: The single startup health check is not ready
- **WHEN** the request is unreachable, times out, returns non-200, violates `BacktestHealthVo`, reports
  `status!=ok` or reports `backtest.ready=false`
- **THEN** the task MUST NOT wait, sleep, poll, retry or send a Backtest command
- **AND** it MUST perform one set-based conditional update of rows matching
  `status=PENDING AND created_at<=startupCutoff` to FAILED with stable class
  `BACKTEST_STARTUP_UNAVAILABLE`
- **AND** RUNNING, COMPLETED and already FAILED rows MUST remain unchanged

#### Scenario: Startup health failure evidence is recorded
- **WHEN** the one-time health check cannot authorize redispatch
- **THEN** persisted run failure evidence MUST contain only `BACKTEST_STARTUP_UNAVAILABLE`
- **AND** raw response bodies, URLs with query data, exceptions and stacks MUST remain out of `errorMessage`
- **AND** the isolated task boundary MUST emit one sanitized outcome log and low-cardinality metric

#### Scenario: Startup unavailable cleanup hits a database error
- **WHEN** the set-based conditional FAILED update throws a TypeORM/MySQL error
- **THEN** the startup-compensation task MUST record that database error once and stop
- **AND** it MUST NOT recursively retry, infer success or terminate unrelated `apps/mist` capabilities

#### Scenario: Backtest readiness is false while the API application is running
- **WHEN** the one-time startup compensation observes `backtest.ready=false`
- **THEN** unrelated public APIs, market ingress and live signal capabilities in `apps/mist` MUST remain
  independently available
- **AND** backtest-scoped readiness MUST NOT become an application-global readiness dependency

#### Scenario: The backtest application starts with pending runs
- **WHEN** `apps/backtest` starts
- **THEN** before accepting TCP commands or starting its runner it MUST record one startup cutoff
- **AND** it MUST select eligible PENDING runs by `createdAt ASC, id ASC`
- **AND** it MUST admit no more than `BACKTEST_CONCURRENCY + BACKTEST_QUEUE_CAPACITY` distinct run identities
- **AND** it MUST NOT start a periodic pending-run scanner

#### Scenario: Startup pending runs exceed total local admission capacity
- **WHEN** eligible PENDING runs at or before the startup cutoff exceed
  `BACKTEST_CONCURRENCY + BACKTEST_QUEUE_CAPACITY`
- **THEN** only the oldest total-admission-bounded identities MUST be retained locally
- **AND** after readiness the oldest concurrency-bounded identities MUST enter execution slots and the remainder
  MUST enter the FIFO waiting queue
- **AND** every remaining eligible run MUST be conditionally changed from PENDING to FAILED
- **AND** each overflow failure MUST use the stable `BACKTEST_STARTUP_QUEUE_FULL` class
- **AND** startup reconciliation MUST NOT load the complete PENDING set into application memory

#### Scenario: Backtest startup reconciliation is not complete
- **WHEN** stale RUNNING cleanup or bounded PENDING reconciliation has not completed
- **THEN** backtest-scoped readiness MUST report `backtest.ready=false`
- **AND** the TCP handler MUST NOT accept commands
- **AND** the runner MUST NOT consume queued work

#### Scenario: Backtest startup reconciliation hits a database error
- **WHEN** stale RUNNING cleanup, bounded PENDING selection, overflow failure or pre-queue persistence throws an
  unexpected database error
- **THEN** startup reconciliation MUST fail
- **AND** backtest-scoped readiness MUST remain `backtest.ready=false`
- **AND** the TCP handler and runner MUST NOT start
- **AND** the error MUST propagate to the process startup boundary without an application-level database
  retry loop

#### Scenario: Backtest startup reconciliation completes
- **WHEN** stale RUNNING cleanup and bounded PENDING reconciliation complete
- **THEN** backtest-scoped readiness MUST report `backtest.ready=true`
- **AND** normal TCP acceptance and runner execution MAY begin

### Requirement: Backtest Health Shall Separate Process Liveness From Command Readiness
`apps/backtest` SHALL expose one internal structured HTTP health endpoint whose root service status and scoped
Backtest readiness have distinct meanings.

#### Scenario: Internal health is queried
- **WHEN** Docker-internal `GET /health` is queried while the process can serve HTTP
- **THEN** it MUST return actual HTTP `200` with a `BacktestHealthVo`
- **AND** the response MUST contain root `status="ok"`, `service="backtest"` and a `backtest` object
- **AND** the `backtest` object MUST contain `ready`, `state`, `activeCount`, `waitingCount`, `concurrency` and
  `queueCapacity`
- **AND** the endpoint MUST NOT use the public business `ApiResponseDto` envelope
- **AND** it MUST NOT be exposed through web gateway/Nginx or register a public strategy operation

#### Scenario: Hybrid listener configuration is omitted
- **WHEN** Backtest listener configuration uses schema defaults
- **THEN** `backtestEnvSchema` MUST provide HTTP `PORT=8004` and `BACKTEST_RPC_PORT=8005`
- **AND** `mistEnvSchema` MUST provide `BACKTEST_RPC_HOST=127.0.0.1`, `BACKTEST_RPC_PORT=8005` and
  `BACKTEST_HEALTH_URL=http://127.0.0.1:8004/health`
- **AND** business code MUST receive those values through `ConfigService` rather than read `process.env` or
  define another fallback

#### Scenario: Hybrid listener configuration is explicit
- **WHEN** a deployment overrides Backtest listener configuration
- **THEN** HTTP `PORT` and `BACKTEST_RPC_PORT` MUST each pass port validation
- **AND** the Backtest server MUST fail startup validation when the two listener ports are equal
- **AND** `BACKTEST_RPC_HOST` MUST be nonempty and `BACKTEST_HEALTH_URL` MUST be an absolute HTTP URL
- **AND** the same validated `BACKTEST_RPC_PORT` value MUST configure both Nest TCP server and client

#### Scenario: Backtest listeners are deployed in Compose
- **WHEN** the Windows appliance starts `backtest` and `mist-backend`
- **THEN** the server MUST receive `PORT=8004` and `BACKTEST_RPC_PORT=8005`
- **AND** the client MUST receive `BACKTEST_RPC_HOST=backtest`, `BACKTEST_RPC_PORT=8005` and
  `BACKTEST_HEALTH_URL=http://backtest:8004/health`
- **AND** neither 8004 nor 8005 MUST receive a host port mapping or web-gateway route

#### Scenario: Backtest health is not ready during startup reconciliation
- **WHEN** the HTTP listener is available but stale RUNNING cleanup, bounded PENDING reconciliation, scheduler
  initialization or TCP listener acceptance has not completed
- **THEN** root `status` MAY remain `ok` while `backtest.ready` MUST be false
- **AND** `backtest.state` MUST be `starting` or `reconciling`
- **AND** the TCP handler MUST NOT accept commands and the runner MUST NOT start work prematurely

#### Scenario: Nest or database initialization fails
- **WHEN** Nest bootstrap or TypeORM initialization throws before the HTTP listener is available
- **THEN** the error MUST propagate to the process startup boundary
- **AND** the application MUST exit rather than expose a permanently unready health process

#### Scenario: Backtest command runtime becomes ready
- **WHEN** every approved startup step and TCP acceptance has completed
- **THEN** health MUST publish `backtest.ready=true` and `backtest.state=ready`
- **AND** command acceptance and runner execution MAY begin

#### Scenario: Capacity is full or an individual run fails
- **WHEN** active slots and waiting capacity are full or an individual run fails
- **THEN** `backtest.ready` MUST remain true while the runtime can still classify commands
- **AND** capacity rejection MUST continue to use `queue_full`
- **AND** an individual run outcome MUST NOT turn service health into a container-restart signal

#### Scenario: Health diagnostics are produced
- **WHEN** health returns active/waiting/configured capacity diagnostics
- **THEN** all counts MUST be finite non-negative integers consistent with the in-memory scheduler and validated
  configuration
- **AND** health MUST NOT query MySQL for each probe
- **AND** it MUST NOT expose runId, securityCode or another high-cardinality identity

#### Scenario: The process begins shutdown
- **WHEN** `apps/backtest` receives its shutdown signal
- **THEN** it MUST first publish `backtest.ready=false` and `backtest.state=stopping`
- **AND** it MUST stop accepting new TCP commands before listener/process close
- **AND** V1 MUST NOT introduce a drain timeout, preemption, resume or executor-takeover protocol
- **AND** an interrupted RUNNING run MUST remain governed by the approved next-start failure rule

#### Scenario: Another health endpoint is considered
- **WHEN** Backtest health routes and internal RPC patterns are inspected
- **THEN** V1 MUST NOT add separate `/live`, `/ready` or health RPC operations
- **AND** Compose MUST use `/health` reachability for process liveness while deployment and Backtest-scoped
  compensation separately require `backtest.ready=true`

### Requirement: V1 Backtest Execution Shall Fail Explicitly Without Automatic Retry
V1 SHALL run exactly one `backtest` service instance, atomically claim only PENDING runs and SHALL NOT
automatically retry or resume interrupted runs.

#### Scenario: A worker claims a pending run
- **WHEN** one logical execution slot attempts to claim a run
- **THEN** the state transition MUST include a `status=PENDING` precondition
- **AND** evaluation MUST begin only when that atomic transition succeeds
- **AND** a failed claim MUST release that slot for the next eligible run

#### Scenario: The worker process restarts after interruption
- **WHEN** the new single instance finds a RUNNING run left by the interrupted predecessor
- **THEN** it MUST mark that run FAILED with an interruption reason
- **AND** the same short transaction MUST delete partial `BacktestSignalResult` rows for that run
- **AND** it MUST NOT return the run to PENDING or resume it automatically

#### Scenario: A user retries an interrupted backtest
- **WHEN** the user requests the backtest again
- **THEN** `apps/mist` MUST create a new `BacktestRun` identity
- **AND** the failed run MUST remain distinguishable for audit

#### Scenario: A running backtest encounters a non-target database error
- **WHEN** claim, historical K paging, result persistence or completion persistence throws an unexpected
  database error
- **THEN** the runner MUST stop evaluating the current run
- **AND** the run boundary MUST attempt exactly one short failure-cleanup transaction
- **AND** that transaction MUST conditionally change only PENDING or RUNNING to FAILED
- **AND** it MUST persist the stable failure class `BACKTEST_DATABASE_ERROR` rather than a raw driver message

#### Scenario: Failure cleanup confirms the failed transition
- **WHEN** the failure-cleanup conditional update affects one row
- **THEN** the same transaction MUST delete partial `BacktestSignalResult` rows for that run
- **AND** the state transition and deletion MUST commit or roll back together

#### Scenario: Failure cleanup does not own the current state
- **WHEN** the failure-cleanup conditional update affects zero rows
- **THEN** the cleanup MUST NOT delete result rows
- **AND** it MUST NOT overwrite a run that is already COMPLETED or FAILED

#### Scenario: Failure cleanup also fails
- **WHEN** the single failure-cleanup transaction throws
- **THEN** the runner MUST NOT retry that cleanup recursively
- **AND** it MUST log both the original execution error and cleanup error without allowing the latter to
  replace the former
- **AND** it MUST isolate the current run and continue the worker loop for later queued runs

#### Scenario: A database constraint error is classified
- **WHEN** result persistence raises a unique, foreign-key, nullability, type or other database error
- **THEN** it MUST use the non-target database failure and partial-result cleanup path
- **AND** `uq_backtest_signal_results_run_security_time` MUST NOT be converted into idempotent success, skip,
  readback or retry
- **AND** ordinary result persistence MUST NOT require a dedicated constraint classifier or pre-insert lookup

#### Scenario: A user repeats the same backtest
- **WHEN** a user submits the same strategy version, universe, period, source and time range again
- **THEN** `apps/mist` MUST create a new `BacktestRun` identity
- **AND** the new run MAY persist the same security and signal time as an older run
- **AND** `uq_backtest_signal_results_run_security_time` MUST constrain only duplicates within one run

#### Scenario: Backtest result identity schema is inspected
- **WHEN** runtime extraction is implemented
- **THEN** the existing `uq_backtest_signal_results_run_security_time` name and
  `(backtest_run_id, security_code, signal_time)` columns MUST remain unchanged
- **AND** this decision MUST NOT add or modify a database migration

### Requirement: Backtest Applications Shall Share Libraries Without Importing Applications
Backtest contracts, Strategy-owned Indicator calculations, strategy evaluation and persistence entities SHALL be provided by
responsibility-specific `libs/*` modules.

#### Scenario: Runtime dependencies are inspected
- **WHEN** `apps/mist`, `apps/backtest` and `apps/signal` are built
- **THEN** none of those applications MUST import another application's internal source
- **AND** shared computation MUST be consumed from approved libraries
- **AND** HTTP/RPC envelopes MUST be consumed from `libs/transport/http|rpc`

### Requirement: Historical Replay Shall Use The Shared Strategy Market Data Port
Backtest historical K SHALL be read through the replay capability of the internal `StrategyMarketDataPort`
without exposing a public unified K API or requiring a realtime Redis dependency.

#### Scenario: Backtest consumes the common domain contract
- **WHEN** the Backtest replay adapter is implemented
- **THEN** it MUST consume canonical `StrategyBar`, `StrategyMarketDataPort` and replay criteria/result types
  owned by `evolve-strategy-evaluation-contract`
- **AND** it MUST implement only the MySQL `readReplayPage()` capability
- **AND** it MUST NOT redefine realtime methods, import Signal application source or make Signal a prerequisite

#### Scenario: A replay page is requested
- **WHEN** `apps/backtest` reads one security, source, period and inclusive time range
- **THEN** it MUST call `readReplayPage()` with `StrategyReplayPageCriteria`
- **AND** it MUST use `afterTimestamp` and `timestamp ASC` keyset pagination
- **AND** each page MUST contain at most the internal fixed `REPLAY_PAGE_SIZE=1000`
- **AND** a subsequent page MUST use strict `timestamp > afterTimestamp`
- **AND** page size MUST NOT be exposed as HTTP, RPC, environment, strategy or caller input
- **AND** the reader MUST NOT use offset pagination or load a security/extension entity graph
- **AND** the result MUST be a canonical `StrategyReplayPage` rather than TypeORM `K` entities
- **AND** every historical `StrategyBar` MUST carry the required `type='complete'`
- **AND** the replay reader MUST NOT infer or synthesize realtime `incomplete` bars

#### Scenario: A provider-filled historical row is persisted
- **WHEN** TDX or QMT returns a bar under its configured `fillData/fill_data=true` behavior and the existing
  writer persists that row in MySQL `k`
- **THEN** Backtest MUST treat it as an authoritative historical `type='complete'` bar
- **AND** it MUST NOT attempt to infer provider-fill provenance, mark it incomplete, repair it or remove it

#### Scenario: Separate timestamps contain identical market values
- **WHEN** two persisted rows in the same security, source and period have different timestamps but identical
  OHLCVA values
- **THEN** the replay MUST consume both rows in timestamp order and count both toward the per-run bar limit
- **AND** it MUST NOT classify equal values as a duplicate or gap-filling error

#### Scenario: Provider-filled quantity is non-null
- **WHEN** a persisted provider-returned bar contains non-null volume or amount, including a value equal to the
  previous timestamp
- **THEN** the quantity MUST remain a raw `observed` value after approved unit mapping
- **AND** `QuantityForwardFillProjector` MUST NOT label it `forwardFilled`

#### Scenario: Provider fill scope is inspected
- **WHEN** Backtest runtime extraction is implemented
- **THEN** this change MUST NOT alter the TDX/QMT collection `fillData/fill_data` setting
- **AND** it MUST NOT add provider-fill provenance, a gap detector, historical cleanup, reimport or migration
- **AND** only a timestamp with no persisted MySQL row SHALL be considered a missing Backtest bar

#### Scenario: Replay crosses a page boundary
- **WHEN** a group contains more than 1000 accepted historical bars
- **THEN** the runner MUST consume one page before requesting the next page
- **AND** bounded context, Indicator windows, quantity projection and prior observations MUST remain continuous
  across the boundary
- **AND** every accepted bar in the requested range MUST be processed once without omission or duplication
- **AND** page size MUST NOT act as a calculation lookback or per-run capacity limit

#### Scenario: A replay page query fails
- **WHEN** any historical page query throws a database error
- **THEN** the error MUST propagate to the Backtest task boundary under the shared error-governance contract
- **AND** the reader MUST NOT retry, fall back, return a successful short page or publish partial results

#### Scenario: A replay page query is generated
- **WHEN** the MySQL replay adapter reads a first or subsequent page
- **THEN** it MUST use equality predicates for physical `security_id`, `source` and `period`
- **AND** it MUST use inclusive `timestamp >= startAt` and `timestamp <= endAt` predicates
- **AND** only a subsequent page MUST add strict `timestamp > afterTimestamp`
- **AND** it MUST use `ORDER BY timestamp ASC LIMIT 1000`
- **AND** it MUST project only columns needed to construct `StrategyBar`
- **AND** it MUST NOT use OFFSET, join or load security/extension relations, execute a preliminary `COUNT(*)` or
  add `FORCE INDEX`

#### Scenario: The existing K index is inspected before replay release
- **WHEN** real MySQL 8.4 replay query-plan evidence is collected
- **THEN** `SHOW INDEX FROM k` MUST confirm
  `uq_k_security_source_period_timestamp(security_id,source,period,timestamp)` in that order as a unique index
- **AND** evidence MUST include one representative high-density 1m group and one representative daily group
- **AND** each group MUST include a first-page query and a middle-page query with a real cursor
- **AND** `EXPLAIN FORMAT=JSON` and `EXPLAIN ANALYZE` MUST show that each representative query uses that unique
  index without a full table scan or filesort
- **AND** evidence MUST record estimated and actual rows, loops and execution time
- **AND** V1 MUST NOT invent a latency or estimate-ratio acceptance threshold before that evidence exists

#### Scenario: A representative replay query plan fails the gate
- **WHEN** a representative query does not use the approved unique index or performs a full table scan or filesort
- **THEN** replay implementation or release MUST stop for schema, parameter type, statistics and query-shape
  investigation
- **AND** V1 MUST NOT add `FORCE INDEX`, guess another index or create a K-table migration without focused review

#### Scenario: The representative replay query plan passes the gate
- **WHEN** every approved real-MySQL query-plan case uses the existing unique index without full scan or filesort
- **THEN** this change MUST NOT add another K index, entity index metadata or database migration

#### Scenario: Historical replay spans multiple database pages
- **WHEN** Backtest reads selected MySQL historical K across more than one page
- **THEN** the V1 operating contract MUST keep that selected historical range free from concurrent insert,
  update or delete until its replay read completes
- **AND** ordinary realtime snapshot or candle writes to Redis MUST NOT count as historical mutation
- **AND** the reader MUST use ordinary bounded page queries without a replay-long transaction or lock

#### Scenario: Snapshot machinery is inspected
- **WHEN** V1 historical replay is implemented under the no-concurrent-writer operating contract
- **THEN** it MUST NOT add pre/post `COUNT/MAX(updated_at)` fingerprints, a copied K snapshot, staging table,
  data revision, retry, new error code or database migration
- **AND** it MUST NOT claim that the operating invariant is enforced by runtime code
- **AND** concurrent historical writing, if introduced later, MUST first define snapshot semantics in a focused
  change

#### Scenario: Historical quantities enter a replay page
- **WHEN** exact MySQL quantity strings are mapped for an approved A-share source profile
- **THEN** `StrategyBar.volume` MUST mean shares and `StrategyBar.amount` MUST mean CNY yuan
- **AND** the mapper MUST use the shared Decimal8 primitive for canonical formatting and any approved exact
  integer unit scaling
- **AND** it MUST NOT pass the value through JavaScript number or expose provider-native units to the evaluator

#### Scenario: TDX historical quantities are mapped
- **WHEN** the accepted TDX A-share quantity profile maps an exact historical K
- **THEN** volume MUST remain the exact share value
- **AND** amount MUST be multiplied exactly by `10000` before constructing `StrategyBar`
- **AND** volume MUST be a non-negative integral decimal string

#### Scenario: QMT historical quantities are mapped
- **WHEN** the accepted QMT A-share quantity profile maps an exact historical K
- **THEN** integral provider lots MUST be multiplied exactly by `100` to produce shares
- **AND** amount MUST preserve the exact decimal string persisted from the provider float's observable value and
  MUST be interpreted as CNY yuan without further scaling

#### Scenario: Historical volume is fractional
- **WHEN** a TDX or QMT historical volume is nonzero and non-integral under its expected profile
- **THEN** a quantity-consuming execution MUST fail closed
- **AND** the mapper MUST NOT round, truncate or pass the value through JavaScript number

#### Scenario: A TDX or QMT historical source profile is not proven
- **WHEN** the applicable `(source, SecurityType.STOCK, period family)` lacks accepted quantity evidence
- **THEN** an execution plan that references `k.volume` or `k.amount` MUST remain ineligible for that source
- **AND** the reader MUST NOT guess a unit, dynamically inspect price ratios or silently return raw values as
  canonical shares/yuan
- **AND** execution plans that do not consume those fields MAY continue according to their own contract

#### Scenario: Historical quantity evidence is accepted
- **WHEN** a TDX or QMT quantity profile is proposed for approval
- **THEN** evidence MUST cover both 1m and daily raw provider values, their exact MySQL strings and resulting
  canonical values
- **AND** the profile MUST NOT be marked approved before real-chain fixture/HIL evidence is accepted by the
  project owner

#### Scenario: Historical storage is inspected
- **WHEN** the replay quantity mapper is introduced
- **THEN** this change MUST NOT modify, backfill or reinterpret MySQL `k.volume/amount` in place
- **AND** it MUST NOT add per-row quantity-unit columns or a database migration

#### Scenario: An intraday replay begins after the trading-day open
- **WHEN** the requested range begins mid-session and an execution plan consumes `k.volume` or `k.amount`
- **THEN** the runner MUST replay that security, source and period from the same trading day's session start to
  seed `QuantityForwardFillProjector`
- **AND** bars before the requested `startAt` MUST NOT publish `BacktestSignalResult` records for that run
- **AND** the preparation replay MUST NOT change the field's `calculationBarCount=1` or become caller lookback

#### Scenario: A replayed quantity is null after an earlier same-day value
- **WHEN** the raw current `StrategyBar` quantity is null and the same group and trading day has an earlier
  effective value
- **THEN** the projector MUST expose that earlier canonical decimal string to evaluation
- **AND** it MUST leave the raw bar and replay page unchanged
- **AND** volume and amount MUST resolve independently

#### Scenario: A replayed quantity contributes to a persisted result
- **WHEN** a matched Backtest evaluation consumes a current or prior quantity observation
- **THEN** `BacktestSignalResult.contextSnapshot` MUST use the serializer owned by
  `evolve-strategy-evaluation-contract`
- **AND** `k.volume/k.amount` MUST remain the canonical effective scalar actually evaluated
- **AND** every compiled-plan quantity observation MUST be represented under the applicable
  `quantityEvidence.current` or `quantityEvidence.previous` field with canonical `raw`, non-null canonical
  `effective` and `resolution='observed'|'forwardFilled'`
- **AND** evidence MUST be materialized before `all/any` runtime short-circuiting
- **AND** the same ordered context MUST produce the same evidence shape as live evaluation

#### Scenario: A replayed quantity remains unavailable
- **WHEN** a required current or prior quantity has no effective value after same-day projection
- **THEN** evaluation MUST be unavailable and MUST NOT persist a `BacktestSignalResult` or context snapshot
- **AND** `unavailable` MUST NOT be serialized as a quantity-evidence resolution

#### Scenario: A replay plan consumes no quantity
- **WHEN** the compiled execution plan does not reference `k.volume` or `k.amount`
- **THEN** its persisted context snapshot MUST omit `quantityEvidence`
- **AND** it MUST NOT copy a complete raw K or require a database migration for provenance

#### Scenario: A replayed quantity has no same-day predecessor
- **WHEN** the raw current quantity is null and the trading day has not observed a prior non-null value
- **THEN** that consumed field MUST be unavailable
- **AND** the projector MUST NOT read a future bar or inherit the previous trading day's value

#### Scenario: A daily replay encounters null quantity or suspension
- **WHEN** a daily bar has null quantity, or a suspended trading day has no K row
- **THEN** a daily null MUST remain unavailable because each daily bar starts a new trading-day projection group
- **AND** an absent MySQL suspended-day row MUST NOT be synthesized as a bar or evaluation anchor
- **AND** a provider-returned row already present for that day MUST instead be consumed as an authoritative
  complete bar

#### Scenario: The replay cursor is advanced
- **WHEN** securityId, source and period are fixed for the page sequence
- **THEN** timestamp MUST be the cursor because the existing K identity makes it unique within that group
- **AND** the reader MUST NOT add an offset cursor or require an id tie-breaker

#### Scenario: Backtest market-data capability is wired
- **WHEN** `apps/backtest` starts
- **THEN** it MUST wire only the MySQL replay capability needed by historical execution
- **AND** it MUST NOT require market Redis, sealed-bar triggers or snapshot observations

#### Scenario: Internal read types are named
- **WHEN** replay input and output types are declared
- **THEN** the internal selection input MUST use the `*Criteria` convention
- **AND** internal pages MUST NOT use HTTP `*QueryDto` or `*Vo` naming

### Requirement: Backtest Runtime Shall Not Own Live Signal State
`apps/backtest` SHALL NOT evaluate realtime triggers or persist live `StrategySignal` or PENDING
`StrategyAlertEvent` records.

#### Scenario: A historical backtest match is produced
- **WHEN** the backtest evaluator reports a signal-level match
- **THEN** the result MUST use the approved backtest persistence boundary
- **AND** it MUST NOT be persisted as a live signal or alert event

### Requirement: Runtime Extraction Shall Preserve Signal-Level Scope
Moving execution to `apps/backtest` SHALL preserve the approved signal-level backtest product contract and
SHALL NOT implicitly add portfolio execution semantics.

#### Scenario: The extracted runtime returns a completed run
- **WHEN** a signal-level historical replay completes
- **THEN** it MUST preserve the approved signal occurrences and aggregate signal statistics
- **AND** it MUST NOT require cash, positions, orders, fills, fees, slippage, NAV or portfolio returns

### Requirement: Unresolved Cross-Process Semantics Shall Be Approved Before Implementation
Deployment and environment-derived migration details SHALL be reviewed and recorded before their corresponding
code changes. Run-query, target-issue visibility, no-cancellation, partial-result publication, result
unique-conflict and result-pagination semantics are already fixed by this change.

#### Scenario: Implementation reaches an unresolved runtime decision
- **WHEN** the design still lists the decision as open
- **THEN** implementation MUST pause
- **AND** the accepted decision MUST be written to the change artifacts first
