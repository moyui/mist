import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import type { CandleBucket, CandleSession } from './candle.types';

/**
 * Convert a realtime snapshot's eventTime to its trading-day / session / bucket.
 *
 * Pure function — no I/O, no clock, deterministic from the eventTime string.
 * The aggregator and finalizer both rely on this to decide bucket membership
 * and partition keys.
 *
 * A-share sessions (Asia/Shanghai):
 *   morning   09:30 – 11:30
 *   afternoon 13:00 – 15:00   (plus a close-delay window to 15:02 for the
 *                              last bucket, per B1 design line 271)
 *
 * Snapshots outside these windows (pre-open, lunch 11:30–13:00, deep
 * post-close) return `null` → they may still refresh the memory latest but
 * must not be aggregated into a candle.
 *
 * HK sessions are not handled here yet; they require HIL-confirmed close-auction
 * timing (design mentions 16:10) and will be added in a follow-up.
 */
const TIME_ZONE = 'Asia/Shanghai';

// Session boundaries in zoned wall-clock minutes-of-day.
const MORNING_START_MIN = 9 * 60 + 30; // 09:30
const MORNING_END_MIN = 11 * 60 + 30; // 11:30 (inclusive boundary)
const AFTERNOON_START_MIN = 13 * 60; // 13:00
const AFTERNOON_END_MIN = 15 * 60; // 15:00 (inclusive boundary)
// A-share close delay: the last 15:00 bucket stays open until 15:02 to absorb
// closing-auction snapshots (design line 271).
const CLOSE_DELAY_MIN = 2;

/**
 * @param eventTimeIso - RFC3339 eventTime from the canonical snapshot.
 * @returns bucket info, or `null` if the eventTime is outside any session.
 */
export function resolveCandleBucket(eventTimeIso: string): CandleBucket | null {
  const epochMs = Date.parse(eventTimeIso);
  if (Number.isNaN(epochMs)) {
    return null;
  }

  const zoned = toZonedTime(new Date(epochMs), TIME_ZONE);

  const tradingDay = formatTradingDay(zoned);
  const session = resolveSession(zoned);
  if (session === null) {
    return null;
  }

  // Bucket start = the wall-clock minute truncated (seconds/ms zeroed),
  // expressed back as epoch ms. A 1-minute candle [bucketStart, bucketEnd).
  const bucketStartMs = truncateToMinuteMs(zoned);
  const bucketEndMs = bucketStartMs + 60_000;

  return { tradingDay, session, bucketStartMs, bucketEndMs };
}

function resolveSession(zoned: Date): CandleSession | null {
  const minutesOfDay = zoned.getHours() * 60 + zoned.getMinutes();

  // Morning 09:30–11:30 inclusive.
  if (minutesOfDay >= MORNING_START_MIN && minutesOfDay <= MORNING_END_MIN) {
    return 'morning';
  }

  // Afternoon 13:00–15:00 inclusive, plus close-delay to 15:02.
  if (
    minutesOfDay >= AFTERNOON_START_MIN &&
    minutesOfDay <= AFTERNOON_END_MIN + CLOSE_DELAY_MIN
  ) {
    return 'afternoon';
  }

  return null;
}

/**
 * Truncate the epoch ms to the wall-clock minute in Asia/Shanghai.
 *
 * We rebuild the minute from zoned wall-clock parts so that DST (not relevant
 * for Asia/Shanghai but defensive) and exact second/ms truncation are correct.
 */
function truncateToMinuteMs(zoned: Date): number {
  const wallMinute = [
    zoned.getFullYear().toString().padStart(4, '0'),
    '-',
    (zoned.getMonth() + 1).toString().padStart(2, '0'),
    '-',
    zoned.getDate().toString().padStart(2, '0'),
    'T',
    zoned.getHours().toString().padStart(2, '0'),
    ':',
    zoned.getMinutes().toString().padStart(2, '0'),
    ':00.000',
  ].join('');
  return fromZonedTime(wallMinute, TIME_ZONE).getTime();
}

function formatTradingDay(zoned: Date): string {
  return [
    zoned.getFullYear().toString().padStart(4, '0'),
    (zoned.getMonth() + 1).toString().padStart(2, '0'),
    zoned.getDate().toString().padStart(2, '0'),
  ].join('');
}
