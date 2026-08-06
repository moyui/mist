import { convertTdxNativeSnapshot } from './native-snapshot.converter';
import { RealtimeQuantityValidationError } from '../../../realtime/realtime-quantity-validation.error';

describe('TDX native snapshot converter', () => {
  it('uses datasource capturedAt and preserves identity/native values', () => {
    const native = {
      Now: '31.25',
      Open: 30,
      Max: 32,
      Min: 29,
      LastClose: 30.5,
      Volume: '10',
      Amount: '100',
      providerOnly: [1, 2, 3],
    };

    const snapshot = convertTdxNativeSnapshot({
      securityId: 600030,
      providerSymbol: '600030.SH',
      capturedAt: '2026-07-22T10:01:03+08:00',
      native,
    });

    expect(snapshot.securityId).toBe(600030);
    expect(snapshot.providerSymbol).toBe('600030.SH');
    expect(snapshot.eventTime).toBe('2026-07-22T02:01:03.000Z');
    expect(snapshot.quality.eventTimeAvailable).toBe(true);
    expect(snapshot.quality.aggregationEligible).toBe(true);
    expect(snapshot.prices.last).toBe(31.25);
    expect(snapshot.prices.lastClose).toBe(30.5);
    expect(snapshot.cumulativeVolume).toBe('1000');
    expect(snapshot.cumulativeAmount).toBe('1000000');
    expect(snapshot.native).toEqual(native);
  });

  it.each(['PreClose', 'lastClose'])(
    'does not treat retired %s as native LastClose',
    (field) => {
      const snapshot = convertTdxNativeSnapshot({
        securityId: 600030,
        providerSymbol: '600030.SH',
        capturedAt: '2026-07-22T10:01:03+08:00',
        native: { Now: 31.25, [field]: 30.5 },
      });

      expect(snapshot.prices.lastClose).toBeNull();
      expect(snapshot.native[field]).toBe(30.5);
    },
  );

  it('does not require a provider-native time field', () => {
    const snapshot = convertTdxNativeSnapshot({
      securityId: 600030,
      providerSymbol: '600030.SH',
      capturedAt: '2026-07-22T10:01:03+08:00',
      native: { Now: 31.25 },
    });

    expect(snapshot.eventTime).toBe('2026-07-22T02:01:03.000Z');
    expect(snapshot.quality.aggregationEligible).toBe(true);
  });

  it.each([
    ['retired DateTime', { DateTime: '2026-07-22 10:01:02' }],
    ['wrong-case AsOf', { asof: '2026-07-22T10:01:02+08:00' }],
    ['timezone-free AsOf', { AsOf: '2026-07-22T10:01:02' }],
    ['invalid AsOf', { AsOf: 'not-a-time' }],
    ['valid-looking AsOf', { AsOf: '2026-07-22T10:01:02+08:00' }],
  ])('ignores native %s and still uses capturedAt', (_, timeFields) => {
    const snapshot = convertTdxNativeSnapshot({
      securityId: 600030,
      providerSymbol: '600030.SH',
      capturedAt: '2026-07-22T10:01:03+08:00',
      native: { Now: 31.25, ...timeFields },
    });

    expect(snapshot.eventTime).toBe('2026-07-22T02:01:03.000Z');
    expect(snapshot.quality.aggregationEligible).toBe(true);
  });

  it('normalizes the offset capturedAt instant to UTC Z for candle event time', () => {
    const snapshot = convertTdxNativeSnapshot({
      securityId: 600030,
      providerSymbol: '600030.SH',
      capturedAt: '2026-08-06T13:54:01+08:00',
      native: { Now: 31.25, Volume: '10', Amount: '100' },
    });

    expect(snapshot.eventTime).toBe('2026-08-06T05:54:01.000Z');
    expect(snapshot.capturedAt).toBe('2026-08-06T13:54:01+08:00');
  });

  it('keeps an already-UTC capturedAt unchanged', () => {
    const snapshot = convertTdxNativeSnapshot({
      securityId: 600030,
      providerSymbol: '600030.SH',
      capturedAt: '2026-08-06T05:54:01.123Z',
      native: { Now: 31.25, Volume: '10', Amount: '100' },
    });

    expect(snapshot.eventTime).toBe('2026-08-06T05:54:01.123Z');
  });

  it('preserves absent/null quantities and distinguishes explicit zero', () => {
    const absent = convertTdxNativeSnapshot({
      securityId: 600030,
      providerSymbol: '600030.SH',
      capturedAt: '2026-07-22T10:01:03+08:00',
      native: { Now: 31.25 },
    });
    const explicitNull = convertTdxNativeSnapshot({
      securityId: 600030,
      providerSymbol: '600030.SH',
      capturedAt: '2026-07-22T10:01:03+08:00',
      native: { Now: 31.25, Volume: null, Amount: null },
    });
    const zero = convertTdxNativeSnapshot({
      securityId: 600030,
      providerSymbol: '600030.SH',
      capturedAt: '2026-07-22T10:01:03+08:00',
      native: { Now: 31.25, Volume: '0', Amount: '0.00000000' },
    });

    expect(absent.cumulativeVolume).toBeNull();
    expect(absent.cumulativeAmount).toBeNull();
    expect(explicitNull.cumulativeVolume).toBeNull();
    expect(explicitNull.cumulativeAmount).toBeNull();
    expect(zero.cumulativeVolume).toBe('0');
    expect(zero.cumulativeAmount).toBe('0');
  });

  it.each([
    ['Volume', 1],
    ['Amount', 1.5],
    ['Volume', ''],
    ['Amount', ' 1'],
    ['Volume', '+1'],
    ['Amount', '-0'],
    ['Volume', '1e2'],
    ['Amount', '1.230000000'],
    ['Volume', '0'.repeat(38)],
    ['Amount', '10000000000000000000000000000'],
  ])('rejects malformed present %s value %p', (field, value) => {
    expect(() =>
      convertTdxNativeSnapshot({
        securityId: 600030,
        providerSymbol: '600030.SH',
        capturedAt: '2026-07-22T10:01:03+08:00',
        native: { Now: 31.25, [field]: value },
      }),
    ).toThrow();
  });

  it.each(['volume', 'VOLUME', 'amount', 'AMOUNT'])(
    'rejects non-exact quantity key %s',
    (field) => {
      expect(() =>
        convertTdxNativeSnapshot({
          securityId: 600030,
          providerSymbol: '600030.SH',
          capturedAt: '2026-07-22T10:01:03+08:00',
          native: { Now: 31.25, [field]: '1' },
        }),
      ).toThrow(/exact key/);
    },
  );

  it('fails closed when accepted unit scaling exceeds Decimal8 range', () => {
    let error: unknown;
    try {
      convertTdxNativeSnapshot({
        securityId: 600030,
        providerSymbol: '600030.SH',
        capturedAt: '2026-07-22T10:01:03+08:00',
        native: {
          Now: 31.25,
          Volume: '9999999999999999999999999999.99999999',
        },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(RealtimeQuantityValidationError);
    expect(error).toMatchObject({
      source: 'tdx',
      field: 'volume',
      reason: 'out_of_range',
    });
  });
});
