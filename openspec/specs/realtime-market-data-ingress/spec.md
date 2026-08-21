# realtime-market-data-ingress Specification

## Purpose
Define the strict schema-v2 TDX/QMT native-map transport, provider-specific
canonical conversion, lifecycle readiness, bounded parsing, and side-effect
boundary for realtime market-data ingress.
## Requirements
### Requirement: Realtime transport uses a stable native envelope
TDX and QMT datasource services SHALL emit only schema-v2
`realtime.native_snapshot` frames. The outer object SHALL contain exactly
`type`, `provider`, `timestamp`, and `data`; `data` SHALL contain exactly
`schemaVersion`, `capturedAt`, and a provider-symbol-keyed `native` map.
Schema-v1 formal epoch, sequence, acquisition-profile, and standalone-symbol
fields SHALL NOT remain an active compatibility path.

#### Scenario: TDX native snapshot is emitted
- **WHEN** the TDX gateway accepts a converged official `get_market_snapshot` result
- **THEN** it emits `provider=tdx` with exactly one provider-symbol entry in
  `data.native`
- **AND** it preserves the complete TDX native object without datasource
  canonical projection

#### Scenario: QMT native snapshot is emitted
- **WHEN** the QMT collector accepts a native `get_full_tick` result
- **THEN** it emits `provider=qmt` with one or more bounded provider-symbol
  entries in `data.native`
- **AND** it preserves each complete QMT native object

#### Scenario: Legacy formal frame arrives

- **WHEN** a frame declares schema v1 or contains `streamEpoch`, `sequence`,
  `sequenceScope`, `acquisitionProfile`, or standalone `symbol`
- **THEN** strict decoding MUST reject it
- **AND** runtime MUST NOT translate it into schema v2

### Requirement: Backend owns canonical realtime conversion
The Mist backend SHALL validate source-native fields through source-specific adapters and SHALL produce one `CanonicalRealtimeSnapshot` shape before any product consumer is invoked.

#### Scenario: Valid source frame reaches ingress
- **WHEN** a TDX or QMT frame passes schema-v2 envelope, provider, native-map,
  and allowlist identity validation
- **THEN** the source adapter preserves `native` and derives canonical prices, cumulative volume/amount, `eventTime`, `capturedAt` and quality

#### Scenario: Native event time is unavailable
- **WHEN** a provider frame has no trustworthy native event time
- **THEN** canonical `eventTime` is null and quality marks native time unavailable
- **AND** the backend MUST NOT substitute its current clock as provider event time

### Requirement: Transport acceptance is side-effect-free
The formal ingress introduced by this capability MUST remain memory-only until a later productization change explicitly supplies a product sink.

#### Scenario: Canonical snapshot is accepted
- **WHEN** common ingress accepts a canonical TDX or QMT snapshot
- **THEN** bounded state and diagnostics may update
- **AND** Redis, MySQL, K aggregation, scanners, signals, alerts, notifications and trading entry points remain untouched

### Requirement: Formal realtime naming replaces experimental runtime naming
Active runtime code, configuration, routes, payloads, errors, metrics, scripts and current documentation SHALL use formal realtime naming and MUST NOT retain an executable experimental or legacy realtime path.

#### Scenario: Repository naming guard runs
- **WHEN** CI searches active sources and current docs for realtime experimental or legacy identifiers
- **THEN** no forbidden identifier remains outside archive, historical evidence, or an explicit migration note

#### Scenario: Formal routes are requested
- **WHEN** backend and datasource connect after the breaking cutover
- **THEN** they use `/ws/realtime/{source}/{clientId}` and formal internal diagnostics
- **AND** old experimental WebSocket and diagnostic routes do not exist

### Requirement: TDX and QMT production runtimes are builtin by default
Production deployment SHALL configure TDX and QMT realtime as `builtin`, SHALL probe both as normal production sources, and SHALL retain per-source `off` only as an explicit operator rollback state.

#### Scenario: Production desired state is applied
- **WHEN** the verified realtime release is promoted to production
- **THEN** datasource, backend and monitoring all use `TDX_REALTIME_MODE=builtin` and `QMT_REALTIME_MODE=builtin`
- **AND** absence of either setting deterministically resolves that source to the production default `builtin`

