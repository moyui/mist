## ADDED Requirements

### Requirement: TDX realtime previous close uses one exact native key

The TDX realtime datasource and backend converter SHALL accept only exact provider-native `LastClose` as the previous-close input and SHALL map it to canonical `prices.lastClose`. They MUST NOT treat `PreClose`, camelCase `lastClose`, spacing variants, or case-normalized variants as aliases.

#### Scenario: Exact native LastClose is received

- **WHEN** a TDX realtime native snapshot contains finite `LastClose`
- **THEN** datasource validation accepts the previous-close field
- **AND** backend maps it to canonical `prices.lastClose`

#### Scenario: Retired previous-close alias is received

- **WHEN** a TDX realtime native snapshot supplies `PreClose` or `lastClose` without exact `LastClose`
- **THEN** datasource validation rejects the frame
- **AND** backend conversion does not use the retired alias
