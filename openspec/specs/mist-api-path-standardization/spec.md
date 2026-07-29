## Purpose

Define Mist backend API path conventions for version-first product routes,
removed legacy aliases, deployment gateway prefix boundaries, and stable
collector/datasource route assumptions.
## Requirements
### Requirement: New Preferred Paths Shall Use Version First

Mist backend business APIs SHALL expose preferred paths using the
`/v1/<resource>` style.

#### Scenario: Preferred security paths are inspected

- **WHEN** the backend route metadata is inspected
- **THEN** security management MUST expose `/v1/securities`,
  `/v1/securities/:code`, `/v1/security-sources`, and
  `/v1/securities/:code/sources` routes

#### Scenario: Preferred analysis paths are inspected

- **WHEN** the backend route metadata is inspected
- **THEN** indicator routes MUST expose `/v1/indicators/*` paths
- **AND** Chan routes MUST expose `/v1/chan/*` paths

### Requirement: Legacy Business Paths Shall Not Remain Registered

Existing Mist backend business paths SHALL be removed after clients migrate to
preferred `/v1` paths.

#### Scenario: Legacy security paths are inspected

- **WHEN** route compatibility is checked
- **THEN** existing `/security/v1/*` routes MUST NOT remain registered

#### Scenario: Legacy analysis paths are inspected

- **WHEN** route compatibility is checked
- **THEN** existing `/indicator/*` and `/chan/*` routes MUST NOT remain
  registered

### Requirement: Gateway Prefixes Shall Remain Deployment Concerns

Backend controllers SHALL NOT include production gateway prefixes in route
definitions.

#### Scenario: Preferred backend route is documented

- **WHEN** a preferred backend path is documented or tested
- **THEN** it MUST use the service-local path such as `/v1/securities`
- **AND** it MUST NOT include `/api/mist` or `/api/chan` as part of the
  controller path

### Requirement: Collector And Datasource Routes Shall Remain Stable

The supported collector and datasource routes SHALL remain outside Mist backend
controller path migrations, while orphaned datasource product routes MAY be
removed through an explicit breaking OpenSpec change.

#### Scenario: Collector path is inspected

- **WHEN** this change is applied
- **THEN** `/v1/collector/collect` MUST remain the collection endpoint

#### Scenario: Datasource route assumptions are inspected

- **WHEN** this change is applied
- **THEN** `/v1/bars/query` MUST remain outside the Mist backend controller
  migration scope
- **AND** `/v1/snapshots/query` MUST be absent because its independent product
  contract has been removed