#### Scenario: Operator rolls one source back
- **WHEN** an operator applies the recorded TDX or QMT realtime rollback
- **THEN** that source changes to `off`, its realtime routes/client stop, monitoring reports the intentional mode, and the other source remains active

### Requirement: Windows HIL gates production activation

The unified schema-v2 contract and both new converters MUST NOT become the
production baseline until Windows HIL verifies both affected source paths,
restart/rollback behavior and protected-table digest invariance.

#### Scenario: Trading-session HIL runs

- **WHEN** TDX `600030.SH` and QMT `300502.SZ` are validated during supported
  sessions
- **THEN** evidence MUST include fresh schema-v2 native-map delivery,
  datasource bridge readiness, backend canonical readback and monitoring
  convergence for both sources

#### Scenario: QMT trading-session HIL runs

- **WHEN** QMT `300502.SZ` is validated during a supported session
- **THEN** evidence MUST include fresh single/whole callback maps, exact integer subscription IDs, unsubscribe return semantics and QMT-converter canonical readback
- **AND** it MUST not require a datasource-to-backend sequence

#### Scenario: TDX trading-session HIL runs

- **WHEN** TDX is validated after the formal-frame cutover
- **THEN** evidence MUST cover
  `get_market_snapshot -> one-entry schema-v2 map -> new TDX converter -> common ingress`
- **AND** it MUST prove absence of `producerSequence`, formal sequence and epoch/sequence fencing

#### Scenario: HIL runs outside a trading session

- **WHEN** validation runs outside a supported exchange session
- **THEN** owner, control, restart and accepted fixture evidence MAY be retained
- **AND** it MUST NOT be presented as fresh-provider-data evidence

### Requirement: Realtime protocol and bridge readiness are distinct
The datasource realtime ready frame SHALL identify successful protocol negotiation separately from terminal bridge-owner readiness, and the backend SHALL expose the accepted protocol state as `transportReady`.

#### Scenario: Datasource emits realtime ready metadata
- **WHEN** a TDX or QMT backend client completes WebSocket negotiation
- **THEN** the datasource emits a `realtime.ready` frame whose data includes `bridge.ready`, `bridge.ownerId`, `bridge.ownerGeneration`, and `bridge.bridgeBuildId`
- **AND** `data.source` is the domain label `TDX` or `QMT` while the outer transport `provider` remains lowercase `tdx` or `qmt`
- **AND** it does not emit `tdxRealtimeBridgeReady`, `collectorReady`, a top-level owner `generation`, or `datasourceBuildId`

#### Scenario: Backend receives a retired ready shape
- **WHEN** a ready frame uses a retired top-level readiness or owner field instead of the normalized nested bridge object
- **THEN** the backend rejects the frame as a contract mismatch
- **AND** it does not set `transportReady`

#### Scenario: Backend accepts a realtime ready frame
- **WHEN** a source client validates the ready frame
- **THEN** backend diagnostics set `transportReady=true`
- **AND** retain bridge-owner state separately
- **AND** do not infer subscription or market-data freshness from either value

### Requirement: Realtime messages are bounded and parsed once
Each backend realtime client SHALL enforce the raw UTF-8 frame byte limit before JSON parsing and SHALL route ready, control, and native snapshot messages from that single parsed object.

#### Scenario: An oversized message arrives
- **WHEN** a WebSocket message exceeds the configured raw byte limit
- **THEN** the backend rejects it before `JSON.parse`
- **AND** no protocol, bridge, or snapshot state is updated

#### Scenario: A native snapshot arrives
- **WHEN** a bounded message parses to a native snapshot envelope
- **THEN** strict native-map validation consumes the parsed envelope
- **AND** the raw text is not parsed a second time

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

### Requirement: QMT realtime quality is latest-state

The QMT callback native object SHALL be classified as a `latest-state native
snapshot`. Equality between callback fields and `get_full_tick` fields SHALL
describe the snapshot schema only and MUST NOT prove tick-complete delivery.

