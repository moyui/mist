import { canonicalDecimalTransformer } from './canonical-decimal.transformer';

describe('canonicalDecimalTransformer', () => {
  it.each([
    ['0.00000000', '0'],
    ['00100.00000000', '100'],
    ['9007199254740992.00000001', '9007199254740992.00000001'],
  ])('normalizes MySQL fixed-scale text %s to %s', (stored, canonical) => {
    expect(canonicalDecimalTransformer.from(stored)).toBe(canonical);
  });

  it('preserves null in both directions', () => {
    expect(canonicalDecimalTransformer.from(null)).toBeNull();
    expect(canonicalDecimalTransformer.to(null)).toBeNull();
  });

  it('accepts canonical text for persistence without numeric coercion', () => {
    expect(canonicalDecimalTransformer.to('100.25')).toBe('100.25');
    expect(() => canonicalDecimalTransformer.to('100.25000000')).toThrow(
      TypeError,
    );
    expect(() => canonicalDecimalTransformer.from(100.25)).toThrow(TypeError);
  });
});
