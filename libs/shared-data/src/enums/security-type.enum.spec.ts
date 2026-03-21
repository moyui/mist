import { SecurityType } from './security-type.enum';

describe('SecurityType', () => {
  it('should have correct values', () => {
    expect(SecurityType.STOCK).toBe('STOCK');
    expect(SecurityType.INDEX).toBe('INDEX');
  });

  it('should have two types', () => {
    const values = Object.values(SecurityType);
    expect(values).toHaveLength(2);
  });
});
