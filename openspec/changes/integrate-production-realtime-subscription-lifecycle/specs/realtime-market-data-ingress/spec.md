## ADDED Requirements

### Requirement: Assignment and effective inventory gate product ingress

When production subscription lifecycle is on, backend SHALL resolve provider symbols through immutable realtime assignments and SHALL derive desired from current Security status, but SHALL admit a canonical snapshot to product sinks only while the matching `(securityId,source)` is present in current provider-confirmed effective inventory. ACTIVE desired alone MUST NOT authorize product admission.

#### Scenario: Security is ACTIVE before provider convergence

- **WHEN** an assigned Security is ACTIVE but no fresh readback proves it active
- **THEN** backend MUST report pending/drifted/blocked/unknown as applicable
- **AND** the assignment MUST NOT become an effective candle listener

#### Scenario: An inactive Security awaits reset removal

- **WHEN** Security is SUSPENDED or DELISTED but last fresh provider evidence still reports assignment active
- **THEN** backend MAY continue accepting its snapshots under the prior effective inventory
- **AND** it MUST NOT claim removal until a fresh readback proves absence
- **AND** no public Security status path MUST call provider unsubscribe

#### Scenario: Provider readback proves removal

- **WHEN** a current readback no longer contains the assigned provider symbol
- **THEN** backend MUST atomically remove the market series from effective inventory
- **AND** it MUST clean common latest state for that `(securityId,source)`
- **AND** it MUST stop future listener registration while preserving terminal handling for a bucket already registered by the candle owner

#### Scenario: Snapshot source disagrees with immutable assignment

- **WHEN** a TDX or QMT snapshot resolves to a security assigned to the other source or to no realtime assignment
- **THEN** backend MUST reject it with a stable low-cardinality authorization reason
- **AND** it MUST not choose a source from snapshot arrival order, desired state or freshness
