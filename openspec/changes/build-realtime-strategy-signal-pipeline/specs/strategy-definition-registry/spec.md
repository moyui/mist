## MODIFIED Requirements

### Requirement: Strategy Definitions Shall Be Versioned
Mist SHALL store business strategy identity separately from immutable paired-rule strategy versions and SHALL
update the definition and its current version atomically.

#### Scenario: A strategy is created
- **WHEN** a client creates a strategy definition with valid entry rule, optional exit rule and bounded lookback
- **THEN** the backend MUST persist one `StrategyDefinition`
- **AND** it MUST persist initial `StrategyVersion` number `1`
- **AND** the definition MUST reference that version as its current version
- **AND** all writes MUST commit or roll back together

#### Scenario: A strategy is updated
- **WHEN** a client updates paired rules, lookback or registry metadata
- **THEN** the backend MUST create a new immutable `StrategyVersion`
- **AND** it MUST update the definition current version pointer
- **AND** previous versions MUST remain available for signal/backtest reproducibility
- **AND** the definition update, version creation, and pointer update MUST commit or roll back together

#### Scenario: A current version is resolved
- **WHEN** the backend resolves a definition current version
- **THEN** the version MUST exist
- **AND** its `strategyDefinitionId` MUST equal the definition ID

### Requirement: Strategy Rules Shall Be Declarative And Validated
First-phase versions SHALL contain required `entryRule`, optional `exitRule` and bounded integer
`lookbackBars`, SHALL use one shared registered-field catalog, and MUST NOT accept arbitrary executable code.

#### Scenario: A paired rule version is accepted
- **WHEN** both present rules use catalogued fields, compatible value types and deterministic operators
- **THEN** the validator MUST accept the expression
- **AND** the persisted version MUST include normalized validation metadata and lookback

#### Scenario: Decimal rule is accepted
- **WHEN** `k.volume` or `k.amount` uses a supported comparison with a canonical decimal-string threshold
- **THEN** validation and evaluation MUST use the decimal comparator path

#### Scenario: Invalid or legacy rule is rejected
- **WHEN** a rule contains executable code, an unsupported path/operator, numeric decimal threshold, exponent
  form, invalid precision/scale or legacy public `rule`
- **THEN** the request MUST fail before persistence
- **AND** it MUST NOT be rewritten or dual-written for compatibility

## ADDED Requirements

### Requirement: Paired-rule schema migration is forward-only
The paired V1 physical schema SHALL be introduced through the next unapplied migration and matching ORM,
preflight, postflight and audit artifacts.

#### Scenario: Migration target is verified
- **WHEN** implementation begins
- **THEN** production `schema_migrations` and strategy table shape MUST be read before choosing the migration number
- **AND** migrations `001–013` MUST remain byte-for-byte unchanged

#### Scenario: Stored legacy rules are migrated
- **WHEN** the verified migration runs against the unused V1 schema
- **THEN** existing `rule` JSON MUST become `entry_rule`, `exit_rule` MUST be nullable and lookback MUST receive
  an explicit bounded default
- **AND** no rule-schema enum or compatibility column may be added