#### Scenario: Whole callback reports changed symbols

- **WHEN** a whole callback contains only symbols whose cached latest values changed
- **THEN** every accepted native entry MAY be forwarded
- **AND** callback cardinality or field completeness MUST NOT be used as proof that every exchange tick was delivered

### Requirement: Current-K records are not native tick snapshots

Any future `get_market_data_ex(period='1m', count=1)` record SHALL be modeled
separately from `realtime.native_snapshot`.

#### Scenario: A current-minute record is evaluated

- **WHEN** a provider current-K record lacks the callback tick native shape
- **THEN** it MUST NOT be emitted in the unified schema-v2 native snapshot
- **AND** this focused change MUST NOT add that current-K event

### Requirement: Canonical Realtime Quantities Shall Use Decimal Strings
`CanonicalRealtimeSnapshot.cumulativeVolume` and `cumulativeAmount` SHALL be canonical decimal strings or
`null`; for approved A-share stocks their units SHALL be shares and CNY yuan respectively. OHLC values SHALL
remain finite numbers.

#### Scenario: A provider snapshot is accepted
- **WHEN** its native quantity fields pass provider-specific validation
- **THEN** canonical quantities MUST preserve the accepted numeric value after the provider adapter's exact
  conversion to shares and CNY yuan
- **AND** they MUST NOT be converted back to JavaScript number
- **AND** the snapshot MUST NOT add per-record unit or precision fields

### Requirement: Candle Sink Failure Shall Not Roll Back Transport Acceptance
The ingress SHALL update its bounded latest-memory state before invoking an optional candle sink and SHALL
isolate sink failure from transport acceptance.

#### Scenario: The candle sink rejects an accepted snapshot
- **WHEN** latest-memory update has already succeeded
- **THEN** the accepted snapshot MUST remain the latest transport state
- **AND** sink degradation MUST be reported separately

### Requirement: TDX Canonical Event Time Shall Use Validated CapturedAt
The TDX source converter SHALL map the schema-v2 datasource `capturedAt` directly to canonical `eventTime`
because the accepted runtime has no provider-native business-time field. It SHALL NOT read `AsOf`, `DateTime`
or another native time alias. This approved source exception SHALL NOT apply to QMT.

#### Scenario: TDX schema-v2 snapshot reaches its converter
- **WHEN** the common decoder has validated `capturedAt` as RFC3339
- **THEN** TDX canonical `eventTime` MUST equal that `capturedAt`
- **AND** quality MUST mark event time available and aggregation eligible
- **AND** neither datasource send time nor backend receipt/current time may replace it

#### Scenario: QMT native event time is unavailable
- **WHEN** the QMT converter cannot resolve one consistent fixture-backed business time
- **THEN** canonical `eventTime` MUST remain null and aggregation-ineligible
- **AND** QMT MUST NOT fall back to datasource `capturedAt`

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

### Requirement: Realtime subscription convergence is not data-flow evidence

订阅收敛（datasource 四态收敛 / controller registry 一致）SHALL 视为
"订阅命令已应用"的状态证据，MUST NOT 视为"行情数据在流动"的投递证据；
收敛后数据的持续流动 SHALL 由独立活动信号（快照接收 / 回调进展）观测，
静默场景由状态驱动的轮询重发与 stall 检测补充
（realtime-subscription-restart-recovery R1/R2）。

#### Scenario: 收敛但回调静默

- **WHEN** 桥/终端重启后 datasource 显示收敛（desired/converged 一致）
      但终端回调实际丢失（callback_count 归零、无快照）
- **THEN** 收敛状态 MUST NOT 抑制轮询重发（PUSHING 态下发全量 subscribe）
- **AND** stall 检测 MUST 以活动信号（快照/回调）为判定依据，不以收敛
      状态为投递证据

#### Scenario: 推送验证后稳定态语义不变

- **WHEN** datasource 观察到快照流动（推送成功），状态切 VERIFIED
- **THEN** poll 返回 diff（现有增量语义），桥零动作
- **AND** 状态机重发 MUST 为叠加动作，不改变 poll diff / result 四态
      收敛的正常路径语义
