import { KLinePeriod } from './kline-period.enum';

describe('KLinePeriod', () => {
  it('should have correct values', () => {
    expect(KLinePeriod.ONE_MIN).toBe('1min');
    expect(KLinePeriod.FIVE_MIN).toBe('5min');
    expect(KLinePeriod.FIFTEEN_MIN).toBe('15min');
    expect(KLinePeriod.THIRTY_MIN).toBe('30min');
    expect(KLinePeriod.SIXTY_MIN).toBe('60min');
    expect(KLinePeriod.DAILY).toBe('daily');
    expect(KLinePeriod.WEEKLY).toBe('weekly');
    expect(KLinePeriod.MONTHLY).toBe('monthly');
    expect(KLinePeriod.QUARTERLY).toBe('quarterly');
    expect(KLinePeriod.YEARLY).toBe('yearly');
  });

  it('should have ten periods', () => {
    const values = Object.values(KLinePeriod);
    expect(values).toHaveLength(10);
  });
});
