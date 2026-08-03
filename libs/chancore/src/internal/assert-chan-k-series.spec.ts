import type { ChanK } from '../contracts';
import { ChanInputError } from '../errors';
import { assertChanKSeries } from './assert-chan-k-series';

const baseK: ChanK = {
  id: 7,
  symbol: '600519',
  time: new Date('2026-07-01T01:31:00.000Z'),
  open: 1400,
  high: 1410,
  low: 1390,
  close: 1405,
  volume: '100',
  amount: '140500.00000000',
};

describe('assertChanKSeries', () => {
  it('accepts empty input, sparse unordered IDs and MySQL fixed-scale decimals', () => {
    expect(() => assertChanKSeries([])).not.toThrow();

    const orderedK = [
      makeK({ id: 101 }),
      makeK({
        id: 3,
        time: new Date('2026-07-01T01:32:00.000Z'),
        volume: null,
        amount: '0.00000000',
      }),
    ];

    expect(() => assertChanKSeries(orderedK)).not.toThrow();
  });

  it.each([
    ['zero ID', [makeK({ id: 0 })]],
    ['unsafe ID', [makeK({ id: Number.MAX_SAFE_INTEGER + 1 })]],
    [
      'duplicate ID',
      [
        makeK({ id: 7 }),
        makeK({ id: 7, time: new Date('2026-07-01T01:32:00.000Z') }),
      ],
    ],
    ['empty symbol', [makeK({ symbol: '' })]],
    [
      'mixed symbols',
      [
        makeK(),
        makeK({ symbol: '000001', time: new Date('2026-07-01T01:32:00.000Z') }),
      ],
    ],
    ['invalid Date', [makeK({ time: new Date(Number.NaN) })]],
    ['duplicate time', [makeK({ id: 7 }), makeK({ id: 8 })]],
    [
      'decreasing time',
      [
        makeK({ id: 7, time: new Date('2026-07-01T01:32:00.000Z') }),
        makeK({ id: 8, time: new Date('2026-07-01T01:31:00.000Z') }),
      ],
    ],
    ['NaN price', [makeK({ open: Number.NaN })]],
    ['infinite price', [makeK({ close: Number.POSITIVE_INFINITY })]],
    ['inverted range', [makeK({ high: 1389, low: 1390 })]],
  ] satisfies ReadonlyArray<readonly [string, readonly ChanK[]]>)(
    'rejects %s',
    (_label, orderedK) => {
      expect(() => assertChanKSeries(orderedK)).toThrow(ChanInputError);
    },
  );

  it.each([
    1,
    '',
    ' 1',
    '1 ',
    '1e3',
    '.5',
    '1.',
    '12345678901234567890123456789',
    '1.123456789',
  ])('rejects invalid quantity representation %p', (volume) => {
    const orderedK = [makeK({ volume: volume as string })];

    expect(() => assertChanKSeries(orderedK)).toThrow(ChanInputError);
  });

  it('does not sort, coerce, deduplicate or fill invalid input', () => {
    const first = makeK({ id: 2, volume: null });
    const second = makeK({
      id: 1,
      time: new Date('2026-07-01T01:30:00.000Z'),
      volume: '10',
    });
    const orderedK = [first, second];
    const before = orderedK.map((k) => ({ ...k, time: k.time.getTime() }));

    expect(() => assertChanKSeries(orderedK)).toThrow(ChanInputError);
    expect(orderedK.map((k) => ({ ...k, time: k.time.getTime() }))).toEqual(
      before,
    );
    expect(orderedK[0]).toBe(first);
    expect(orderedK[1]).toBe(second);
  });
});

function makeK(overrides: Partial<ChanK> = {}): ChanK {
  return {
    ...baseK,
    time: new Date(baseK.time.getTime()),
    ...overrides,
  };
}
