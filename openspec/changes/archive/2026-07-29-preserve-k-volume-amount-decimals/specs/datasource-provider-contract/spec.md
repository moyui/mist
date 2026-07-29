## ADDED Requirements

### Requirement: Historical volume and amount preserve exact provider numeric semantics

TDX and QMT normalized historical bars SHALL expose `volume` and `amount` as decimal strings or explicit `null`. A finite provider value, including zero, MUST preserve its numeric value without float coercion, integer rounding, or zero filling.

#### Scenario: Provider returns a finite decimal

- **WHEN** TDX or QMT returns a finite `volume` or `amount`
- **THEN** the normalized historical contract MUST emit a decimal string representing the same numeric value
- **AND** it MUST NOT round volume to an integer or truncate amount to two decimal places before persistence

#### Scenario: Provider explicitly returns zero

- **WHEN** TDX or QMT explicitly returns numeric zero for `volume` or `amount`
- **THEN** the normalized contract MUST emit a decimal string representing zero
- **AND** the value MUST remain distinguishable from `null`

#### Scenario: Provider omits or returns an invalid optional measure

- **WHEN** `volume` or `amount` is missing, blank, non-numeric, `NaN`, positive infinity, or negative infinity
- **THEN** the normalized contract MUST emit that field as explicit `null`
- **AND** it MUST NOT synthesize zero
- **AND** an otherwise valid bar MUST NOT be discarded solely because either measure is `null`

#### Scenario: Provider returns invalid OHLC

- **WHEN** any required OHLC value is missing, blank, non-numeric, `NaN`, or infinite
- **THEN** the existing invalid-nonempty-history rejection behavior MUST remain in force

### Requirement: Historical decimal values are bounded before persistence

The datasource and backend SHALL reject finite `volume` or `amount` values that cannot fit `DECIMAL(36,8)` without rounding.

#### Scenario: Decimal exceeds configured precision or scale

- **WHEN** a finite provider value has more than 28 integer digits or more than eight fractional digits
- **THEN** the historical work item MUST fail validation
- **AND** no matching K row may be partially written or silently rounded
