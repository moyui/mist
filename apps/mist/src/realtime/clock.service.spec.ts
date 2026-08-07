import { Clock } from './clock.service';

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

  it('derives nowDate from an overridden now for deterministic tests', () => {
    const fixed = 1_750_000_000_000;
    const fake = new (class extends Clock {
      override now(): number {
        return fixed;
      }
    })();

    expect(fake.now()).toBe(fixed);
    expect(fake.nowDate().getTime()).toBe(fixed);
  });

  it('applies MIST_MOCK_CLOCK_OFFSET_MS in mock mode', () => {
    process.env.MIST_MOCK_MODE = 'true';
    process.env.MIST_MOCK_CLOCK_OFFSET_MS = '3600000';
    try {
      const clock = new Clock();
      const before = Date.now();
      const value = clock.now();
      const after = Date.now();

      expect(value).toBeGreaterThanOrEqual(before + 3_600_000);
      expect(value).toBeLessThanOrEqual(after + 3_600_000);
    } finally {
      delete process.env.MIST_MOCK_MODE;
      delete process.env.MIST_MOCK_CLOCK_OFFSET_MS;
    }
  });

  it('keeps real wall-clock time when the offset is unset or zero', () => {
    process.env.MIST_MOCK_MODE = 'true';
    process.env.MIST_MOCK_CLOCK_OFFSET_MS = '0';
    try {
      const clock = new Clock();
      expect(clock.now()).toBeLessThanOrEqual(Date.now());
    } finally {
      delete process.env.MIST_MOCK_MODE;
      delete process.env.MIST_MOCK_CLOCK_OFFSET_MS;
    }
  });

  it('ignores the offset outside mock mode', () => {
    process.env.MIST_MOCK_CLOCK_OFFSET_MS = '3600000';
    try {
      const clock = new Clock();
      expect(clock.now()).toBeLessThanOrEqual(Date.now());
    } finally {
      delete process.env.MIST_MOCK_CLOCK_OFFSET_MS;
    }
  });
});
