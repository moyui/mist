## ADDED Requirements

### Requirement: Concurrent alert dedupe is a successful skip
The strategy scanner SHALL rely on the existing named database unique index to
serialize concurrent creation of the same alert dedupe key. Only a conflict
from that exact index SHALL be classified as a skipped duplicate.

#### Scenario: Two scans race on one dedupe key
- **WHEN** both scans pass the application pre-check and attempt the same
  dedupe key concurrently
- **THEN** exactly one signal and linked alert event commit
- **AND** the losing transaction rolls back its signal and reports one skipped
  duplicate

#### Scenario: Another database error occurs
- **WHEN** signal/alert persistence fails for any reason other than the named
  dedupe unique index
- **THEN** the scanner propagates the error
- **AND** it MUST NOT count the failure as a skipped duplicate
