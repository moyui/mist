import { K } from './k.entity';

describe('K', () => {
  it('initializes required OHLC prices to a non-finite sentinel', () => {
    const k = new K();

    expect(Number.isNaN(k.open)).toBe(true);
    expect(Number.isNaN(k.high)).toBe(true);
    expect(Number.isNaN(k.low)).toBe(true);
    expect(Number.isNaN(k.close)).toBe(true);
  });
});
