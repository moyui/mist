import { StockStatus } from './stock-status.enum';

describe('StockStatus', () => {
  it('should have correct values', () => {
    expect(StockStatus.NORMAL).toBe(1);
    expect(StockStatus.SUSPENDED).toBe(0);
    expect(StockStatus.DELISTED).toBe(-1);
  });

  it('should have three statuses', () => {
    const values = Object.values(StockStatus).filter(
      (value) => typeof value === 'number',
    );
    expect(values).toHaveLength(3);
  });
});
