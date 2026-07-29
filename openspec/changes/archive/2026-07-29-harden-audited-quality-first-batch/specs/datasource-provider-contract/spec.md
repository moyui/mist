## ADDED Requirements

### Requirement: Normalized TDX bars reject incomplete required prices
The TDX datasource SHALL emit a normalized bar only when `open`, `high`, `low`, and `close` are present and finite for the same provider timestamp. It MUST distinguish an explicit numeric zero from a missing, blank, non-numeric, or non-finite value.

#### Scenario: Required price series are misaligned
- **WHEN** any required OHLC series lacks the timestamp emitted by another bar series
- **THEN** the normalized request fails with a structured error identifying the source, symbol, timestamp, and invalid fields
- **AND** no zero-price substitute or partial normalized result is emitted

#### Scenario: Provider explicitly returns zero
- **WHEN** the provider returns an explicit finite numeric zero for a required price
- **THEN** the normalizer preserves that zero as provider data
- **AND** does not classify it as a missing field
