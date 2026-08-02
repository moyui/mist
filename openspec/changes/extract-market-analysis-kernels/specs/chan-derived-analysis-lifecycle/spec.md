## ADDED Requirements

### Requirement: Chan Adapters Shall Own Data Retrieval
Chan HTTP adapters SHALL retrieve and validate ordered K inputs before invoking the shared pure Chan kernel;
the kernel SHALL NOT query or persist market data.

#### Scenario: A Chan API request is processed
- **WHEN** the adapter resolves the requested K data
- **THEN** it MUST convert that data to the kernel-owned input contract
- **AND** no Chan entity or persistence path MUST be introduced
