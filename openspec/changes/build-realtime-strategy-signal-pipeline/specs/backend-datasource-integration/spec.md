## ADDED Requirements

### Requirement: Provider quantities retain source-specific precision
TDX and QMT realtime adapters SHALL validate provider-native volume/amount according to their own contracts and
SHALL normalize accepted values to canonical decimal strings without inventing common native semantics.

#### Scenario: TDX quantity is present
- **WHEN** TDX native `Volume` or `Amount` is present
- **THEN** it MUST be a canonical decimal string fitting `DECIMAL(36,8)` without rounding
- **AND** numeric form MUST fail closed before backend conversion

#### Scenario: QMT quantities are present
- **WHEN** QMT native volume is a non-negative safe integer and amount is a finite provider float
- **THEN** backend MUST normalize their observable values to canonical decimal strings
- **AND** provenance MUST distinguish provider-integer volume from provider-float amount

#### Scenario: Quantity is unusable
- **WHEN** a quantity is unsafe, non-finite, negative or requires rounding beyond scale
- **THEN** it MUST become null or reject the required candle input according to the boundary contract
- **AND** it MUST NOT be silently converted to zero
