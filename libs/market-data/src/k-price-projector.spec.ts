import { KPriceProjector } from './k-price-projector';

// 阈值冻结：以下用例为精度口径的不变量，DO NOT CHANGE 随意放宽/收紧
// - 多零不算脏：1.2 / 1.200 / 01.20 需归一到 1.20 -> 1.2
// - 超最大整数 clamp：DECIMAL(20,2) 上限 999999999999999999.99
// - 0 可锚：0 是有可能的，null/NaN 才进 Imputer
describe('KPriceProjector — 阈值冻结', () => {
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

  // 多零不算脏 — DO NOT CHANGE：1.2 / 1.200 / 01.20 必须归一
  it.each([
    ['1.2', 1.2],
    ['1.200', 1.2],
    ['01.20', 1.2],
  ] as const)(
    'normalizes lenient decimal %s to %p (多零不算脏)',
    (input, expected) => {
      expect(KPriceProjector(input)).toBe(expected);
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1])(
    'rejects an invalid realtime number %p',
    (input) => {
      expect(() => KPriceProjector(input)).toThrow(TypeError);
    },
  );

  // 超最大整数 clamp — DO NOT CHANGE
  it('clamps a valid DECIMAL(20,2) value that exceeds safe integer to max', () => {
    expect(KPriceProjector('999999999999999999.99')).toBe(
      999999999999999999.99,
    );
    expect(KPriceProjector('9999999999999999999.99')).toBe(
      999999999999999999.99,
    );
  });

  it('rejects runtime values outside the declared price representations', () => {
    expect(() => KPriceProjector(null as never)).toThrow(TypeError);
    expect(() => KPriceProjector(undefined as never)).toThrow(TypeError);
  });

  it('treats 0 as valid anchor candidate (0是有可能的)', () => {
    expect(KPriceProjector('0.00')).toBe(0);
    expect(KPriceProjector(0)).toBe(0);
  });
});
