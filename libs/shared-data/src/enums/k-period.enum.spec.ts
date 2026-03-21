import { KPeriod } from './k-period.enum';

describe('KPeriod', () => {
  it('should have correct values', () => {
    expect(KPeriod.ONE_MIN).toBe('1min');
    expect(KPeriod.FIVE_MIN).toBe('5min');
    expect(KPeriod.FIFTEEN_MIN).toBe('15min');
    expect(KPeriod.THIRTY_MIN).toBe('30min');
    expect(KPeriod.SIXTY_MIN).toBe('60min');
    expect(KPeriod.DAILY).toBe('daily');
  });

  it('should have six periods', () => {
    const values = Object.values(KPeriod);
    expect(values).toHaveLength(6);
  });
});
