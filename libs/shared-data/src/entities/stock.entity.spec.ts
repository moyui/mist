import { Stock } from './stock.entity';
import { StockStatus } from '../enums/stock-status.enum';

describe('Stock', () => {
  it('should create stock entity with required properties', () => {
    const stock = new Stock();
    stock.code = '000001';
    stock.name = '测试股票';
    stock.status = StockStatus.NORMAL;

    expect(stock.code).toBe('000001');
    expect(stock.name).toBe('测试股票');
    expect(stock.status).toBe(StockStatus.NORMAL);
    expect(stock.id).toBeUndefined();
    expect(stock.createTime).toBeUndefined();
    expect(stock.updateTime).toBeUndefined();
  });

  it('should have timestamp fields', () => {
    const stock = new Stock();
    const now = new Date();
    stock.createTime = now;
    stock.updateTime = now;

    expect(stock.createTime).toBe(now);
    expect(stock.updateTime).toBe(now);
  });
});
