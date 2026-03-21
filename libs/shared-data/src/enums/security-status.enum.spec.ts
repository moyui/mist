import { SecurityStatus } from './security-status.enum';

describe('SecurityStatus', () => {
  it('should have correct values', () => {
    expect(SecurityStatus.DELISTED).toBe(-1);
    expect(SecurityStatus.SUSPENDED).toBe(0);
    expect(SecurityStatus.ACTIVE).toBe(1);
  });

  it('should have three statuses', () => {
    const values = Object.values(SecurityStatus);
    expect(values).toHaveLength(3);
  });
});
