# spec delta — realtime-market-data-ingress

## MODIFIED Requirements

### Requirement: Producer Session SHALL Be Half-Open With 1-Minute Close Extension

The producer bucket resolver SHALL treat A-share sessions as half-open intervals extended by one minute at
each close to absorb post-close tail frames and the closing-auction print:

- morning `[09:30, 11:31)` Asia/Shanghai
- afternoon `[13:00, 15:01)` Asia/Shanghai

This produces exactly **242** 1-minute buckets per trading day (121 morning + 121 afternoon). The 11:30
bucket absorbs morning-close tail frames; the 15:00 bucket absorbs the closing-auction print (eventTime is
the provider push time, which lands at 15:00:xx). Frames at or after 11:31 / 15:01 are out-of-session and
SHALL NOT create a bucket.

The previous `CLOSE_DELAY_MIN` session-extension logic (which extended the afternoon to 15:02 inclusive and
created spurious 15:01/15:02 dead-time buckets from post-close repeated frames) SHALL be removed.

#### Scenario: The 15:00 closing-auction bucket is a legal session-terminal bucket

- **WHEN** a snapshot with `eventTime` in `[15:00:00, 15:01:00)` Asia/Shanghai arrives
- **THEN** `resolveCandleBucket` MUST return a non-null bucket with `bucketStartMs` at 15:00
- **AND** the bucket `session` MUST be `afternoon`

#### Scenario: The 11:30 morning-close bucket is a legal session-terminal bucket

- **WHEN** a snapshot with `eventTime` in `[11:30:00, 11:31:00)` Asia/Shanghai arrives
- **THEN** `resolveCandleBucket` MUST return a non-null bucket with `bucketStartMs` at 11:30
- **AND** the bucket `session` MUST be `morning`

#### Scenario: Post-close dead frames at or after 15:01 produce no bucket

- **WHEN** a snapshot with `eventTime` at or after 15:01:00 Asia/Shanghai arrives
- **THEN** `resolveCandleBucket` MUST return null
- **AND** no bucket is created for that frame (no 15:01/15:02 dead-time buckets)

#### Scenario: Lunch-break frames at or after 11:31 produce no bucket

- **WHEN** a snapshot with `eventTime` in `[11:31:00, 13:00:00)` Asia/Shanghai arrives
- **THEN** `resolveCandleBucket` MUST return null

### Requirement: Session-Terminal Buckets SHALL Have Extended Due Score

The two session-terminal buckets (11:30 and 15:00) SHALL have their finalization due score extended by
`CLOSE_AUCTION_GRACE_MS` (default 60000ms) beyond the normal grace, so that closing-auction and post-close
tail frames have time to arrive before the bucket is sealed. This replaces the removed `CLOSE_DELAY_MIN`
session-extension with a correct "sealing-delay-only" semantics: the bucket universe is not extended, only
the terminal bucket's sealing is delayed.

- Normal bucket due score: `bucketEnd + REALTIME_CANDLE_GRACE_MS` (unchanged)
- Terminal bucket due score: `bucketEnd + REALTIME_CANDLE_GRACE_MS + CLOSE_AUCTION_GRACE_MS`
- Terminal bucket hard horizon: `bucketStart + 60000 + FINALIZATION_HARD_HORIZON_MS + CLOSE_AUCTION_GRACE_MS`
- Terminal bucket aggregator admission: `acceptedAt <= bucketEnd + REALTIME_CANDLE_GRACE_MS + CLOSE_AUCTION_GRACE_MS`

#### Scenario: A normal bucket seals at its usual due score

- **WHEN** a non-terminal bucket (e.g. 14:30) is registered
- **THEN** its due score MUST be `bucketEnd + REALTIME_CANDLE_GRACE_MS`
- **AND** no auction grace extension is applied

#### Scenario: The 15:00 terminal bucket waits for closing-auction frames

- **WHEN** the 15:00 terminal bucket is registered
- **THEN** its due score MUST be `bucketEnd(15:01:00) + REALTIME_CANDLE_GRACE_MS + CLOSE_AUCTION_GRACE_MS`
- **AND** its hard horizon MUST be `bucketStart(15:00:00) + 60000 + FINALIZATION_HARD_HORIZON_MS + CLOSE_AUCTION_GRACE_MS`
- **AND** frames arriving within `[15:00:00, 15:01:00)` MUST be accumulated until the extended due

#### Scenario: The 11:30 terminal bucket waits symmetrically

- **WHEN** the 11:30 terminal bucket is registered
- **THEN** its due score MUST be `bucketEnd(11:31:00) + REALTIME_CANDLE_GRACE_MS + CLOSE_AUCTION_GRACE_MS`
- **AND** frames arriving within `[11:30:00, 11:31:00)` MUST be accumulated until the extended due

#### Scenario: A late closing-auction frame within the window is admitted

- **WHEN** a snapshot with `eventTime` 15:00:50 arrives at the producer
- **THEN** the aggregator MUST admit it into the 15:00 bucket
- **AND** the `late_after_grace` check MUST use the effective (extended) grace for the terminal bucket

#### Scenario: A terminal bucket with no frames emits a discarded trigger

- **WHEN** the 15:00 terminal bucket's extended due is reached and no frame was ever aggregated
- **THEN** the expected-due mechanism MUST emit a discarded `candle_finalized` trigger
- **AND** the trigger SHALL be handled identically to any other no-snapshot bucket

### Requirement: Producer Universe SHALL Stay Aligned With Consumer Session

An automated seam test SHALL enumerate the full producer minute domain and assert that every non-null
bucket is accepted by the Signal consumer session, and every garbage minute produces no bucket.

#### Scenario: Every producer-legal bucket is accepted by the consumer

- **WHEN** the test enumerates every minute from 09:30 through 15:01 Asia/Shanghai
- **THEN** each minute where `resolveCandleBucket` returns non-null MUST also be accepted by the Signal
  `sessionPosition`
- **AND** the count of non-null buckets MUST equal 242

#### Scenario: Garbage minutes produce no bucket

- **WHEN** the test enumerates minutes 09:00–09:29, 11:31–12:59, 15:01–15:30
- **THEN** `resolveCandleBucket` MUST return null for each
- **AND** no `candle_finalized` trigger for those minutes can be produced by the current producer
