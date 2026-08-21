## MODIFIED Requirements

### Requirement: K And Chan HTTP Outputs Shall Use Canonical Price Field Names
Mist-owned K and Chan HTTP response models SHALL expose price interval fields as `high` and `low`, matching the
canonical K entity and ChanCore contracts. They SHALL NOT expose `highest` or `lowest` compatibility fields.

#### Scenario: Raw K data is returned
- **WHEN** `POST /v1/indicators/k` returns a K item
- **THEN** the item MUST contain `high` and `low`
- **AND** it MUST NOT contain `highest` or `lowest`

#### Scenario: Derived Chan data is returned
- **WHEN** merge-K, Fenxing, Bi, Channel, Duan or Duan-level Channel data is returned by `/v1/chan/*`
- **THEN** every price interval owned by K, merged K, Fenxing, Bi, Duan, Channel or Duan-level Channel MUST use
  `high` and `low`
- **AND** the same rule MUST apply recursively to `mergedData`, `originData`, `startFenxing`, `endFenxing`,
  Channel `bis`, Duan `originBis` and Duan-level Channel `duans`
- **AND** Chan-specific `zg/zd/gg/dd` fields MUST remain unchanged

#### Scenario: OpenAPI describes K and Chan responses
- **WHEN** the generated OpenAPI schemas for these endpoints are inspected
- **THEN** each endpoint MUST reference its actual response VO rather than a request DTO
- **AND** the documented response schemas MUST include `high/low` and exclude `highest/lowest`

#### Scenario: Persisted K data supplies an HTTP response
- **WHEN** the application maps a TypeORM K entity into a K or Chan response
- **THEN** the existing `k.high` and `k.low` values MUST be copied without changing precision or meaning
- **AND** this field migration MUST NOT create a database migration, change a physical column or write Chan data
