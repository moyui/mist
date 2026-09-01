import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import {
  AFTERNOON_END_MIN,
  AFTERNOON_START_MIN,
  MORNING_END_MIN,
  MORNING_START_MIN,
  ASIA_SHANGHAI_TIMEZONE,
  formatTradingDayString,
} from '@app/timezone';
import type { CandleBucket, CandleSession } from './candle.types';

/**
 * Convert a realtime snapshot's eventTime to its trading-day / session / bucket.
 *
 * Pure function — no I/O, no clock, deterministic from the eventTime string.
 * The aggregator and finalizer both rely on this to decide bucket membership
 * and partition keys.
 *
 * A-share sessions (Asia/Shanghai), half-open with a 1-minute close extension:
 *   morning   [09:30, 11:31)  → 11:30 is the last bucket (absorbs post-close
 *                                tail frames)
 *   afternoon [13:00, 15:01)  → 15:00 is the last bucket (absorbs the
 *                                closing-auction print, whose provider
 *                                eventTime lands at 15:00:xx)
 * This yields 242 buckets per trading day (121 morning + 121 afternoon).
 * Frames at or after 11:31 / 15:01 are out-of-session — they may still
 * refresh the memory latest but must not be aggregated into a candle.
 *
 * HK sessions are not handled here yet; they require HIL-confirmed close-auction
 * timing (design mentions 16:10) and will be added in a follow-up.
 */
const TIME_ZONE = ASIA_SHANGHAI_TIMEZONE;

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

  const tradingDay = formatTradingDayString(zoned);
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

  // Morning 09:30–11:30, half-open at 11:31 (11:30 is the last bucket and
  // absorbs post-close tail frames).
  if (minutesOfDay >= MORNING_START_MIN && minutesOfDay < MORNING_END_MIN) {
    return 'morning';
  }

  // Afternoon 13:00–15:00, half-open at 15:01 (15:00 is the last bucket and
  // absorbs the closing-auction print).
  if (minutesOfDay >= AFTERNOON_START_MIN && minutesOfDay < AFTERNOON_END_MIN) {
    return 'afternoon';
  }

  return null;
}

/**
 * True when the bucket is a session-terminal bucket (11:30 or 15:00).
 *
 * Terminal buckets absorb post-close tail frames / the closing-auction print,
 * whose provider eventTime lands inside the terminal minute but may arrive
 * late. The product layer gives them an extended finalization grace
 * (`REALTIME_CANDLE_TERMINAL_GRACE_MS`); see
 * openspec/changes/fix-close-auction-bucket-semantic.
 */
export function isSessionTerminalBucket(bucketStartMs: number): boolean {
  const zoned = toZonedTime(new Date(bucketStartMs), TIME_ZONE);
  const minutesOfDay = zoned.getHours() * 60 + zoned.getMinutes();
  return (
    minutesOfDay === MORNING_END_MIN - 1 || // 11:30
    minutesOfDay === AFTERNOON_END_MIN - 1 // 15:00
  );
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
