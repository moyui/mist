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
  });
});
