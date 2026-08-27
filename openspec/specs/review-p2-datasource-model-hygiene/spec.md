# review-p2-datasource-model-hygiene Specification

## Purpose
Track the P2 datasource model hygiene remediation: TDX route dependencies, shared normalization helpers and explicit closure criteria for the selected findings.
## Requirements
### Requirement: Selected datasource model P2 findings are explicit

This remediation batch SHALL select CODE_REVIEW M9 and L6 plus
CODE_SMELL_REVIEW R2.4, P2.4, T2.1, T2.2, T2.3, M2.1, M2.3, N2.4, C2.1,
O2.4, and F2.3 for implementation in `mist-datasource`.

#### Scenario: Batch evidence is audited

- **WHEN** the change is ready for archive
- **THEN** its evidence MUST map every selected review ID to changed files and
  verification commands
- **AND** the implementation MUST NOT claim unrelated P2/P3 review items are
  complete

### Requirement: TDX route dependencies avoid delayed main imports

TDX route helpers touched by this batch SHALL get provider or adapter
dependencies from FastAPI request app state instead of importing `tdx.main`
inside request handlers.

#### Scenario: Provider is available in app state

- **WHEN** a touched TDX route resolves its provider dependency
- **THEN** it MUST read the provider from `request.app.state`
- **AND** it MUST NOT import `tdx.main` inside the dependency helper

#### Scenario: Provider is missing

- **WHEN** a touched TDX route cannot resolve the provider dependency
- **THEN** it MUST return a clear unavailable HTTP error rather than failing
  with an import-cycle or attribute error

### Requirement: Datasource normalization helpers are shared

TDX provider normalization SHALL route repeated key matching, field naming, and
optional numeric conversion through shared helper functions.

#### Scenario: Native key matching is case and separator insensitive

- **WHEN** provider normalization looks up native fields such as `SGCode`,
  `sg_code`, or `sg code`
- **THEN** it MUST use one shared key normalization helper
- **AND** it MUST return the same value regardless of underscore, whitespace, or
  case differences

#### Scenario: Optional numeric fields are empty

- **WHEN** optional provider fields receive `None`, an empty string, or a blank
  string
- **THEN** optional numeric conversion MUST return `None`
- **AND** required bar normalization MAY still use the existing
  missing-to-zero helper where the route contract requires numeric zeros

#### Scenario: Provider field names are serialized

- **WHEN** a selected provider model is serialized to a normalized response
- **THEN** field naming conversion MUST be performed by one shared serializer
  path instead of per-method hand-written conversion loops

### Requirement: Selected provider and adapter contracts are typed

Selected datasource provider and adapter public methods SHALL expose narrower
return models or aliases than raw `dict[str, Any]` where the normalized response
shape is known.

#### Scenario: TDX provider returns selected normalized models

- **WHEN** selected TDX provider methods such as snapshot or formula helpers
  produce normalized responses
- **THEN** tests MUST prove those responses are built through typed models or
  typed serializer helpers

#### Scenario: TDX and QMT adapters expose selected typed return aliases

- **WHEN** type/static hygiene tests inspect selected adapter methods
- **THEN** those methods MUST avoid avoidable broad `Any` return annotations
  for known snapshot, tick, or subscription result shapes

### Requirement: Datasource timeout and health semantics are explicit

Selected timeout defaults and health error handling SHALL be explicit,
configurable, and observable.

#### Scenario: Formula timeout default is configured

- **WHEN** selected formula provider calls omit a timeout
- **THEN** the datasource MUST use the configured default timeout value
- **AND** tests MUST prove the hard-coded `10000`ms operational default is not
  duplicated in provider call sites

#### Scenario: Health provider call fails

- **WHEN** the TDX provider health probe raises an unexpected exception
- **THEN** the health response MUST include an error marker or message
- **AND** it MUST preserve the overall response envelope instead of swallowing
  the failure silently

### Requirement: Datasource documentation matches the implemented dependency model

Repository-facing datasource documentation SHALL describe the actual app-state
dependency and normalized model boundaries introduced by this batch.

#### Scenario: Documentation is checked

- **WHEN** repository hygiene tests inspect datasource docs
- **THEN** `CLAUDE.md` or README guidance MUST NOT instruct route files to
  import `tdx.main` inside `_get_adapter`
- **AND** it MUST mention the app-state dependency path used by touched routes

