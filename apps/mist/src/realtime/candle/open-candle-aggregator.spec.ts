import { CanonicalRealtimeSnapshot } from '../realtime-native-frame';
import { OpenCandleAggregator } from './open-candle-aggregator';

/** Build a canonical snapshot with sensible defaults for candle tests. */
function snap(opts: {
  eventTime: string;
  last: number;
  cumulativeVolume?: number | null;
  cumulativeAmount?: number | null;
  source?: 'tdx' | 'qmt';
  securityId?: number;
  providerSymbol?: string;
}): CanonicalRealtimeSnapshot {
  return {
    source: opts.source ?? 'tdx',
    securityId: opts.securityId ?? 1,
    providerSymbol: opts.providerSymbol ?? '600030.SH',
    eventTime: opts.eventTime,
    capturedAt: opts.eventTime,
    prices: {
      last: opts.last,
      open: opts.last,
      high: opts.last,
      low: opts.last,
      lastClose: null,
    },
    cumulativeVolume: opts.cumulativeVolume ?? 0,
    cumulativeAmount: opts.cumulativeAmount ?? 0,
    quality: {
      level: 'latest-state',
      eventTimeAvailable: true,
      aggregationEligible: true,
      partialPrices: false,
    },
    native: {},
  };
}

/** Shanghai wall time → ISO with +08:00. */
const sh = (h: number, m: number, s = 0): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `2026-07-28T${pad(h)}:${pad(m)}:${pad(s)}+08:00`;
};

