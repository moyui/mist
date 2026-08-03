import {
  convertQmtNativeSnapshot,
  resolveQmtBusinessTime,
} from './native-snapshot.converter';

describe('QMT native snapshot converter', () => {
  it('preserves canonical identity and complete native values', () => {
    const native = {
      time: Date.parse('2026-07-22T10:01:02+08:00'),
      timetag: '20260722 10:01:02',
      lastPrice: 541.2,
      open: 520,
      high: 550,
      low: 510,
      lastClose: 519,
      volume: 10,
      amount: 100.25,
      providerOnly: { nested: true },
    };

    const snapshot = convertQmtNativeSnapshot({
      securityId: 300502,
      providerSymbol: '300502.SZ',
      capturedAt: '2026-07-22T10:01:03+08:00',
      native,
    });

    expect(snapshot.securityId).toBe(300502);
    expect(snapshot.providerSymbol).toBe('300502.SZ');
    expect(snapshot.eventTime).toBe('2026-07-22T02:01:02.000Z');
    expect(snapshot.native).toEqual(native);
    expect(snapshot.native).not.toBe(native);
    expect(snapshot.quality.aggregationEligible).toBe(true);
    expect(snapshot.cumulativeVolume).toBe('1000');
    expect(snapshot.cumulativeAmount).toBe('100.25');
  });

  it('returns null eventTime when provider candidates conflict', () => {
    const native = {
      time: Date.parse('2026-07-22T10:01:02+08:00'),
      timetag: '20260722 10:01:05',
    };

    expect(resolveQmtBusinessTime(native)).toBeNull();
    const snapshot = convertQmtNativeSnapshot({
      securityId: 300502,
      providerSymbol: '300502.SZ',
      capturedAt: '2026-07-22T10:01:03+08:00',
      native: { ...native, lastPrice: 541.2 },
    });
    expect(snapshot.eventTime).toBeNull();
    expect(snapshot.quality.aggregationEligible).toBe(false);
  });

  it('does not use capturedAt as an event-time fallback', () => {
    const snapshot = convertQmtNativeSnapshot({
      securityId: 300502,
      providerSymbol: '300502.SZ',
      capturedAt: '2026-07-22T10:01:03+08:00',
      native: { lastPrice: 541.2 },
    });

    expect(snapshot.eventTime).toBeNull();
  });

  it('preserves absent/null quantities and distinguishes explicit zero', () => {
    const absent = convertQmtNativeSnapshot({
      securityId: 300502,
      providerSymbol: '300502.SZ',
      capturedAt: '2026-07-22T10:01:03+08:00',
      native: { lastPrice: 541.2 },
    });
    const explicitNull = convertQmtNativeSnapshot({
      securityId: 300502,
      providerSymbol: '300502.SZ',
      capturedAt: '2026-07-22T10:01:03+08:00',
      native: { lastPrice: 541.2, volume: null, amount: null },
    });
    const zero = convertQmtNativeSnapshot({
      securityId: 300502,
      providerSymbol: '300502.SZ',
      capturedAt: '2026-07-22T10:01:03+08:00',
      native: { lastPrice: 541.2, volume: 0, amount: 0 },
    });

    expect(absent.cumulativeVolume).toBeNull();
    expect(absent.cumulativeAmount).toBeNull();
    expect(explicitNull.cumulativeVolume).toBeNull();
    expect(explicitNull.cumulativeAmount).toBeNull();
    expect(zero.cumulativeVolume).toBe('0');
    expect(zero.cumulativeAmount).toBe('0');
  });

  it('expands supported scientific notation without rounding', () => {
    const snapshot = convertQmtNativeSnapshot({
      securityId: 300502,
      providerSymbol: '300502.SZ',
      capturedAt: '2026-07-22T10:01:03+08:00',
      native: { lastPrice: 541.2, volume: 10, amount: 1e-8 },
    });

    expect(snapshot.cumulativeAmount).toBe('0.00000001');
  });

  it.each([
    ['volume', '10'],
    ['volume', 1.5],
    ['volume', Number.MAX_SAFE_INTEGER + 1],
    ['volume', -1],
    ['volume', -0],
    ['amount', '100'],
    ['amount', Number.NaN],
    ['amount', Number.POSITIVE_INFINITY],
    ['amount', -1],
    ['amount', -0],
    ['amount', 0.123456789],
  ])('rejects invalid native %s value %p', (field, value) => {
    expect(() =>
      convertQmtNativeSnapshot({
        securityId: 300502,
        providerSymbol: '300502.SZ',
        capturedAt: '2026-07-22T10:01:03+08:00',
        native: { lastPrice: 541.2, [field]: value },
      }),
    ).toThrow();
  });
});
