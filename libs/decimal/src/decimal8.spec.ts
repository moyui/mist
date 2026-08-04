import { Decimal8, normalizeExternalDecimalText } from './decimal8';

describe('normalizeExternalDecimalText', () => {
  it.each([
    ['0', '0'],
    ['0.00000000', '0'],
    ['001.2300', '1.23'],
    ['0001', '1'],
    ['1.00000001', '1.00000001'],
    [
      '9999999999999999999999999999.99999999',
      '9999999999999999999999999999.99999999',
    ],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeExternalDecimalText(input)).toBe(expected);
  });

  it.each([
    '',
    ' 1',
    '1 ',
    '+1',
    '-0',
    '-1',
    '.5',
    '1.',
    '1e2',
    '1,000',
    '１２',
  ])('rejects unsupported lexical form %p', (input) => {
    expect(() => normalizeExternalDecimalText(input)).toThrow(TypeError);
  });

  it('rejects raw scale before trimming insignificant fractional zeros', () => {
    expect(() => normalizeExternalDecimalText('1.230000000')).toThrow(
      TypeError,
    );
  });

  it('rejects text longer than 37 characters before leading-zero normalization', () => {
    expect(() => normalizeExternalDecimalText('0'.repeat(38))).toThrow(
      RangeError,
    );
  });

  it('rejects more than 28 normalized integer digits', () => {
    expect(() =>
      normalizeExternalDecimalText('10000000000000000000000000000'),
    ).toThrow(RangeError);
  });

  it('rejects non-string runtime input instead of coercing it', () => {
    expect(() => normalizeExternalDecimalText(1 as never)).toThrow(TypeError);
  });
});

describe('Decimal8', () => {
  const max = '9999999999999999999999999999.99999999';

  it.each(['0', '1', '1.23', '0.00000001', max])(
    'parses and formats canonical value %s exactly',
    (value) => {
      expect(Decimal8.parseCanonical(value).formatCanonical()).toBe(value);
    },
  );

  it.each([
    '00',
    '01',
    '0.0',
    '1.0',
    '1.2300',
    '1.230000000',
    '-1',
    '+1',
    '1e2',
    '10000000000000000000000000000',
  ])('rejects non-canonical value %p', (value) => {
    expect(() => Decimal8.parseCanonical(value)).toThrow(TypeError);
  });

  it('rejects numeric runtime input instead of compatibility coercion', () => {
    expect(() => Decimal8.parseCanonical(1 as never)).toThrow(TypeError);
  });

  it('compares exact values without JavaScript number conversion', () => {
    const left = Decimal8.parseCanonical('9007199254740992.00000001');
    const same = Decimal8.parseCanonical('9007199254740992.00000001');
    const right = Decimal8.parseCanonical('9007199254740992.00000002');

    expect(left.compare(same)).toBe(0);
    expect(left.compare(right)).toBe(-1);
    expect(right.compare(left)).toBe(1);
  });

  it('adds and subtracts exact scale-eight values', () => {
    const left = Decimal8.parseCanonical('9007199254740992.00000001');
    const right = Decimal8.parseCanonical('0.00000002');

    expect(left.add(right).formatCanonical()).toBe('9007199254740992.00000003');
    expect(left.add(right).subtract(right).compare(left)).toBe(0);
  });

  it.each([
    [100, '123.45', '12345'],
    [10_000, '123.45', '1234500'],
  ] as const)(
    'scales %s exactly by approved factor %s',
    (factor, input, expected) => {
      expect(
        Decimal8.parseCanonical(input).scaleByUnit(factor).formatCanonical(),
      ).toBe(expected);
    },
  );

  it('rejects an unapproved unit factor at runtime', () => {
    expect(() => Decimal8.parseCanonical('1').scaleByUnit(10 as never)).toThrow(
      RangeError,
    );
  });

  it('range-checks addition and unit scaling', () => {
    const maximum = Decimal8.parseCanonical(max);
    const smallest = Decimal8.parseCanonical('0.00000001');

    expect(() => maximum.add(smallest)).toThrow(RangeError);
    expect(() => maximum.scaleByUnit(100)).toThrow(RangeError);
  });

  it('allows signed intermediate subtraction but rejects negative quantity output', () => {
    const negative = Decimal8.ZERO.subtract(Decimal8.parseCanonical('1'));

    expect(negative.compare(Decimal8.ZERO)).toBe(-1);
    expect(() => negative.formatCanonical()).toThrow(RangeError);
    expect(() => negative.scaleByUnit(100)).toThrow(RangeError);
  });

  it('range-checks negative intermediate arithmetic', () => {
    const negativeMaximum = Decimal8.ZERO.subtract(
      Decimal8.parseCanonical(max),
    );

    expect(() =>
      negativeMaximum.subtract(Decimal8.parseCanonical('0.00000001')),
    ).toThrow(RangeError);
  });

  it('rejects raw Decimal8 JSON serialization and implicit coercion', () => {
    const value = Decimal8.parseCanonical('1.23');

    expect(() => JSON.stringify({ value })).toThrow(TypeError);
    expect(() => Number(value)).toThrow(TypeError);
  });

  it('rejects non-Decimal8 operands at runtime', () => {
    const value = Decimal8.parseCanonical('1');

    expect(() => value.compare('1' as never)).toThrow(TypeError);
    expect(() => value.add('1' as never)).toThrow(TypeError);
    expect(() => value.subtract('1' as never)).toThrow(TypeError);
  });
});
