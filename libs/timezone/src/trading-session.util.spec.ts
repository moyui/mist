import {
  isInTradingHours,
  isIntradayAddWindow,
  INTRADAY_ADD_WINDOW_START_MIN,
  INTRADAY_ADD_WINDOW_END_MIN,
} from './trading-session.util';
import {
  CRON_PRE_MARKET_INSPECTION_0905,
  CRON_SUBSCRIPTION_RESET_0915,
  CRON_POST_CLOSE_SYNC_NIGHTLY_2230,
  CRON_POST_CLOSE_SYNC_MORNING_0630,
} from './cron-schedules.constants';

/** Build a Date for a specific Asia/Shanghai wall-clock time (no DST, fixed +8). */
function shanghai(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute));
}

describe('trading-session.util isInTradingHours', () => {
  it.each([
    ['09:30 open', 2026, 8, 13, 9, 30, true],
    ['09:29 before open', 2026, 8, 13, 9, 29, false],
    ['11:30 last morning bucket', 2026, 8, 13, 11, 30, true],
    ['11:31 morning closed', 2026, 8, 13, 11, 31, false],
    ['12:00 lunch break', 2026, 8, 13, 12, 0, false],
    ['13:00 afternoon open', 2026, 8, 13, 13, 0, true],
    ['15:00 last afternoon bucket', 2026, 8, 13, 15, 0, true],
    ['15:01 afternoon closed', 2026, 8, 13, 15, 1, false],
    ['16:00 after close', 2026, 8, 13, 16, 0, false],
  ] as const)('%s', (_label, y, mo, d, h, mi, expected) => {
    expect(isInTradingHours(shanghai(y, mo, d, h, mi))).toBe(expected);
  });
});

describe('trading-session.util isIntradayAddWindow', () => {
  it('correctly flags intraday window boundaries', () => {
    expect(INTRADAY_ADD_WINDOW_START_MIN).toBe(555); // 09:15
    expect(INTRADAY_ADD_WINDOW_END_MIN).toBe(900); // 15:00
  });

  it.each([
    // 2026-08-13 is a Thursday (weekday)
    ['09:14 before window', 2026, 8, 13, 9, 14, false],
    ['09:15 window open', 2026, 8, 13, 9, 15, true],
    ['12:00 during lunch', 2026, 8, 13, 12, 0, true],
    ['14:59 before close', 2026, 8, 13, 14, 59, true],
    ['15:00 window closed', 2026, 8, 13, 15, 0, false],
    ['15:01 after close', 2026, 8, 13, 15, 1, false],
    // 2026-08-16 is a Sunday (weekend)
    ['09:30 on weekend', 2026, 8, 16, 9, 30, false],
    // 2026-08-15 is a Saturday (weekend)
    ['10:00 on saturday', 2026, 8, 15, 10, 0, false],
  ] as const)('%s', (_label, y, mo, d, h, mi, expected) => {
    expect(isIntradayAddWindow(shanghai(y, mo, d, h, mi))).toBe(expected);
  });
});

describe('cron-schedules.const', () => {
  it('exports valid 5 or 6-part cron expressions', () => {
    const cronRegex = /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+(\S+))?$/;
    expect(CRON_PRE_MARKET_INSPECTION_0905).toMatch(cronRegex);
    expect(CRON_SUBSCRIPTION_RESET_0915).toMatch(cronRegex);
    expect(CRON_POST_CLOSE_SYNC_NIGHTLY_2230).toMatch(cronRegex);
    expect(CRON_POST_CLOSE_SYNC_MORNING_0630).toMatch(cronRegex);

    expect(CRON_PRE_MARKET_INSPECTION_0905).toBe('0 5 9 * * 1-5');
    expect(CRON_SUBSCRIPTION_RESET_0915).toBe('0 15 9 * * 1-5');
    expect(CRON_POST_CLOSE_SYNC_NIGHTLY_2230).toBe('30 22 * * 1-5');
    expect(CRON_POST_CLOSE_SYNC_MORNING_0630).toBe('30 6 * * 2-6');
  });
});
