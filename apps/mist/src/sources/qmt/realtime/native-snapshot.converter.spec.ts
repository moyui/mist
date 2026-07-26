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
      amount: 100,
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
});
