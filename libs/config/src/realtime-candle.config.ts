export const REALTIME_CANDLE_GRACE_LIMITS = Object.freeze({
  default: 5_000,
  min: 1_000,
  max: 30_000,
});

/**
 * Extra finalization grace for session-terminal buckets (11:30 / 15:00).
 *
 * The terminal buckets absorb post-close tail frames (11:30) and the
 * closing-auction print (15:00), whose provider eventTime lands inside the
 * terminal minute but may arrive late. Their due score is
 * `bucketEnd + REALTIME_CANDLE_GRACE_MS + CLOSE_AUCTION_GRACE_MS` so the
 * auction frame has time to arrive before sealing. This replaces the removed
 * `CLOSE_DELAY_MIN` session-extension with a sealing-delay-only semantics:
 * the bucket universe is not extended, only the terminal bucket's sealing is
 * delayed. See openspec/changes/fix-close-auction-bucket-semantic.
 */
export const REALTIME_CANDLE_TERMINAL_GRACE_LIMITS = Object.freeze({
  default: 60_000,
  min: 0,
  max: 180_000,
});

export const REALTIME_CANDLE_QUEUE_LIMITS = Object.freeze({
  perSeries: Object.freeze({ default: 8, min: 1, max: 256 }),
  global: Object.freeze({ default: 256, min: 16, max: 4_096 }),
});

/** Recovery window for event-based candle degraded verdicts (candle-degraded-event-recovery). */
export const REALTIME_CANDLE_DEGRADED_RECOVERY_WINDOW_LIMITS = Object.freeze({
  default: 300_000,
  min: 60_000,
  max: 900_000,
});
