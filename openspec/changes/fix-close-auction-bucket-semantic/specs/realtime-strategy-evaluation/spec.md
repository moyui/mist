# spec delta — realtime-strategy-evaluation

## MODIFIED Requirements

### Requirement: Consumer Session SHALL Align With The 242-Bucket Producer Universe

The Signal runtime `sessionPosition` SHALL accept triggerTimes in `[09:30, 11:31) ∪ [13:00, 15:01)`
Asia/Shanghai (half-open, matching the producer), so that the 11:30 and 15:00 session-terminal buckets are
consumed normally. TriggerTimes at or beyond 11:31 / 15:01 SHALL be rejected with `RangeError`, preserving
defense against producer-impossible garbage triggers (lunch break, deep post-close, pre-open).

The previous half-open session `[09:30, 11:30) ∪ [13:00, 15:00)` (240 buckets) caused the producer-legal
11:30/15:00 terminal triggers to throw `RangeError: finalized strategy trigger is outside A-share sessions`,
classifying legal input as garbage and filling the failed zset.

#### Scenario: A 15:00 terminal trigger is consumed normally

- **WHEN** a sealed `candle_finalized` trigger with `triggerTime = 15:00:00` Asia/Shanghai is processed
- **THEN** the job MUST NOT fail with `outside A-share sessions`
- **AND** the sealed 1m bar MUST enter the shared window
- **AND** the finalization cursor MUST advance
- **AND** in on-mode, evaluation and persistence MUST run as for any in-session trigger

#### Scenario: An 11:30 terminal trigger is consumed normally

- **WHEN** a sealed `candle_finalized` trigger with `triggerTime = 11:30:00` Asia/Shanghai is processed
- **THEN** the job MUST complete normally
- **AND** the sealed bar MUST enter the 1m window
- **AND** the cursor MUST advance

#### Scenario: A discarded terminal trigger advances the cursor without evaluation

- **WHEN** a discarded `candle_finalized` trigger with `triggerTime = 15:00:00` is processed (terminal bucket
  had no snapshot)
- **THEN** the job MUST complete normally
- **AND** the cursor MUST advance
- **AND** no evaluation MUST run (no bar to evaluate)

#### Scenario: A garbage trigger beyond 15:01 still fails

- **WHEN** a `candle_finalized` trigger with `triggerTime = 15:30:00` Asia/Shanghai is processed
- **THEN** the job MUST fail with `RangeError: finalized strategy trigger is outside A-share sessions`
- **AND** the failure SHALL NOT be reclassified as a normal completion

#### Scenario: A lunch-break trigger still fails

- **WHEN** a `candle_finalized` trigger with `triggerTime = 12:00:00` Asia/Shanghai is processed
- **THEN** the job MUST fail with `RangeError: finalized strategy trigger is outside A-share sessions`

#### Scenario: A pre-open trigger still fails

- **WHEN** a `candle_finalized` trigger with `triggerTime = 09:00:00` Asia/Shanghai is processed
- **THEN** the job MUST fail with `RangeError: finalized strategy trigger is outside A-share sessions`
