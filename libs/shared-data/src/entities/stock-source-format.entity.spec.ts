import { StockSourceFormat } from './stock-source-format.entity';
import { DataSource } from '../enums/data-source.enum';

describe('StockSourceFormat', () => {
  it('should create format with required properties', () => {
    const format = new StockSourceFormat();
    format.source = DataSource.EAST_MONEY;
    format.formattedCode = 'sz000001';

    expect(format.source).toBe(DataSource.EAST_MONEY);
    expect(format.formattedCode).toBe('sz000001');
  });
});
