import { toZonedTime } from 'date-fns-tz';
import { ASIA_SHANGHAI_TIMEZONE } from './date-format.const';

/**
 * A-share trading-session boundaries (Asia/Shanghai), half-open with a 1-minute
 * close extension — shared by the candle pipeline (`candle-bucket.util`) and
 * the realtime health alert receiver so session membership is defined once.
 *
 *   morning   [09:30, 11:31)  → 11:30 is the last bucket
 *   afternoon [13:00, 15:01)  → 15:00 is the last bucket
 */
const TIME_ZONE = ASIA_SHANGHAI_TIMEZONE;

export const MORNING_START_MIN = 9 * 60 + 30; // 09:30
export const MORNING_END_MIN = 11 * 60 + 31; // 11:31 (half-open)
export const AFTERNOON_START_MIN = 13 * 60; // 13:00
export const AFTERNOON_END_MIN = 15 * 60 + 1; // 15:01 (half-open)

/** True when `date`'s wall-clock time (Asia/Shanghai) is within a session. */
export function isInTradingHours(date: Date): boolean {
  const zoned = toZonedTime(date, TIME_ZONE);
  const minutesOfDay = zoned.getHours() * 60 + zoned.getMinutes();
  return (
    (minutesOfDay >= MORNING_START_MIN && minutesOfDay < MORNING_END_MIN) ||
    (minutesOfDay >= AFTERNOON_START_MIN && minutesOfDay < AFTERNOON_END_MIN)
  );
}
