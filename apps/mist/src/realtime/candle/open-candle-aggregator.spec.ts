import type { CanonicalRealtimeSnapshot } from '../realtime.types';
import { resolveCandleBucket } from './candle-bucket.util';
import { OpenCandleAggregator } from './open-candle-aggregator';

function snap(opts: {
  eventTime: string;
  last?: number;
  cumulativeVolume?: string | null;
  cumulativeAmount?: string | null;
  source?: 'tdx' | 'qmt';
  securityId?: number;
}): CanonicalRealtimeSnapshot {
  return {
    source: opts.source ?? 'tdx',
    securityId: opts.securityId ?? 1,
    providerSymbol: opts.source === 'qmt' ? '600030.SH' : '600030.SH',
    eventTime: opts.eventTime,
    capturedAt: opts.eventTime,
    prices: {
      last: opts.last ?? 10,
      open: opts.last ?? 10,
      high: opts.last ?? 10,
      low: opts.last ?? 10,
      lastClose: null,
    },
    cumulativeVolume:
      opts.cumulativeVolume === undefined ? '0' : opts.cumulativeVolume,
    cumulativeAmount:
      opts.cumulativeAmount === undefined ? '0' : opts.cumulativeAmount,
    quality: {
      level: 'latest-state',
      eventTimeAvailable: true,
      aggregationEligible: true,
      partialPrices: false,
    },
    native: {},
  };
}

const sh = (h: number, m: number, s = 0, day = 28): string => {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `2026-07-${pad(day)}T${pad(h)}:${pad(m)}:${pad(s)}+08:00`;
};

const bucketStart = (eventTime: string): number =>
  resolveCandleBucket(eventTime)!.bucketStartMs;

