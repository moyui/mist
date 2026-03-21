import { KPeriod } from './k-period.enum';

describe('KPeriod', () => {
  it('should have correct values', () => {
    expect(KPeriod.MIN_1).toBe('1min');
    expect(KPeriod.MIN_5).toBe('5min');
    expect(KPeriod.MIN_15).toBe('15min');
    expect(KPeriod.MIN_30).toBe('30min');
    expect(KPeriod.MIN_60).toBe('60min');
    expect(KPeriod.DAILY).toBe('daily');
  });

  it('should have six periods', () => {
    const values = Object.values(KPeriod);
    expect(values).toHaveLength(6);
  });
});
