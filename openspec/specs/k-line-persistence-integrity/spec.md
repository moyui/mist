# k-line-persistence-integrity Specification

## Purpose
TBD - created by archiving change fail-closed-uninitialized-k-prices. Update Purpose after archive.
## Requirements
### Requirement: Required K-line prices have an invalid uninitialized state

The backend `K` entity SHALL initialize `open`, `high`, `low`, and `close` to a process-local non-finite sentinel rather than numeric zero.

#### Scenario: K entity is constructed without price assignments

- **WHEN** backend code constructs a new `K` entity without assigning required prices
- **THEN** each OHLC property is non-finite
- **AND** no property is indistinguishable from an explicit provider zero

### Requirement: Base K-line persistence fails closed on invalid prices

The backend MUST reject a nonempty base K-line save batch before issuing a database insert when any row has a missing, non-number, `NaN`, or infinite `open`, `high`, `low`, or `close` value.

#### Scenario: A required price is non-finite

- **WHEN** a TDX, QMT, EastMoney, or other caller submits a base K-line row with any non-finite required price
- **THEN** the shared persistence boundary rejects the batch
- **AND** it does not issue a K-line insert
- **AND** the error identifies the invalid row and fields

#### Scenario: All required prices are finite

- **WHEN** every required price in the batch is a finite number
- **THEN** the shared persistence boundary permits normal K-line upsert processing

#### Scenario: Provider explicitly returns numeric zero

- **WHEN** a required price is the finite numeric value `0`
- **THEN** the shared persistence boundary accepts that value

### Requirement: Database price schema remains required and numeric

The change SHALL keep MySQL OHLC columns non-null `DECIMAL(20,2)` values and MUST NOT attempt to store the process-local non-finite sentinel.

#### Scenario: Change is deployed

- **WHEN** this backend change is applied
- **THEN** no database schema migration or existing-row repair is required

### Requirement: QMT historical mapping preserves result completeness

The backend QMT historical mapper MUST reject a nonempty provider result when any candidate row has a missing, blank, non-numeric, `NaN`, or infinite `open`, `high`, `low`, or `close` value. It MUST NOT silently remove the malformed row and return a partial result.

#### Scenario: QMT row has invalid required prices

- **WHEN** a QMT historical response contains a candidate row with one or more invalid required OHLC values
- **THEN** the complete fetch fails before persistence
- **AND** the error identifies the provider symbol, row key, and invalid fields
- **AND** no partial row collection is returned

#### Scenario: QMT row contains explicit numeric zero

- **WHEN** a QMT historical response contains finite numeric zero for one or more required OHLC values
- **THEN** the mapper preserves the zero and returns the row normally

