import { BarPeriod } from './bar-period.enum';

describe('BarPeriod', () => {
  it('should have correct values', () => {
    expect(BarPeriod.ONE_MIN).toBe('1min');
    expect(BarPeriod.FIVE_MIN).toBe('5min');
    expect(BarPeriod.FIFTEEN_MIN).toBe('15min');
    expect(BarPeriod.THIRTY_MIN).toBe('30min');
    expect(BarPeriod.SIXTY_MIN).toBe('60min');
    expect(BarPeriod.DAILY).toBe('daily');
  });

  it('should have six periods', () => {
    const values = Object.values(BarPeriod);
    expect(values).toHaveLength(6);
  });
});
