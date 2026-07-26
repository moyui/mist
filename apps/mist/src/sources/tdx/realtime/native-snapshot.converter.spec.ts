import { convertTdxNativeSnapshot } from './native-snapshot.converter';

describe('TDX native snapshot converter', () => {
  it('uses only provider-native time and preserves identity/native values', () => {
    const native = {
      Now: '31.25',
      Open: 30,
      Max: 32,
      Min: 29,
      LastClose: 30.5,
      Volume: 10,
      Amount: 100,
      DateTime: '2026-07-22 10:01:02',
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
    expect(snapshot.eventTime).toBe('2026-07-22T10:01:02+08:00');
    expect(snapshot.prices.last).toBe(31.25);
    expect(snapshot.native).toEqual(native);
  });

  it('does not fall back to capturedAt when native time is absent', () => {
    const snapshot = convertTdxNativeSnapshot({
      securityId: 600030,
      providerSymbol: '600030.SH',
      capturedAt: '2026-07-22T10:01:03+08:00',
      native: { Now: 31.25 },
    });

    expect(snapshot.eventTime).toBeNull();
    expect(snapshot.quality.aggregationEligible).toBe(false);
  });
});
