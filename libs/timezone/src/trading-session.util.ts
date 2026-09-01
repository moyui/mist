import { toZonedTime } from 'date-fns-tz';
import { ASIA_SHANGHAI_TIMEZONE } from './date-format.constants';

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

/**
 * Weekday Intraday Subscription Add Window boundaries (09:15 to 15:00).
 */
export const INTRADAY_ADD_WINDOW_START_MIN = 9 * 60 + 15; // 09:15
export const INTRADAY_ADD_WINDOW_END_MIN = 15 * 60; // 15:00

/** True when `date`'s wall-clock time (Asia/Shanghai) is within a session. */
export function isInTradingHours(date: Date): boolean {
  const zoned = toZonedTime(date, TIME_ZONE);
  const minutesOfDay = zoned.getHours() * 60 + zoned.getMinutes();
  return (
    (minutesOfDay >= MORNING_START_MIN && minutesOfDay < MORNING_END_MIN) ||
    (minutesOfDay >= AFTERNOON_START_MIN && minutesOfDay < AFTERNOON_END_MIN)
  );
}

/**
 * True when `date`'s wall-clock time (Asia/Shanghai) is on a weekday within 09:15-15:00
 * (the intraday subscription activation window).
 */
export function isIntradayAddWindow(now: Date): boolean {
  const shanghai = toZonedTime(now, TIME_ZONE);
  const day = shanghai.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = shanghai.getHours() * 60 + shanghai.getMinutes();
  return (
    minutes >= INTRADAY_ADD_WINDOW_START_MIN &&
    minutes < INTRADAY_ADD_WINDOW_END_MIN
  );
}

/**
 * Format a Date or timestamp into Beijing trading day string (YYYYMMDD).
 */
export function formatTradingDayString(dateOrTimestamp: Date | number): string {
  const date =
    typeof dateOrTimestamp === 'number'
      ? new Date(dateOrTimestamp)
      : dateOrTimestamp;
  const zoned = toZonedTime(date, TIME_ZONE);
  return [
    zoned.getFullYear().toString().padStart(4, '0'),
    (zoned.getMonth() + 1).toString().padStart(2, '0'),
    zoned.getDate().toString().padStart(2, '0'),
  ].join('');
}
