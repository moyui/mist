> **延期状态**：本 delta 只保存未来评审候选，不授权当前实现。只有项目负责人重新明确授权并
> 复核当时基线后，以下 requirement 才能进入实施。

## ADDED Requirements

### Requirement: TDX and QMT expose verifiable target-day one-minute history

The existing normalized historical API SHALL support a source-specific
target-trading-day `Period.ONE_MIN` request for TDX and QMT without changing
the accepted schema-v2 formal realtime frame or the bridge behavior recorded
after prerequisite changes are archived; a successful response MAY contain
zero or any positive number of valid bars.

#### Scenario: Full-day history is requested

- **WHEN** Mist requests one provider symbol, one trading day, and `Period.ONE_MIN`
- **THEN** the datasource MUST return normalized bars with provider source identity and stable timestamps
- **AND** provider-native extension values required by the existing source-specific persistence path MUST remain available
- **AND** the datasource contract MUST NOT require an expected bar count, continuous minutes, or final-bucket coverage

#### Scenario: Provider successfully has no history for the requested day

- **WHEN** the terminal API call succeeds and returns no bars
- **THEN** the datasource MUST return a successful normalized empty collection
- **AND** it MUST NOT synthesize a placeholder, `null` K row, or realtime Redis candle

#### Scenario: Provider request fails or returns invalid nonempty history

- **WHEN** the terminal API returns an error or a nonempty result that cannot satisfy the historical contract
- **THEN** the datasource MUST distinguish that outcome from a successful empty collection
- **AND** it MUST NOT synthesize missing bars from realtime Redis candles

### Requirement: Historical regression preserves the accepted realtime baseline

Historical API verification SHALL leave the accepted schema-v2 formal
realtime transport contract and manually installed bridge artifacts unchanged.
The comparison baseline SHALL be the one recorded after prerequisite changes
are archived, not an earlier schema-v1 field set.

#### Scenario: Historical sync is implemented

- **WHEN** datasource contract tests are added for post-close history
- **THEN** historical API and TDX/QMT bridge behavior MUST remain unchanged relative to the accepted schema-v2 baseline
- **AND** formal realtime frame fixtures, installed bridge artifacts, provider-local bridge fences and transport modes MUST remain unchanged
- **AND** code, tests and fixtures MUST NOT require or reintroduce schema-v1 formal `streamEpoch`, `sequence`, `sequenceScope` or a per-symbol sequence fence
- **AND** accepted schema-v2 transport HIL MAY be referenced without rerun only when code/fixture diff and installed bridge path/SHA prove realtime artifacts are unaffected
- **AND** target-day TDX/QMT historical API regression MUST still run
