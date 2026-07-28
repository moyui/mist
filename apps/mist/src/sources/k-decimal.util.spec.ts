import { kDecimalFromNumber, normalizeKDecimal } from './k-decimal.util';

describe('K decimal normalization', () => {
  it.each([
    ['0', '0'],
    ['0.00000000', '0'],
    ['5086297.00', '5086297'],
    ['1234.56789012', '1234.56789012'],
    ['-0.10', '-0.1'],
  ])('normalizes %s without losing numeric precision', (input, expected) => {
    expect(normalizeKDecimal(input, 'volume')).toBe(expected);
  });

  it('preserves null and converts finite EastMoney numbers explicitly', () => {
    expect(normalizeKDecimal(null, 'amount')).toBeNull();
    expect(kDecimalFromNumber(0, 'amount')).toBe('0');
    expect(kDecimalFromNumber(123.45, 'amount')).toBe('123.45');
    expect(kDecimalFromNumber(Number.NaN, 'amount')).toBeNull();
  });

  it.each([
    'NaN',
    'Infinity',
    '1e3',
    '12345678901234567890123456789',
    '0.123456789',
  ])('rejects invalid or out-of-range decimal %s', (input) => {
    expect(() => normalizeKDecimal(input, 'amount')).toThrow();
  });
});
