## MODIFIED Requirements

### Requirement: Chan API behavior remains stable

Removing persistence-shaped classes and extracting ChanCore SHALL preserve Phase A/Phase B algorithm behavior,
request-time derivation, value semantics and ordering. The approved HTTP field migration SHALL rename K, merged-K,
Fenxing and Bi price interval fields from `highest/lowest` to `high/low` without compatibility aliases.

#### Scenario: Focused Chan regressions run

- **WHEN** the Chan calculation and OpenAPI tests execute after extraction
- **THEN** merged-K, Fenxing, Bi, Channel and two-phase algorithm values MUST remain unchanged
- **AND** their public price interval fields MUST use `high/low` recursively
- **AND** `highest/lowest` MUST be absent from the current HTTP response and OpenAPI contracts
