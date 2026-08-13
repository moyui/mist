## MODIFIED Requirements

### Requirement: Chan analysis results are request-time derived data

The Chan service SHALL compute merged K, fenxing, Bi, channel and Duan results from the supplied K input without
reading or writing Chan-result MySQL entities.

#### Scenario: Chan analysis is requested

- **WHEN** a caller supplies valid K input to a Chan calculation endpoint
- **THEN** the service MUST derive the result during the request
- **AND** it MUST NOT require persisted fenxing, Bi, Duan, period, or state rows

#### Scenario: The same deterministic input is evaluated again

- **WHEN** the same ordered K input is evaluated with the same algorithm version
- **THEN** the result MUST be reproducible without loading a prior Chan result
  from MySQL
