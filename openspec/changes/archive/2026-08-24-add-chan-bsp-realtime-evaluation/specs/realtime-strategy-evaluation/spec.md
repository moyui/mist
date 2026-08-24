## ADDED Requirements

### Requirement: Realtime Evaluation Shall Dispatch By Plan Kind

`RealtimeStrategyEvaluationService.evaluate` SHALL dispatch each eligible execution plan by its
`kind`: `rule_dsl` plans SHALL be evaluated through the existing DSL rule evaluator unchanged;
`chan_bsp` plans SHALL be evaluated through the Chan BSP detector over the same projected realtime
window. Both kinds SHALL produce the shared `ShadowStrategyCandidate` shape, so episode activation,
persistence and delivery remain kind-agnostic. The evaluation level SHALL come from the plan's
period (the single configured level); the detector SHALL run only when a bar of that period is
emitted, preserving the existing period-based throttling.

#### Scenario: An eligible rule_dsl plan is evaluated
- **WHEN** a bar is emitted for a plan with `kind='rule_dsl'`
- **THEN** it MUST be evaluated through the existing DSL rule evaluator
- **AND** the existing field/operator evaluation semantics MUST be unchanged

#### Scenario: An eligible chan_bsp plan is evaluated
- **WHEN** a bar is emitted for a plan with `kind='chan_bsp'` and the projected window satisfies
  the plan's window budget
- **THEN** the Chan BSP detector MUST be invoked with the projected window and the plan
- **AND** confirmed points MUST be mapped to candidates with the shared candidate shape
- **AND** `signalKind` MUST be derived from the point type (buy → `entry`, sell → `exit`)
- **AND** the candidate's context snapshot MUST carry the point type, unit level, confirmation
  time, price and related channel bounds

#### Scenario: A chan_bsp plan has an insufficient window
- **WHEN** the projected window is shorter than the plan's internal window budget
- **THEN** the plan MUST be evaluated as not matched (no candidate)
- **AND** it MUST NOT fail the job or be classified as evaluation `unavailable`

### Requirement: Chan Bsp Candidates Shall Persist Through The Shared Candidate Pipeline

In on mode, a chan_bsp candidate SHALL persist through the same `LiveStrategyPersistenceService`
and notification delivery path as rule_dsl candidates: one Signal record with
`signalSource=LIVE` and one linked PENDING AlertEvent in a single transaction, followed by the
existing delivery queue handoff. No new persistence path, entity or delivery contract SHALL be
introduced for the chan_bsp kind.

#### Scenario: A chan_bsp candidate is persisted in on mode
- **WHEN** mode is `on` and the detector confirms a point
- **THEN** the candidate MUST be persisted through the shared persistence service
- **AND** the dedupe key and delivery flow MUST be identical to rule_dsl candidates
- **AND** no chan_bsp-specific entity, table or queue SHALL be added
