import { DataSource } from './data-source.enum';

describe('DataSource', () => {
  it('should have correct values', () => {
    expect(DataSource.EAST_MONEY).toBe('ef');
    expect(DataSource.TDX).toBe('tdx');
    expect(DataSource.MINI_QMT).toBe('mqmt');
  });

  it('should have three sources', () => {
    const values = Object.values(DataSource);
    expect(values).toHaveLength(3);
  });
});
