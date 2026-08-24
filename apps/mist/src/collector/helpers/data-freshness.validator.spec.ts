import { Period } from '@app/shared-data';
import { DataFreshnessValidator } from './data-freshness.validator';
import { DataFreshnessStatus } from '../types/post-close-sync.types';

describe('DataFreshnessValidator', () => {
  const validator = new DataFreshnessValidator();

  it('validates daily bar successfully when target date bar is present', () => {
    const bars = [{ date: '2026-08-21' }, { date: '2026-08-24' }];

    const result = validator.validateFreshness(bars, '2026-08-24', Period.DAY);
    expect(result.status).toBe(DataFreshnessStatus.READY);
    expect(result.barCount).toBe(2);
    expect(result.expectedBarCount).toBe(1);
  });

  it('flags daily bar as NOT_LATEST when target date bar is missing', () => {
    const bars = [{ date: '2026-08-21' }];

    const result = validator.validateFreshness(bars, '2026-08-24', Period.DAY);
    expect(result.status).toBe(DataFreshnessStatus.NOT_LATEST);
    expect(result.latestBarTime).toBe('2026-08-21');
    expect(result.reason).toContain('has not reached target date 2026-08-24');
  });

  it('validates 1m minute bars successfully when count satisfies 240', () => {
    const bars = Array.from({ length: 240 }, (_, idx) => ({
      date: '2026-08-24',
      time: `09:${String(idx).padStart(2, '0')}:00`,
    }));

    const result = validator.validateFreshness(
      bars,
      '2026-08-24',
      Period.ONE_MIN,
    );
    expect(result.status).toBe(DataFreshnessStatus.READY);
    expect(result.barCount).toBe(240);
    expect(result.expectedBarCount).toBe(240);
  });

  it('flags minute bars as INCOMPLETE_BARS when count is insufficient', () => {
    const bars = Array.from({ length: 120 }, (_, idx) => ({
      date: '2026-08-24',
      time: `09:${String(idx).padStart(2, '0')}:00`,
    }));

    const result = validator.validateFreshness(
      bars,
      '2026-08-24',
      Period.ONE_MIN,
    );
    expect(result.status).toBe(DataFreshnessStatus.INCOMPLETE_BARS);
    expect(result.barCount).toBe(120);
    expect(result.reason).toContain(
      'Incomplete minute bars on 2026-08-24: received 120 / expected 240',
    );
  });

  it('flags minute bars as NOT_LATEST when empty', () => {
    const result = validator.validateFreshness(
      [],
      '2026-08-24',
      Period.ONE_MIN,
    );
    expect(result.status).toBe(DataFreshnessStatus.NOT_LATEST);
    expect(result.barCount).toBe(0);
    expect(result.reason).toContain(
      'No bars returned for target date 2026-08-24',
    );
  });
});
