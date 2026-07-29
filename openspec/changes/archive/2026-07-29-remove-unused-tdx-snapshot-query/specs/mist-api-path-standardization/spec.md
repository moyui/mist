## MODIFIED Requirements

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
