import type { RealtimeSource } from '../realtime.types';

/**
 * A-share trading session that a bucket belongs to.
 *
 * Snapshots outside any session (pre-open, lunch break 11:30–13:00, post-close
 * beyond the close-delay window) yield `session: null` and do NOT participate
 * in candle aggregation.
 */
export type CandleSession = 'morning' | 'afternoon';

/**
 * Result of resolving an eventTime to a trading-day/session/bucket triple.
 * `null` means the eventTime falls outside any session → the snapshot may
 * still update the memory latest but must not be aggregated into a candle.
 */
export interface CandleBucket {
  /** `YYYYMMDD` in Asia/Shanghai derived from the eventTime. */
  tradingDay: string;
  session: CandleSession;
  /** Bucket start as epoch milliseconds (minute-aligned, seconds/ms zeroed). */
  bucketStartMs: number;
  /** Bucket end = bucketStart + 60000ms. */
  bucketEndMs: number;
}

/**
 * Validity of an open or sealed candle.
 *
 * `valid` candles carry provisional OHLCV that may be sealed.
 * `invalid` candles carry a reason and must be discarded by the finalizer
 * (no HSET, no K query exposure). See design.md "异常 candle 丢弃".
 */
export type CandleValidity = 'valid' | 'invalid';

export type InvalidReason =
  | 'invalid_event_time'
  | 'invalid_price'
  | 'session_violation'
  | 'baseline_unavailable'
  | 'counter_reset'
  | 'queue_overflow'
  | 'no_snapshot'
  | 'backend_restart_open_state_lost'
  | 'redis_due_registration_failed'
  | 'redis_finalization_failed'
  | 'candidate_capacity_exceeded'
  | 'invalid_ohlc';

/**
 * Compact canonical projection of the closing snapshot.
 *
 * design.md (lines 150-160) explicitly forbids copying the full native object
 * or order book into the closed record — only these allowlisted scalars.
 * Transport generation and schema-v1 sequence do not belong to candle state.
 */
export interface ClosingSnapshot {
  securityId: number;
  providerSymbol: string;
  source: RealtimeSource;
  eventTime: string;
  capturedAt: string;
  price: number;
  cumulativeVolume: string | null;
  cumulativeAmount: string | null;
  quality: {
    level: string;
    eventTimeAvailable: boolean;
    aggregationEligible: boolean;
    partialPrices: boolean;
  };
}

/**
 * In-progress aggregation state for one `securityId + source + tradingDay`.
 *
 * Kept in Node memory only (never in Redis). The finalizer reads this to
 * produce a {@link SealedCandle}; on restart, any due bucket missing its
 * Node open state is discarded (`backend_restart_open_state_lost`).
 */
export interface OpenCandleState {
  tradingDay: string;
  source: RealtimeSource;
  providerSymbol: string;
  securityId: number;
  session: CandleSession;
  bucketStartMs: number;
  bucketEndMs: number;

  // Snapshot-sampled provisional OHLC.
  open: number;
  high: number;
  low: number;
  close: number;

  // Non-negative deltas since baseline.
  volumeDelta: string | null;
  amountDelta: string | null;

  // Effective preceding counters used to calculate this interval. When no
  // preceding counter exists, observations are retained for the next bucket
  // but this bucket's interval quantity remains unavailable.
  baselineCumulativeVolume: string | null;
  baselineCumulativeAmount: string | null;
  firstCumulativeVolume: string | null;
  firstCumulativeAmount: string | null;

  // Cumulative totals at the moment of the last applied snapshot — used to
  // compute the next delta and to detect counter resets.
  lastCumulativeVolume: string | null;
  lastCumulativeAmount: string | null;

  firstEventTime: string;
  lastEventTime: string;
  lastAppliedEventTimeMs: number;

  // The most recent snapshot that closed this bucket (overwritten in place).
  closingSnapshot: ClosingSnapshot | null;

  validity: CandleValidity;
  invalidReason: InvalidReason | null;
}

/**
 * Immutable output of sealing an open bucket. The future Redis finalizer
 * writes this into the closed-candle Hash; strategy changes (not this change)
 * consume it.
 */
export interface SealedCandle {
  tradingDay: string;
  source: RealtimeSource;
  providerSymbol: string;
  securityId: number;
  session: CandleSession;
  bucketStartMs: number;
  bucketEndMs: number;

  open: number;
  high: number;
  low: number;
  close: number;
  volume: string | null;
  amount: string | null;

  /** Closing cumulative totals — the baseline for the NEXT bucket. */
  closingCumulativeVolume: string | null;
  closingCumulativeAmount: string | null;

  closingSnapshot: ClosingSnapshot | null;

  firstEventTime: string;
  lastEventTime: string;

  validity: CandleValidity;
  invalidReason: InvalidReason | null;
  /** `quality=provisional` per design — all realtime candles are sampled. */
  quality: 'provisional';
}

/**
 * Outcome of applying a snapshot to the aggregator. Tells the caller whether
 * the snapshot was accepted into a candle, skipped (out of session / no
 * eventTime / duplicate), or caused the previous bucket to roll over.
 */
export type ApplySnapshotOutcome =
  | { kind: 'opened' | 'updated'; bucket: CandleBucket }
  | { kind: 'rolled-over'; prior: CandleBucket; opened: CandleBucket }
  | {
      kind: 'skipped';
      reason:
        | 'out_of_session'
        | 'no_event_time'
        | 'duplicate_or_late'
        | 'late_after_grace'
        | 'candidate_capacity_exceeded'
        | 'not_aggregation_eligible';
    }
  | { kind: 'invalidated'; reason: InvalidReason; bucket: CandleBucket };
