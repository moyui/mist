## ADDED Requirements

### Requirement: Provider-local common names expose matching responsibilities
The maintained backend and datasource realtime implementations SHALL use the same provider-local filename for responsibilities shared by TDX and QMT, while provider-specific capabilities SHALL be declared as explicit exceptions rather than represented by empty modules.

#### Scenario: Shared responsibilities are compared
- **WHEN** the repository layout guard inspects TDX and QMT source packages
- **THEN** source service, realtime client, module, store, types, runtime, contract, route, and dependency responsibilities use their agreed provider-local common paths
- **AND** declared provider-only capabilities are not treated as missing counterparts

### Requirement: Legacy realtime paths do not remain callable
The maintained implementation SHALL remove legacy internal import paths and SHALL NOT add compatibility re-export modules for the renamed TDX/QMT realtime files.

#### Scenario: Old path is referenced
- **WHEN** tests scan maintained source, configuration, and current documentation
- **THEN** no runtime import or operator instruction targets a forbidden legacy path

### Requirement: Production bridges have stable source-specific identities
Each production builtin bridge SHALL use the `mist_<source>_realtime_bridge.py` identity, and diagnostic runtime probes SHALL live outside production bridge directories with probe-specific names.

#### Scenario: Operator prepares Windows bridge files
- **WHEN** current deployment documentation lists files to copy into TDX and QMT terminals
- **THEN** it names `mist_tdx_realtime_bridge.py` and `mist_qmt_realtime_bridge.py`
- **AND** it does not present a runtime probe as a production bridge

### Requirement: Layout normalization preserves external behavior
The layout normalization SHALL preserve public HTTP and WebSocket paths, realtime frame fields, fencing and sequence semantics, source mode switches, allowlists, health payloads, and metric names.

#### Scenario: Existing contract suites run after normalization
- **WHEN** backend and datasource contract tests exercise TDX and QMT realtime paths
- **THEN** observable protocol behavior matches the pre-normalization contract
