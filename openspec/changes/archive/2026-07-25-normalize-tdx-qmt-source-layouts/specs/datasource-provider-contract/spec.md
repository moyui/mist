## ADDED Requirements

### Requirement: Provider packages separate runtime and contract concerns
Each datasource realtime provider SHALL expose provider-local runtime behavior from `realtime/runtime.py` and frame validation or protocol constants from `realtime/contract.py`, while retaining provider-native objects without cross-provider normalization.

#### Scenario: Realtime provider modules are imported
- **WHEN** TDX or QMT application wiring loads its realtime implementation
- **THEN** runtime ownership and transport logic come from the provider-local runtime module
- **AND** frame contract validation comes from the provider-local contract module

### Requirement: Runtime probe configuration is tooling-only
QMT runtime probing SHALL use `MIST_QMT_RUNTIME_PROBE_OUTPUT_PATH` only from the tooling probe and SHALL NOT expose spike evidence configuration through production datasource settings.

#### Scenario: Production QMT datasource settings load
- **WHEN** the QMT datasource starts without runtime probe tooling
- **THEN** no spike evidence directory is required or initialized
