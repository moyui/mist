## ADDED Requirements

### Requirement: Native snapshot conversion belongs to the backend source boundary
Each backend source SHALL convert its own `RealtimeNativeFrame` into `CanonicalRealtimeSnapshot` before invoking shared realtime ingress, and shared ingress SHALL accept canonical snapshots without branching on provider-native fields.

#### Scenario: TDX frame enters backend
- **WHEN** the TDX realtime client receives a valid native frame
- **THEN** the TDX source adapter preserves its native object and maps its canonical fields before shared ingress

#### Scenario: QMT frame enters backend
- **WHEN** the QMT realtime client receives a valid native frame
- **THEN** the QMT source adapter preserves its native object and maps its canonical fields before shared ingress

#### Scenario: Shared ingress processes a snapshot
- **WHEN** a source adapter submits a `CanonicalRealtimeSnapshot`
- **THEN** shared ingress stores that snapshot without inspecting provider-native fields or choosing a provider adapter
