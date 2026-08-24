## ADDED Requirements

### Requirement: Production subscription lifecycle is observable without high-cardinality identity

Backend and monitoring SHALL expose source-scoped ACTIVE-assignment desired, active and converged counts, deferred-removal count, convergence state, lifecycle mode, last attempt/success age, bounded trigger/result totals and stable failure reasons. Monitoring MUST preserve TDX native-list and QMT durable-registry evidence as distinct bounded enums and MUST NOT infer convergence from root health or transport readiness.

#### Scenario: A source converges

- **WHEN** fresh provider-specific readback equals the complete desired set
- **THEN** health and metrics MUST report the source converged with matching desired/active counts and bounded success age
- **AND** TDX or QMT evidence kind MUST identify the actual readback owner

#### Scenario: ACTIVE desired and active differ

- **WHEN** a fresh readback does not equal ACTIVE-assignment desired
- **THEN** health MUST report drifted or blocked as applicable
- **AND** monitoring MUST not replace the observed active count with desired count

#### Scenario: Deactivation is deferred

- **WHEN** an inactive assignment remains present in fresh provider evidence until reset
- **THEN** health MUST report drifted with deferred-removal count/reason
- **AND** monitoring MUST not report it as immediate unsubscribe failure or converged

#### Scenario: No fresh readback exists

- **WHEN** transport is disconnected, readback is stale or an outcome is unknown
- **THEN** monitoring MUST report unknown rather than active zero or converged
- **AND** root service health MUST not erase the component uncertainty

#### Scenario: Lifecycle trigger is counted

- **WHEN** intraday activation, ready/reconnect or weekday-09:15 triggers a round
- **THEN** metrics MAY label only source, bounded trigger, result and stable reason enums
- **AND** providerSymbol, securityId, assignment ID, subId, ownerId, generation, path, digest and free-form exception text MUST NOT become labels

### Requirement: QMT startup reconciliation exposes aggregate evidence

QMT datasource health and monitoring SHALL expose bounded startup replay/recovery state, recoverable/unrecoverable aggregate counts, attempt result totals, duration/age, journal health and `reconciliationRequired`. It MUST NOT expose individual IDs, symbols, journal paths or owner identity as metric labels.

#### Scenario: Journal replay recovers exact IDs

- **WHEN** startup replay classifies one or more exact-ID lifecycles
- **THEN** health MUST report aggregate recoverable count and recovery phase
- **AND** monitoring MUST not claim physical live handles solely from replay

#### Scenario: A startup unsubscribe returns false

- **WHEN** one recovery attempt returns exact false
- **THEN** monitoring MUST count a stable unconfirmed result and keep reconciliation required
- **AND** it MUST not report the lifecycle resolved or the source converged

#### Scenario: Journal evidence is structurally unknown

- **WHEN** replay finds missing ID, invalid hash/checkpoint state or another unresolvable lifecycle
- **THEN** health MUST report an aggregate unknown/blocking state with a bounded reason
- **AND** protected diagnostics MAY retain sanitized details without exporting high-cardinality labels