describe('OpenCandleAggregator', () => {
  it('opens a bucket on the first eligible snapshot', () => {
    const agg = new OpenCandleAggregator();
    const outcome = agg.applySnapshot(
      snap({ eventTime: sh(9, 30, 5), last: 10 }),
    );
    expect(outcome.kind).toBe('opened');
  });

  it('aggregates OHLC across snapshots in the same bucket', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30, 0),
        last: 10,
        cumulativeVolume: 100,
        cumulativeAmount: 1000,
      }),
    );
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30, 20),
        last: 12,
        cumulativeVolume: 150,
        cumulativeAmount: 1800,
      }),
    );
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30, 40),
        last: 8,
        cumulativeVolume: 200,
        cumulativeAmount: 2000,
      }),
    );

    const open = agg.peekOpen(1, 'tdx')!;
    expect(open.open).toBe(10); // first observed
    expect(open.high).toBe(12);
    expect(open.low).toBe(8);
    expect(open.close).toBe(8); // last observed
    expect(open.volumeDelta).toBe(100); // 200 - 100 baseline
    expect(open.amountDelta).toBe(1000); // 2000 - 1000
  });

  it('ignores duplicate or late eventTime (does not rewind state)', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(snap({ eventTime: sh(9, 30, 30), last: 10 }));
    agg.applySnapshot(snap({ eventTime: sh(9, 30, 20), last: 99 })); // earlier → ignored

    const open = agg.peekOpen(1, 'tdx')!;
    expect(open.close).toBe(10);
    expect(open.high).toBe(10);
  });

  it('skips snapshots without eventTime', () => {
    const agg = new OpenCandleAggregator();
    const noEt = snap({ eventTime: sh(9, 30), last: 10 });
    (
      noEt as CanonicalRealtimeSnapshot & { eventTime: string | null }
    ).eventTime = null;
    (noEt.quality as CanonicalRealtimeSnapshot['quality']).aggregationEligible =
      false;
    const result = agg.applySnapshot(noEt);
    expect(result.kind).toBe('skipped');
  });

  it('skips out-of-session snapshots (lunch break)', () => {
    const agg = new OpenCandleAggregator();
    const outcome = agg.applySnapshot(
      snap({ eventTime: sh(12, 30), last: 10 }),
    );
    expect(outcome.kind).toBe('skipped');
    expect(agg.peekOpen(1, 'tdx')).toBeNull();
  });

  it('rolls over to a new bucket and seals the old one', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30, 0),
        last: 10,
        cumulativeVolume: 100,
        cumulativeAmount: 1000,
      }),
    );
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30, 30),
        last: 15,
        cumulativeVolume: 200,
        cumulativeAmount: 2000,
      }),
    );
    const outcome = agg.applySnapshot(
      snap({
        eventTime: sh(9, 31, 10),
        last: 14,
        cumulativeVolume: 250,
        cumulativeAmount: 2500,
      }),
    );

    expect(outcome.kind).toBe('rolled-over');
    if (outcome.kind === 'rolled-over') {
      expect(outcome.sealed!.open).toBe(10);
      expect(outcome.sealed!.close).toBe(15);
      expect(outcome.sealed!.volume).toBe(100); // 200 - 100
    }
  });

  it('carries baseline across lunch (morning → afternoon same day)', () => {
    const agg = new OpenCandleAggregator();
    // Last morning bucket.
    agg.applySnapshot(
      snap({
        eventTime: sh(11, 29, 0),
        last: 10,
        cumulativeVolume: 5000,
        cumulativeAmount: 50000,
      }),
    );
    // Seal it.
    const sealed = agg.sealCurrent(1, 'tdx');
    expect(sealed!.closingCumulativeVolume).toBe(5000);

    // Afternoon snapshot should pick up the carried baseline.
    const outcome = agg.applySnapshot(
      snap({
        eventTime: sh(13, 0, 5),
        last: 11,
        cumulativeVolume: 5200,
        cumulativeAmount: 53000,
      }),
    );
    expect(outcome.kind).not.toBe('invalidated');
    const open = agg.peekOpen(1, 'tdx')!;
    expect(open.validity).toBe('valid');
    expect(open.volumeDelta).toBe(200); // 5200 - 5000 baseline
  });

  it('marks counter_reset when cumulative volume decreases', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30, 0),
        last: 10,
        cumulativeVolume: 1000,
        cumulativeAmount: 10000,
      }),
    );
    const outcome = agg.applySnapshot(
      snap({
        eventTime: sh(9, 30, 30),
        last: 11,
        cumulativeVolume: 500,
        cumulativeAmount: 5000,
      }),
    );
    expect(outcome.kind).toBe('invalidated');
    if (outcome.kind === 'invalidated') {
      expect(outcome.reason).toBe('counter_reset');
    }
    // The rebased cumulative should serve as the next baseline.
    const open = agg.peekOpen(1, 'tdx')!;
    expect(open.lastCumulativeVolume).toBe(500);
  });

  it('opens the first bucket validly with no prior baseline (delta starts from snapshot totals)', () => {
    const agg = new OpenCandleAggregator();
    const outcome = agg.applySnapshot(
      snap({
        eventTime: sh(9, 30, 0),
        last: 10,
        cumulativeVolume: 1000,
        cumulativeAmount: 10000,
      }),
      null, // no baseline — the snapshot's own totals are the starting point
    );
    expect(outcome.kind).toBe('opened');
    const open = agg.peekOpen(1, 'tdx')!;
    expect(open.validity).toBe('valid');
    expect(open.volumeDelta).toBe(0); // no prior reference → 0 for the first snapshot
  });

  it('does not mark invalid when snapshot has no cumulative totals (OHLC still forms)', () => {
    const agg = new OpenCandleAggregator();
    const outcome = agg.applySnapshot(
      snap({
        eventTime: sh(9, 30, 0),
        last: 10,
        cumulativeVolume: null,
        cumulativeAmount: null,
      }),
      null,
    );
    // No cumulative totals → deltas stay 0, OHLC still forms, not invalid.
    expect(outcome.kind).toBe('opened');
  });

  it('computes the first delta from an injected priorClosingTotals baseline on restart', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 35, 0),
        last: 10,
        cumulativeVolume: 3000,
        cumulativeAmount: 30000,
      }),
      { cumulativeVolume: 2900, cumulativeAmount: 29000 },
    );
    const open = agg.peekOpen(1, 'tdx')!;
    expect(open.validity).toBe('valid');
    // delta = current(3000) - baseline(2900) on the very first snapshot.
    expect(open.volumeDelta).toBe(100);
    expect(open.amountDelta).toBe(1000);
  });

  it('does not inherit baseline across trading days', () => {
    const agg = new OpenCandleAggregator();
    // Day 1 last bucket.
    agg.applySnapshot(
      snap({
        eventTime: sh(14, 59, 0),
        last: 10,
        cumulativeVolume: 9000,
        cumulativeAmount: 90000,
      }),
    );
    agg.sealCurrent(1, 'tdx');

    // Day 2 (different date) first bucket — baseline is NOT inherited from
    // day 1 (design: "不同自然日不继承 baseline"), so delta starts from 0
    // relative to this snapshot's own totals.
    const day2 = snap({
      eventTime: '2026-07-29T09:30:00+08:00',
      last: 11,
      cumulativeVolume: 100,
      cumulativeAmount: 1000,
    });
    const outcome = agg.applySnapshot(day2);
    expect(outcome.kind).toBe('opened');
    const open = agg.peekOpen(1, 'tdx')!;
    expect(open.validity).toBe('valid');
    expect(open.volumeDelta).toBe(0); // not 100 - 9000 (would be negative/counter-reset)
  });

  it('sealCurrent returns null when nothing is open', () => {
    const agg = new OpenCandleAggregator();
    expect(agg.sealCurrent(1, 'tdx')).toBeNull();
  });

  it('sealCurrent produces a valid sealed candle with provisional quality', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30, 0),
        last: 10,
        cumulativeVolume: 100,
        cumulativeAmount: 1000,
      }),
    );
    const sealed = agg.sealCurrent(1, 'tdx')!;
    expect(sealed.quality).toBe('provisional');
    expect(sealed.validity).toBe('valid');
    expect(sealed.open).toBe(10);
    expect(sealed.closingCumulativeVolume).toBe(100);
  });

  it('closingSnapshot is a compact projection (no full native object)', () => {
    const agg = new OpenCandleAggregator();
    const rich = snap({ eventTime: sh(9, 30, 0), last: 10 });
    (
      rich as CanonicalRealtimeSnapshot & { native: Record<string, unknown> }
    ).native = {
      secret: 'should-not-leak',
      orderBook: { bids: [1, 2, 3] },
    };
    agg.applySnapshot(rich);
    const open = agg.peekOpen(1, 'tdx')!;
    const cs = open.closingSnapshot!;
    // Compact fields present...
    expect(cs).toHaveProperty('securityId');
    expect(cs).toHaveProperty('price');
    // ...full native NOT copied.
    expect((cs as unknown as Record<string, unknown>).native).toBeUndefined();
    expect(
      (cs as unknown as Record<string, unknown>).orderBook,
    ).toBeUndefined();
  });

  it('markInvalid flags an open bucket without opening a new one', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(snap({ eventTime: sh(9, 30, 0), last: 10 }));
    agg.markInvalid(1, 'tdx', 'queue_overflow');
    const open = agg.peekOpen(1, 'tdx')!;
    expect(open.validity).toBe('invalid');
    expect(open.invalidReason).toBe('queue_overflow');
  });

  it('keeps separate state per source for the same security', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(snap({ eventTime: sh(9, 30, 0), last: 10 }));
    const qmtSnap = snap({ eventTime: sh(9, 30, 0), last: 20 });
    (qmtSnap as CanonicalRealtimeSnapshot & { source: 'qmt' }).source = 'qmt';
    agg.applySnapshot(qmtSnap);

    expect(agg.peekOpen(1, 'tdx')!.open).toBe(10);
    expect(agg.peekOpen(1, 'qmt')!.open).toBe(20);
  });
});
