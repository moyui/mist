## ADDED Requirements

### Requirement: Quantity Arithmetic Shall Use One Shared Decimal8 Primitive
Mist SHALL provide one shared `Decimal8` value primitive for quantity arithmetic. Its in-process value SHALL be
a native `bigint` scaled by `100000000`, and accepted inputs and calculation results SHALL fit MySQL
`DECIMAL(36,8)` bounds of at most 28 integer digits and 8 fractional digits.

#### Scenario: A canonical quantity is parsed for calculation
- **WHEN** a non-null canonical decimal string enters candle, strategy or derived-period calculation
- **THEN** the shared primitive MUST convert it to an exact scale-eight bigint value
- **AND** it MUST reject values outside the approved precision, scale or range
- **AND** market and strategy consumers MUST NOT implement a second parser or comparator

#### Scenario: An arithmetic result exceeds the supported range
- **WHEN** addition or subtraction produces a value outside `DECIMAL(36,8)` bounds
- **THEN** the operation MUST fail closed before formatting, persistence or downstream evaluation
- **AND** it MUST NOT round, truncate, wrap or convert the result through JavaScript number

### Requirement: External Decimal Text Shall Normalize Once Into A Unique Canonical Form
An approved external decimal-text boundary SHALL accept only an ASCII unsigned fixed-point string matching
`^[0-9]+(?:\.[0-9]{1,8})?$`. After leading-zero normalization, its integer part SHALL contain at most 28
digits. It SHALL reject whitespace, signs, exponents, omitted integer or fractional digits, locale separators
and non-ASCII digits. Before grammar matching, scale validation or bigint construction, it SHALL reject raw
input longer than 37 ASCII characters, including input whose excess consists only of insignificant leading
zeros. Total HTTP body, native-object and WebSocket-frame limits SHALL remain independent defenses and SHALL
NOT replace this field limit. Provider-native syntax SHALL remain subject to its separately reviewed adapter
contract; a provider-native number has no invented raw-text length, but its adapter output SHALL fit the same
canonical range and maximum compact length.

#### Scenario: A strategy-create threshold contains insignificant zeros
- **WHEN** `k.volume` or `k.amount` receives the string `"001.2300"` at strategy creation
- **THEN** the create boundary MUST accept the decimal text and normalize it once to canonical `"1.23"`
- **AND** the immutable rule MUST persist only `"1.23"`

#### Scenario: A zero value contains fractional zeros
- **WHEN** an approved input boundary receives `"0.00000000"`
- **THEN** it MUST normalize the value to the single canonical zero representation `"0"`

#### Scenario: Raw fractional scale exceeds eight digits
- **WHEN** an input contains more than eight fractional digits, including `"1.230000000"`
- **THEN** it MUST be rejected before insignificant trailing zeros are removed
- **AND** normalization MUST NOT hide the input-scale violation

#### Scenario: Decimal text uses unsupported lexical syntax
- **WHEN** an input contains whitespace, `+`, `-`, exponent notation, `.5`, `1.`, a locale separator or a
  non-ASCII digit
- **THEN** the boundary MUST reject it rather than trim, localize or infer missing digits

#### Scenario: Decimal text exceeds the field limit
- **WHEN** an external decimal string contains more than 37 ASCII characters, including only additional
  leading zeros before an otherwise in-range value
- **THEN** the boundary MUST reject it before regex matching, scale validation or bigint construction
- **AND** it MUST NOT rely on the enclosing HTTP body, native object or WebSocket frame limit

### Requirement: Canonical Quantity Strings Shall Have One Compact Representation
A canonical quantity string SHALL be non-negative and SHALL contain no leading integer zero unless its integer
part is zero. A fractional part SHALL contain at most eight digits and, when present, SHALL end in a non-zero
digit. Zero SHALL be represented only as `"0"`. The canonical lexical form SHALL match
`^(?:0|[1-9][0-9]{0,27})(?:\.[0-9]{0,7}[1-9])?$`.

#### Scenario: An already-canonical value enters an internal boundary
- **WHEN** Redis, RPC domain input, strategy load/enable/registration or an immutable context receives a
  quantity string
- **THEN** it MUST require the unique canonical representation
- **AND** it MUST NOT repeatedly accept and normalize alternate equivalent spellings

#### Scenario: A fixed-scale MySQL value is mapped to a canonical bar
- **WHEN** the database driver reads `DECIMAL(36,8)` value `"1.00000000"`
- **THEN** the owning persistence mapper MUST normalize it once to canonical `"1"` before constructing the bar
- **AND** the evaluator and downstream consumers MUST NOT receive both representations

