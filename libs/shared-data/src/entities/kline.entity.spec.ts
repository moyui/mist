import { KLine } from './kline.entity';
import { Stock } from './stock.entity';
import { DataSource } from '../enums/data-source.enum';
import { KLinePeriod } from '../enums/kline-period.enum';

describe('KLine', () => {
  it('should create kline entity with required properties', () => {
    const stock = new Stock();
    stock.id = 1;
    stock.code = '000001';
    stock.name = '测试股票';

    const kLine = new KLine();
    kLine.stock = stock;
    kLine.source = DataSource.EAST_MONEY;
    kLine.period = KLinePeriod.ONE_MIN;
    kLine.timestamp = new Date('2024-01-01T10:00:00.000Z');
    kLine.open = 10.5;
    kLine.high = 11.0;
    kLine.low = 10.4;
    kLine.close = 10.8;
    kLine.volume = BigInt(1000000);
    kLine.amount = 10800000.0;

    expect(kLine.stock).toBe(stock);
    expect(kLine.source).toBe(DataSource.EAST_MONEY);
    expect(kLine.period).toBe(KLinePeriod.ONE_MIN);
    expect(kLine.timestamp).toEqual(new Date('2024-01-01T10:00:00.000Z'));
    expect(kLine.open).toBe(10.5);
    expect(kLine.high).toBe(11.0);
    expect(kLine.low).toBe(10.4);
    expect(kLine.close).toBe(10.8);
    expect(kLine.volume).toEqual(BigInt(1000000));
    expect(kLine.amount).toBe(10800000.0);
    expect(kLine.id).toBeUndefined();
    expect(kLine.createTime).toBeUndefined();
  });

  it('should have stock relationship', () => {
    const stock = new Stock();
    stock.id = 1;
    stock.code = '000001';
    stock.name = '测试股票';

    const kLine = new KLine();
    kLine.stock = stock;

    expect(kLine.stock).toBe(stock);
    expect(stock.klines).toBeUndefined(); // Not loaded until query
  });

  it('should validate data types', () => {
    const kLine = new KLine();
    kLine.open = 12.3456789;
    kLine.high = 12.3456789;
    kLine.low = 12.3456789;
    kLine.close = 12.3456789;
    kLine.volume = BigInt('123456789012345');
    kLine.amount = 123456789.123456;

    expect(typeof kLine.open).toBe('number');
    expect(typeof kLine.high).toBe('number');
    expect(typeof kLine.low).toBe('number');
    expect(typeof kLine.close).toBe('number');
    expect(typeof kLine.volume).toBe('bigint');
    expect(typeof kLine.amount).toBe('number');
  });
});
