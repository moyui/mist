## ADDED Requirements

### Requirement: QMT historical command state is bounded
The QMT datasource SHALL bound historical command lifecycle state by active
count, retained-result count, retained-result age, and encoded payload bytes.
It MUST reserve terminal-result capacity before accepting a command.

#### Scenario: Gateway has capacity
- **WHEN** a JSON-safe command fits the command-byte limit and both outstanding
  and reserved-result limits have capacity
- **THEN** the gateway accepts it and preserves FIFO polling
- **AND** exactly one terminal result slot is reserved

#### Scenario: Gateway has no capacity
- **WHEN** accepting another command would exceed an outstanding or reserved
  result limit after expired state is pruned
- **THEN** the gateway rejects it with `QMT_COMMAND_CAPACITY_EXCEEDED`
- **AND** it MUST NOT evict unexpired accepted work

#### Scenario: Result cannot be retained safely
- **WHEN** a native result is non-JSON-safe, exceeds the per-result byte limit,
  or would exceed aggregate retained-result bytes
- **THEN** the gateway stores one bounded terminal failure for that command
- **AND** it MUST NOT retain the unsafe native result

### Requirement: QMT command lifecycle maintenance is deterministic
Every QMT command gateway boundary SHALL expire timed-out work and prune
completed results older than the fixed retention period before reporting state
or accepting more work.

#### Scenario: Completed result retention expires
- **WHEN** a completed result is older than its retention period
- **THEN** the gateway removes it and decrements retained bytes
- **AND** a later status lookup reports the command as unknown

#### Scenario: Poll limit is invalid
- **WHEN** a bridge requests a non-positive or above-limit command count
- **THEN** the datasource rejects the request before changing pending or
  in-flight state
