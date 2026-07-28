import { Clock } from './clock';

describe('Clock', () => {
  it('returns a positive epoch millisecond value close to Date.now()', () => {
    const clock = new Clock();
    const before = Date.now();
    const value = clock.now();
    const after = Date.now();

    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(after);
  });

  it('produces a Date instance consistent with now()', () => {
    const clock = new Clock();
    const ms = clock.now();
    const date = clock.nowDate();

    expect(date.getTime()).toBeGreaterThanOrEqual(ms);
    expect(date.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('can be substituted with a fake for deterministic tests', () => {
    const fixed = 1_750_000_000_000;
    const fake: Clock = {
      now: () => fixed,
      nowDate: () => new Date(fixed),
    };

    expect(fake.now()).toBe(fixed);
    expect(fake.nowDate().getTime()).toBe(fixed);
  });
});