### Requirement: Decimal8 Shall Expose Only Approved V1 Operations
The shared `Decimal8` primitive SHALL expose only parse, format, compare, add, subtract and reviewed
non-negative integer unit-scaling operations plus range checking in V1. Unit scaling SHALL support the exact
provider conversion factors `100` and `10000`; it SHALL NOT expose general strategy multiplication. Zero and
counter-reset detection SHALL use exact comparison.

#### Scenario: A cumulative counter decreases
- **WHEN** a current non-negative counter is less than its non-negative baseline
- **THEN** the candle logic MUST classify a counter reset before computing the persisted delta
- **AND** it MUST NOT replace a negative subtraction result with zero

#### Scenario: A negative quantity reaches a domain boundary
- **WHEN** a signed internal Decimal8 result would be emitted as volume, amount or a corresponding threshold
- **THEN** the domain boundary MUST fail closed
- **AND** neither a negative value nor negative zero MUST enter canonical quantity state

#### Scenario: A provider quantity is converted to the canonical unit
- **WHEN** an approved adapter converts hands to shares or ten-thousand-yuan to CNY yuan
- **THEN** Decimal8 MUST multiply the exact scaled bigint by `100` or `10000`
- **AND** it MUST range-check the result before canonical formatting
- **AND** it MUST NOT round, divide or pass the value through JavaScript number

#### Scenario: A consumer requests unsupported decimal arithmetic
- **WHEN** a calculation requires multiplication other than approved provider integer unit scaling, division,
  averaging, ratios or rounding
- **THEN** V1 MUST NOT approximate that operation with bigint or JavaScript number
- **AND** a focused contract change MUST define its scale and rounding policy before implementation

### Requirement: Serialization Boundaries Shall Remain Decimal Strings Or Null
Validated HTTP/RPC domain output, JSON, Redis, strategy rules and immutable context snapshots SHALL represent
quantities as canonical decimal strings or `null`. MySQL/TypeORM SHALL keep exact decimal strings and SHALL
normalize driver-specific fixed-scale text at the owning mapper before it enters canonical domain state. Raw
bigint SHALL remain an in-process implementation detail, and `null` SHALL remain missing rather than become
zero.

#### Scenario: A Decimal8 result crosses a boundary
- **WHEN** an exact quantity is written to a payload, Redis record, database entity, rule snapshot or context
  snapshot
- **THEN** it MUST first be formatted as a canonical decimal string
- **AND** raw bigint MUST NOT be serialized
- **AND** the runtime MUST NOT install a global BigInt JSON patch, replacer or reviver

#### Scenario: A quantity is absent
- **WHEN** a canonical boundary supplies `null`
- **THEN** the caller MUST preserve its approved missing-value semantics outside `Decimal8`
- **AND** it MUST NOT parse the value as zero or an empty decimal string

### Requirement: Numeric Inputs Shall Not Be Compatibility-Coerced
The shared primitive SHALL parse approved decimal strings only. It SHALL NOT accept or derive an exact value
through `Number`, `String(number)`, `BigInt(number)` or implicit mixed number/bigint arithmetic.

#### Scenario: A strategy rule supplies a numeric decimal threshold
- **WHEN** validation encounters a JavaScript or JSON number for `k.volume` or `k.amount`
- **THEN** it MUST reject the rule at creation, load, enable or realtime registration
- **AND** it MUST NOT convert or rewrite the threshold

#### Scenario: A provider exposes a native numeric field
- **WHEN** an approved provider-specific adapter receives that field
- **THEN** only that adapter MAY normalize the provider's observable value according to its reviewed contract
- **AND** the shared Decimal8 primitive MUST NOT claim to recover precision already lost by the provider

### Requirement: V1 Shall Not Add A Decimal Dependency
V1 SHALL use native bigint for the approved finite operation set and SHALL NOT add a third-party decimal
library. Exact provider integer unit scaling does not require rounding. A future calculation requiring
non-integer scaling or rounding SHALL make its library choice in the change that owns those semantics.

#### Scenario: Market and strategy arithmetic are implemented
- **WHEN** dependencies and shared imports are inspected
- **THEN** candle aggregation, period aggregation and strategy comparison MUST consume the same primitive
- **AND** no decimal library or duplicated app-local arithmetic implementation MUST be added
