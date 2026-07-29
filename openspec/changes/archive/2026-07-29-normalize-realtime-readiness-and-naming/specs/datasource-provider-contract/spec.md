## MODIFIED Requirements

### Requirement: Provider packages separate runtime and contract concerns
Each datasource realtime provider SHALL expose owner or command gateway behavior from `realtime/gateway.py` and frame validation or protocol constants from `realtime/contract.py`, while retaining provider-native objects without cross-provider normalization. Provider-specific runtime orchestration SHALL remain in a narrowly scoped runtime module only when that distinct responsibility exists.

#### Scenario: Realtime provider modules are imported
- **WHEN** TDX or QMT application wiring loads its realtime implementation
- **THEN** owner or command gateway logic comes from the provider-local `realtime/gateway.py`
- **AND** frame contract validation comes from the provider-local `realtime/contract.py`
- **AND** QMT subscription collector orchestration remains in `realtime/runtime.py`
- **AND** TDX does not retain a compatibility `realtime/runtime.py`
