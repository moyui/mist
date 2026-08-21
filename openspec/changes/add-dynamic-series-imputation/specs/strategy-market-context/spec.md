## ADDED Requirements

### Requirement: The Projected Strategy Bar View Shall Carry An OHLC Imputation And An Extended Resolution

The shared projected strategy bar view SHALL expose an OHLC imputation view alongside the
existing quantity views: `ohlc` with `raw` (the original four-tuple or null), `effective` (the
imputed four-tuple or null) and `resolution`. The shared `resolution` vocabulary SHALL extend to
four values: `observed | forwardFilled | backfilled | unavailable`. The raw bar SHALL never be
modified; imputation exists only in the evaluation view. Effective OHLC values SHALL be monotonic
once determined (see the imputation spec).

#### Scenario: A projected bar exposes its OHLC view
- **WHEN** a bar is projected through the shared series imputer
- **THEN** the projected bar MUST expose `ohlc.raw`, `ohlc.effective` and `ohlc.resolution`
- **AND** the raw bar's OHLC MUST be unchanged
- **AND** the resolution MUST be one of `observed | forwardFilled | backfilled | unavailable`

#### Scenario: An observed OHLC is preserved
- **WHEN** a bar has complete finite OHLC
- **THEN** `ohlc.resolution` MUST be `observed`
- **AND** `ohlc.effective` MUST equal `ohlc.raw`

#### Scenario: Quantity resolution vocabulary is extended
- **WHEN** a quantity field is back-filled from a later anchor
- **THEN** its resolution MUST be `backfilled`
- **AND** existing `observed` / `forwardFilled` / `unavailable` semantics MUST remain unchanged

### Requirement: The DSL Field Catalog Shall Read Effective OHLC Values

The DSL field catalog entries `k.open`, `k.high`, `k.low` and `k.close` SHALL read the imputed
effective OHLC four-tuple when the projected bar carries one. A bar whose effective OHLC is
`unavailable` SHALL make any referenced OHLC field unavailable (`field_unavailable`) rather
than exposing the raw non-finite value. The raw bar SHALL remain untouched; the switch exists
only in the evaluation view consumed by the DSL.

#### Scenario: A DSL OHLC field reads the effective value
- **WHEN** a projected bar has `ohlc.effective` populated and the DSL references `k.close`
- **THEN** the field value MUST be the effective close
- **AND** it MUST NOT be the raw close when the two differ

#### Scenario: An unavailable effective OHLC makes the field unavailable
- **WHEN** a projected bar has `ohlc.effective === null` and the DSL references `k.open`
- **THEN** the evaluation context MUST report `field_unavailable`
- **AND** no raw non-finite value MUST leak into the context
