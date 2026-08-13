import { isInTradingHours } from './trading-session.util';

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
