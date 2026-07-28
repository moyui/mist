## MODIFIED Requirements

### Requirement: CI covers every first-wave repository
The first-wave repositories SHALL have a minimal CI workflow matching their
toolchain.

#### Scenario: Monitoring CI starts
- **WHEN** monitoring CI runs
- **THEN** it MUST run Go formatting, vet, lint, and tests
- **AND** it MUST install a pinned pytest dependency
- **AND** it MUST run the Python contract suite with
  `python -m pytest tests`
