import { KPriceProjector } from './k-price-projector';

describe('KPriceProjector', () => {
  it.each([
    ['0.00', 0],
    ['1.20', 1.2],
    ['123456.78', 123456.78],
  ] as const)('projects MySQL fixed-scale price %s', (input, expected) => {
    expect(KPriceProjector(input)).toBe(expected);
  });

  it.each([0, 1.2, Number.MAX_VALUE])(
    'retains a finite Redis number without rewriting it',
    (input) => {
      expect(KPriceProjector(input)).toBe(input);
    },
  );

  it.each([
    '',
    '1',
    '1.2',
    '1.200',
    '01.20',
    '-1.00',
    '+1.00',
    ' 1.00',
    '1.00 ',
    '1e2',
    'NaN',
    'Infinity',
  ])('rejects a non-mysql2 fixed-scale string %p', (input) => {
    expect(() => KPriceProjector(input)).toThrow(TypeError);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1])(
    'rejects an invalid realtime number %p',
    (input) => {
      expect(() => KPriceProjector(input)).toThrow(TypeError);
    },
  );

  it('rejects a valid DECIMAL(20,2) value that loses cent precision as a number', () => {
    expect(() => KPriceProjector('999999999999999999.99')).toThrow(RangeError);
  });

  it('rejects runtime values outside the declared price representations', () => {
    expect(() => KPriceProjector(null as never)).toThrow(TypeError);
    expect(() => KPriceProjector(undefined as never)).toThrow(TypeError);
  });
});