describe('OpenCandleAggregator', () => {
  it('aggregates OHLC and exact quantities within one bucket', () => {
    const agg = new OpenCandleAggregator();
    expect(
      agg.applySnapshot(
        snap({
          eventTime: sh(9, 30),
          last: 10,
          cumulativeVolume: '9007199254740992.00000001',
          cumulativeAmount: '1000',
        }),
        {
          priorClosingTotals: {
            tradingDay: '20260728',
            cumulativeVolume: '9007199254740992',
            cumulativeAmount: '1000',
          },
        },
      ).kind,
    ).toBe('opened');
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30, 20),
        last: 12,
        cumulativeVolume: '9007199254740992.00000003',
        cumulativeAmount: '1800',
      }),
    );
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30, 40),
        last: 8,
        cumulativeVolume: '9007199254740992.00000004',
        cumulativeAmount: '2000',
      }),
    );

    expect(agg.peekOpen(1, 'tdx')).toMatchObject({
      open: 10,
      high: 12,
      low: 8,
      close: 8,
      volumeDelta: '0.00000004',
      amountDelta: '1000',
    });
  });

  it('skips missing event time, out-of-session, and duplicate events', () => {
    const agg = new OpenCandleAggregator();
    const missing = snap({ eventTime: sh(9, 30) });
    missing.eventTime = null;
    missing.quality.aggregationEligible = false;
    expect(agg.applySnapshot(missing)).toEqual({
      kind: 'skipped',
      reason: 'no_event_time',
    });
    expect(agg.applySnapshot(snap({ eventTime: sh(12, 30) }))).toEqual({
      kind: 'skipped',
      reason: 'out_of_session',
    });

    agg.applySnapshot(snap({ eventTime: sh(9, 30, 30), last: 10 }));
    expect(
      agg.applySnapshot(snap({ eventTime: sh(9, 30, 20), last: 99 })),
    ).toEqual({ kind: 'skipped', reason: 'duplicate_or_late' });
    expect(agg.peekOpen(1, 'tdx')?.close).toBe(10);
  });

  it('rolls current to grace-pending without sealing or removing it', () => {
    const agg = new OpenCandleAggregator();
    const priorTime = sh(9, 30);
    const currentTime = sh(9, 31);
    agg.applySnapshot(snap({ eventTime: priorTime }));

    const outcome = agg.applySnapshot(snap({ eventTime: currentTime }));

    expect(outcome).toEqual({
      kind: 'rolled-over',
      prior: resolveCandleBucket(priorTime),
      opened: resolveCandleBucket(currentTime),
    });
    expect(agg.candidateBuckets(1, 'tdx')).toEqual([
      bucketStart(priorTime),
      bucketStart(currentTime),
    ]);
    expect(agg.peekCandidate(1, 'tdx', bucketStart(priorTime))).not.toBeNull();
  });

  it('applies a within-grace prior frame without rolling current backward', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30),
        cumulativeVolume: '100',
        cumulativeAmount: '1000',
      }),
      {
        priorClosingTotals: {
          tradingDay: '20260728',
          cumulativeVolume: '100',
          cumulativeAmount: '1000',
        },
      },
    );
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 31),
        cumulativeVolume: '200',
        cumulativeAmount: '2000',
      }),
    );
    expect(agg.peekOpen(1, 'tdx')?.volumeDelta).toBe('100');

    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30, 50),
        cumulativeVolume: '150',
        cumulativeAmount: '1500',
      }),
      {
        acceptedAtMs: Date.parse(sh(9, 31, 4)),
        graceMs: 5_000,
      },
    );

    expect(
      agg.peekCandidate(1, 'tdx', bucketStart(sh(9, 30)))?.volumeDelta,
    ).toBe('50');
    expect(agg.peekOpen(1, 'tdx')).toMatchObject({
      bucketStartMs: bucketStart(sh(9, 31)),
      volumeDelta: '50',
      amountDelta: '500',
    });
  });

  it('rejects a frame after grace without mutating its candidate', () => {
    const agg = new OpenCandleAggregator();
    const eventTime = sh(9, 30, 10);
    agg.applySnapshot(snap({ eventTime, last: 10 }));
    const before = { ...agg.peekOpen(1, 'tdx') };

    expect(
      agg.applySnapshot(snap({ eventTime: sh(9, 30, 50), last: 20 }), {
        acceptedAtMs: Date.parse(sh(9, 31, 6)),
        graceMs: 5_000,
      }),
    ).toEqual({ kind: 'skipped', reason: 'late_after_grace' });
    expect(agg.peekOpen(1, 'tdx')).toEqual(before);
  });

  it('does not roll current backward when an older unmatched bucket arrives', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(snap({ eventTime: sh(9, 31) }));
    agg.applySnapshot(snap({ eventTime: sh(9, 32) }));

    expect(agg.applySnapshot(snap({ eventTime: sh(9, 30, 50) }))).toEqual({
      kind: 'skipped',
      reason: 'duplicate_or_late',
    });
    expect(agg.peekOpen(1, 'tdx')?.bucketStartMs).toBe(bucketStart(sh(9, 32)));
  });

  it('fails closed instead of allocating a third candidate', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(snap({ eventTime: sh(9, 30) }));
    agg.applySnapshot(snap({ eventTime: sh(9, 31) }));

    expect(agg.applySnapshot(snap({ eventTime: sh(9, 32) }))).toEqual({
      kind: 'skipped',
      reason: 'candidate_capacity_exceeded',
    });
    expect(agg.candidateBuckets(1, 'tdx')).toEqual([
      bucketStart(sh(9, 30)),
      bucketStart(sh(9, 31)),
    ]);
  });

  it('freezes and commits only the exact requested bucket', () => {
    const agg = new OpenCandleAggregator();
    const prior = bucketStart(sh(9, 30));
    const current = bucketStart(sh(9, 31));
    agg.applySnapshot(snap({ eventTime: sh(9, 30) }));
    agg.applySnapshot(snap({ eventTime: sh(9, 31) }));

    const frozen = agg.freezeCandidate(1, 'tdx', prior);
    expect(frozen?.bucketStartMs).toBe(prior);
    expect(agg.freezeCandidate(1, 'tdx', prior)).toBe(frozen);
    expect(agg.candidateBuckets(1, 'tdx')).toEqual([prior, current]);
    expect(agg.commitCandidate(1, 'tdx', current)).toBe(false);
    expect(agg.commitCandidate(1, 'tdx', prior)).toBe(true);
    expect(agg.candidateBuckets(1, 'tdx')).toEqual([current]);
  });

  it('preserves raw null while holding a trusted same-day cumulative counter', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30),
        cumulativeVolume: '100',
        cumulativeAmount: '1000',
      }),
      {
        priorClosingTotals: {
          tradingDay: '20260728',
          cumulativeVolume: '100',
          cumulativeAmount: '1000',
        },
      },
    );
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30, 20),
        cumulativeVolume: null,
        cumulativeAmount: null,
      }),
    );
    const frozen = agg.freezeCandidate(1, 'tdx', bucketStart(sh(9, 30)))!;

    expect(frozen).toMatchObject({
      volume: '0',
      amount: '0',
      closingCumulativeVolume: '100',
      closingCumulativeAmount: '1000',
      closingSnapshot: {
        cumulativeVolume: null,
        cumulativeAmount: null,
      },
    });
  });

  it('seals null quantities when no same-day baseline is ever established', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30),
        cumulativeVolume: null,
        cumulativeAmount: null,
      }),
    );
    expect(agg.freezeCandidate(1, 'tdx', bucketStart(sh(9, 30)))).toMatchObject(
      {
        volume: null,
        amount: null,
        closingCumulativeVolume: null,
        closingCumulativeAmount: null,
      },
    );
  });

  it('keeps the first cumulative observation unavailable until it becomes a committed same-day baseline', () => {
    const agg = new OpenCandleAggregator();
    const firstBucket = bucketStart(sh(9, 30));
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30),
        cumulativeVolume: '100',
        cumulativeAmount: '1000',
      }),
    );

    expect(agg.freezeCandidate(1, 'tdx', firstBucket)).toMatchObject({
      volume: null,
      amount: null,
      closingCumulativeVolume: '100',
      closingCumulativeAmount: '1000',
    });
    expect(agg.commitCandidate(1, 'tdx', firstBucket)).toBe(true);

    agg.applySnapshot(
      snap({
        eventTime: sh(9, 31),
        cumulativeVolume: '110',
        cumulativeAmount: '1200',
      }),
    );
    expect(agg.peekOpen(1, 'tdx')).toMatchObject({
      volumeDelta: '10',
      amountDelta: '200',
    });
  });

  it('holds both quantity windows when frames carry partial quantities', () => {
    // Price-only frame rule (B): when either cumulative quantity is absent,
    // neither window advances — v/a must always span the same frame set.
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30),
        cumulativeVolume: '100',
        cumulativeAmount: '1000',
      }),
    );
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 31),
        cumulativeVolume: '110',
        cumulativeAmount: null,
      }),
    );
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 31, 20),
        cumulativeVolume: null,
        cumulativeAmount: '1200',
      }),
    );
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 31, 40),
        cumulativeVolume: '125.00000001',
        cumulativeAmount: null,
      }),
    );

    // The 09:31 bucket never saw a dual-field frame: v/a stay null (held).
    expect(agg.freezeCandidate(1, 'tdx', bucketStart(sh(9, 31)))).toMatchObject(
      {
        volume: null,
        amount: null,
        closingCumulativeVolume: '100',
        closingCumulativeAmount: '1000',
      },
    );
    agg.commitCandidate(1, 'tdx', bucketStart(sh(9, 31)));

    // The first dual-field frame resumes both windows from the same baseline.
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 32),
        cumulativeVolume: '140',
        cumulativeAmount: '1450',
      }),
    );
    expect(agg.freezeCandidate(1, 'tdx', bucketStart(sh(9, 32)))).toMatchObject(
      {
        volume: '40',
        amount: '450',
        closingCumulativeVolume: '140',
        closingCumulativeAmount: '1450',
      },
    );
  });

  it('classifies counter reset before emitting a negative delta', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(snap({ eventTime: sh(9, 30), cumulativeVolume: '100' }));
    const outcome = agg.applySnapshot(
      snap({ eventTime: sh(9, 30, 20), cumulativeVolume: '90' }),
    );

    expect(outcome).toMatchObject({
      kind: 'invalidated',
      reason: 'counter_reset',
    });
    expect(agg.peekOpen(1, 'tdx')).toMatchObject({
      validity: 'invalid',
      invalidReason: 'counter_reset',
      volumeDelta: null,
    });
  });

  it('does not inherit a committed baseline across trading days', () => {
    const agg = new OpenCandleAggregator();
    const dayOneBucket = bucketStart(sh(14, 59));
    agg.applySnapshot(
      snap({ eventTime: sh(14, 59), cumulativeVolume: '9000' }),
    );
    agg.freezeCandidate(1, 'tdx', dayOneBucket);
    agg.commitCandidate(1, 'tdx', dayOneBucket);

    agg.applySnapshot(
      snap({ eventTime: sh(9, 30, 0, 29), cumulativeVolume: '100' }),
    );
    expect(agg.peekOpen(1, 'tdx')?.volumeDelta).toBeNull();
  });

  it('accepts only an explicitly same-day recovered baseline', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(
      snap({ eventTime: sh(9, 35), cumulativeVolume: '3000' }),
      {
        priorClosingTotals: {
          tradingDay: '20260728',
          cumulativeVolume: '2900',
          cumulativeAmount: '0',
        },
      },
    );
    expect(agg.peekOpen(1, 'tdx')?.volumeDelta).toBe('100');

    const other = new OpenCandleAggregator();
    other.applySnapshot(
      snap({ eventTime: sh(9, 35), cumulativeVolume: '3000' }),
      {
        priorClosingTotals: {
          tradingDay: '20260727',
          cumulativeVolume: '2900',
          cumulativeAmount: '0',
        },
      },
    );
    expect(other.peekOpen(1, 'tdx')?.volumeDelta).toBeNull();
  });

  it('keeps the same security isolated by source', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(snap({ eventTime: sh(9, 30), last: 10 }));
    agg.applySnapshot(snap({ eventTime: sh(9, 30), last: 20, source: 'qmt' }));

    expect(agg.peekOpen(1, 'tdx')?.open).toBe(10);
    expect(agg.peekOpen(1, 'qmt')?.open).toBe(20);
  });

  it('removes prior-day mutable owners across a security source switch', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(snap({ eventTime: sh(14, 59), source: 'tdx' }));

    agg.applySnapshot(
      snap({ eventTime: sh(9, 30, 0, 29), source: 'qmt', last: 20 }),
    );

    expect(agg.peekOpen(1, 'tdx')).toBeNull();
    expect(agg.peekOpen(1, 'qmt')).toMatchObject({
      tradingDay: '20260729',
      open: 20,
    });
  });

  it('keeps native payload out of the frozen closing projection', () => {
    const agg = new OpenCandleAggregator();
    const snapshot = snap({ eventTime: sh(9, 30) });
    snapshot.native = { secret: 'do-not-copy', orderBook: { bids: [1] } };
    agg.applySnapshot(snapshot);

    const closing = agg.freezeCandidate(1, 'tdx', bucketStart(sh(9, 30)))
      ?.closingSnapshot as unknown as Record<string, unknown>;
    expect(closing.native).toBeUndefined();
    expect(closing.orderBook).toBeUndefined();
  });

  it('reports only bounded aggregate candidate diagnostics', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(snap({ eventTime: sh(9, 30) }));
    agg.freezeCandidate(1, 'tdx', bucketStart(sh(9, 30)));

    expect(agg.diagnostics()).toEqual({
      seriesCount: 1,
      candidateCount: 1,
      invalidCandidateCount: 0,
      frozenCandidateCount: 1,
      quantityMissingFrameCount: 0,
      skipTotals: {},
    });
  });

  it('seals null v/a when every frame of a bucket lacks quantities', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30),
        cumulativeVolume: null,
        cumulativeAmount: null,
      }),
      {
        priorClosingTotals: {
          tradingDay: '20260728',
          cumulativeVolume: '100',
          cumulativeAmount: '1000',
        },
      },
    );
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30, 20),
        cumulativeVolume: null,
        cumulativeAmount: null,
      }),
    );

    const frozen = agg.freezeCandidate(1, 'tdx', bucketStart(sh(9, 30)))!;
    // Missing quantities stay null — never fabricated as a fake zero bucket.
    expect(frozen.volume).toBeNull();
    expect(frozen.amount).toBeNull();
    // Baseline is preserved for the next bucket.
    expect(frozen.closingCumulativeVolume).toBe('100');
    expect(frozen.closingCumulativeAmount).toBe('1000');
    expect(agg.diagnostics().quantityMissingFrameCount).toBe(2);
  });

  it('resumes the shared quantity window from the next dual-field frame', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30),
        cumulativeVolume: null,
        cumulativeAmount: null,
      }),
      {
        priorClosingTotals: {
          tradingDay: '20260728',
          cumulativeVolume: '100',
          cumulativeAmount: '1000',
        },
      },
    );
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30, 20),
        cumulativeVolume: '150',
        cumulativeAmount: '2000',
      }),
    );

    const frozen = agg.freezeCandidate(1, 'tdx', bucketStart(sh(9, 30)))!;
    // Both windows advance from the same baseline on the first dual-field frame.
    expect(frozen.volume).toBe('50');
    expect(frozen.amount).toBe('1000');
  });

  it('price-only frames never trigger counter_reset invalidation', () => {
    const agg = new OpenCandleAggregator();
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30),
        cumulativeVolume: '100',
        cumulativeAmount: '1000',
      }),
    );
    agg.applySnapshot(
      snap({
        eventTime: sh(9, 30, 20),
        last: 9.5,
        cumulativeVolume: null,
        cumulativeAmount: null,
      }),
    );

    const open = agg.peekOpen(1, 'tdx');
    expect(open?.validity).toBe('valid');
    expect(open?.invalidReason).toBeNull();
    // Price state still advances on the price-only frame.
    expect(open?.close).toBe(9.5);
  });
});
