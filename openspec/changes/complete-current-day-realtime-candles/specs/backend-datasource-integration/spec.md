## ADDED Requirements

### Requirement: Providers Shall Normalize Realtime Quantities At Their Own Boundaries
TDX and QMT adapters SHALL validate their native volume and amount fields according to provider-specific
contracts before producing canonical decimal strings. For supported A-share stocks, the resulting canonical
unit SHALL be shares for volume and CNY yuan for amount.

#### Scenario: A native quantity is absent
- **WHEN** a provider omits an approved optional quantity or explicitly supplies null
- **THEN** the canonical field MUST remain null
- **AND** it MUST remain distinguishable from explicit zero

#### Scenario: A present native quantity is malformed
- **WHEN** a provider supplies a quantity with an empty value, type, sign, syntax, scale, finiteness, field
  length or range that violates its approved adapter contract
- **THEN** that symbol MUST fail closed rather than be converted to null
- **AND** another valid symbol in a multi-symbol QMT frame MAY continue independently

#### Scenario: TDX supplies a quantity as a number
- **WHEN** the accepted TDX contract requires a native decimal string
- **THEN** the frame MUST fail closed
- **AND** the backend MUST NOT infer a string by calling `String(number)`

#### Scenario: TDX supplies an oversized decimal string
- **WHEN** a present TDX `Volume` or `Amount` string exceeds 37 ASCII characters
- **THEN** the single-symbol snapshot MUST fail closed before decimal parsing or normalization
- **AND** the datasource native-object and backend frame byte limits MUST NOT substitute for the field limit

#### Scenario: The accepted TDX production runtime supplies quantity strings
- **WHEN** the pinned TDX bridge/runtime supplies native hands and ten-thousand-yuan decimal strings
- **THEN** the adapter MUST scale volume by `100` and amount by `10000`
- **AND** it MUST emit canonical shares/yuan strings through exact Decimal8 integer scaling
- **AND** it MUST NOT select or change the profile from payload values at runtime

#### Scenario: TDX bridge or runtime identity changes
- **WHEN** deployment changes the accepted terminal, bridge or runtime identity
- **THEN** candle productization MUST remain off or shadow until the fixed quantity profile is revalidated
- **AND** an observed profile contradiction MUST be handled by a reviewed OpenSpec delta rather than runtime
  inference or automatic profile switching

#### Scenario: QMT supplies native volume and amount
- **WHEN** safe integer volume and finite observable float amount pass the approved bounds
- **THEN** the adapter MUST scale stock volume from hands to shares by exact multiplication by `100`
- **AND** it MUST normalize amount as the provider's observable CNY-yuan value without rounding
- **AND** both outputs MUST be canonical decimal strings
- **AND** amount MUST retain approved provider-float precision provenance through source plus fixed adapter
  contract rather than a per-record precision field
- **AND** the adapter MUST range-check its canonical output without inventing a raw-text limit for native
  numeric input

#### Scenario: A non-stock security reaches quantity normalization
- **WHEN** the security is outside the approved A-share `SecurityType.STOCK` unit profile
- **THEN** the adapter MUST NOT apply the stock `×100` or `×10000` factors
- **AND** that security MUST remain ineligible for candle productization until its own unit contract is approved

#### Scenario: A quantity anomaly has not naturally occurred
- **WHEN** no real missing-field, malformed-value or profile-drift incident exists in current evidence
- **THEN** deterministic negative tests MUST prove fail-closed adapter behavior
- **AND** the absent incident MUST remain `not-observed` under `capture-realtime-provider-anomalies`
- **AND** lack of a manufactured anomaly MUST NOT block implementation or normal-path release
