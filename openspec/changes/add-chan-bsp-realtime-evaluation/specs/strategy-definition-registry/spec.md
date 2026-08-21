## ADDED Requirements

### Requirement: Strategy Definitions Shall Carry A Kind That Selects Rule Semantics

A `StrategyDefinition` SHALL carry a `kind` column selecting the rule semantics:
`rule_dsl` (the existing field/operator rule tree, the default) or `chan_bsp` (the Chan buy/sell
point configuration). The registry SHALL compile the rule according to the kind; the rule content
schema is owned by the kind. Existing definitions without an explicit kind SHALL behave as
`rule_dsl`.

#### Scenario: A definition is created with an explicit kind
- **WHEN** a caller creates a strategy definition with `kind='chan_bsp'`
- **THEN** the definition MUST persist the kind
- **AND** the rule MUST be validated against the chan_bsp schema (units/points/direction,
  single realtime period)

#### Scenario: A definition is created without a kind
- **WHEN** a caller creates a strategy definition without specifying `kind`
- **THEN** the definition MUST default to `rule_dsl`
- **AND** the rule MUST be validated against the existing DSL schema

#### Scenario: An invalid chan_bsp rule is submitted
- **WHEN** a caller submits a chan_bsp rule with an unknown `units`, an empty `points`,
  an invalid `direction`, or `periods` that is not exactly one value in {1,5,15,30,60}
- **THEN** the submission MUST be rejected through the existing validation envelope
- **AND** the registry MUST NOT compile a plan for it

### Requirement: Signal Registry Compilation Shall Dispatch By Kind

The Signal registry SHALL compile each enabled definition's rule according to its `kind`:
`rule_dsl` through the existing rule compiler unchanged; `chan_bsp` through a chan_bsp config
compiler that produces a `ChanBspPlan` (units, point switches, direction and an internal window
budget derived from the configured level). The registry definition's execution plan SHALL be a
discriminated union over the two plan shapes; the `ruleSnapshot` SHALL retain the original rule
object for both kinds. A compilation failure for either kind SHALL reject the definition from the
registry under the existing registry failure semantics.

#### Scenario: The registry loads enabled definitions of both kinds
- **WHEN** the registry loads its initial snapshot or refreshes one definition
- **THEN** rule_dsl definitions MUST compile through the existing compiler
- **AND** chan_bsp definitions MUST compile through the chan_bsp config compiler
- **AND** both plan shapes MUST be addressable through the execution plan union

#### Scenario: A chan_bsp definition is disabled or fails validation
- **WHEN** a chan_bsp definition is disabled, missing its current version, or fails config
  validation during refresh
- **THEN** it MUST be removed from the registry under the existing refresh semantics
- **AND** the prior registry snapshot MUST remain in effect on failure

#### Scenario: A chan_bsp plan is exposed for evaluation
- **WHEN** the worker requests execution plans for a `(securityId, source)`
- **THEN** eligible chan_bsp plans MUST be returned with the same filtering and stable ordering as
  rule_dsl plans
- **AND** the plan MUST NOT expose or compute momentum indicators or Chan structure — evaluation
  belongs to the detector, not the registry
