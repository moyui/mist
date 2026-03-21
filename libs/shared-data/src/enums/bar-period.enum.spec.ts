import { BarPeriod } from './bar-period.enum';

describe('BarPeriod', () => {
  it('should have correct values', () => {
    expect(BarPeriod.MIN_1).toBe('1min');
    expect(BarPeriod.MIN_5).toBe('5min');
    expect(BarPeriod.MIN_15).toBe('15min');
    expect(BarPeriod.MIN_30).toBe('30min');
    expect(BarPeriod.MIN_60).toBe('60min');
    expect(BarPeriod.DAILY).toBe('daily');
  });

  it('should have six periods', () => {
    const values = Object.values(BarPeriod);
    expect(values).toHaveLength(6);
  });
});
