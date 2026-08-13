import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Decimal8 } from '../../../../../libs/decimal/src/decimal8';
import { convertTdxNativeSnapshot } from '../../sources/tdx/realtime/native-snapshot.converter';
import { convertQmtNativeSnapshot } from '../../sources/qmt/realtime/native-snapshot.converter';
import {
  decodeRealtimeNativeMapMessage,
  parseRealtimeMessage,
} from '../realtime-native-map.decoder';
import { resolveCandleBucket } from './candle-bucket.util';
import { OpenCandleAggregator } from './open-candle-aggregator';

/**
 * S2 contract gate (fixed-point-candle-arithmetic): real fixture frames →
 * decoder → converter → aggregator → sealed. Every sealed numeric field
 * must satisfy the 2-decimal fixed-point invariant
 * `abs(v * 100 - round(v * 100)) < 1e-9`, and VWAP must equal a Decimal8
 * independent computation.
 */

const fixturePath = resolve(
  __dirname,
  '../../../../../test/fixtures/realtime/realtime-native-frame-v2.json',
);

function loadFixture(): {
  tdx: Record<string, unknown>;
  qmt: Record<string, unknown>;
} {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
    cases: {
      tdxOneEntry: Record<string, unknown>;
      qmtOneEntry: Record<string, unknown>;
    };
  };
  return { tdx: fixture.cases.tdxOneEntry, qmt: fixture.cases.qmtOneEntry };
}

function assertCentsExact(sealed: {
  open: number;
  high: number;
  low: number;
  close: number;
}): void {
  for (const value of [sealed.open, sealed.high, sealed.low, sealed.close]) {
    expect(Math.abs(value * 100 - Math.round(value * 100))).toBeLessThan(1e-9);
  }
}

describe('fixed-point candle contract (S2 gate)', () => {
  it('seals TDX fixture frame with cents-exact fields and string quantities', () => {
    const { tdx } = loadFixture();
    const decoded = decodeRealtimeNativeMapMessage(
      parseRealtimeMessage(JSON.stringify(tdx)),
      'tdx',
    );
    const entry = decoded.data.native['600030.SH'] as Record<string, unknown>;
    const snapshot = convertTdxNativeSnapshot({
      securityId: 10,
      providerSymbol: '600030.SH',
      capturedAt: decoded.data.capturedAt,
      native: entry,
    });

    expect(typeof snapshot.cumulativeVolume).toBe('string');
    expect(typeof snapshot.cumulativeAmount).toBe('string');

    const agg = new OpenCandleAggregator();
    agg.applySnapshot(snapshot, { priorClosingTotals: null });
    const sealed = agg.freezeCandidate(
      10,
      'tdx',
      resolveCandleBucket(snapshot.eventTime!)!.bucketStartMs,
    );
    expect(sealed).not.toBeNull();

    assertCentsExact(sealed!);
    expect(typeof sealed!.closingCumulativeVolume).toBe('string');
    expect(typeof sealed!.closingCumulativeAmount).toBe('string');
    // Single-frame bucket has no quantity delta (no baseline) → no VWAP
    // clamp; open/high/low/close all equal the observed last price.
    expect(sealed!.open).toBe(31.25);
    expect(sealed!.high).toBe(31.25);
    expect(sealed!.low).toBe(31.25);
  });

  it('seals QMT fixture frame with cents-exact fields', () => {
    const { qmt } = loadFixture();
    const decoded = decodeRealtimeNativeMapMessage(
      parseRealtimeMessage(JSON.stringify(qmt)),
      'qmt',
    );
    const entry = decoded.data.native['300502.SZ'] as Record<string, unknown>;
    const snapshot = convertQmtNativeSnapshot({
      securityId: 4,
      providerSymbol: '300502.SZ',
      capturedAt: decoded.data.capturedAt,
      native: entry,
    });

    const agg = new OpenCandleAggregator();
    agg.applySnapshot(snapshot, { priorClosingTotals: null });
    const sealed = agg.freezeCandidate(
      4,
      'qmt',
      resolveCandleBucket(snapshot.eventTime!)!.bucketStartMs,
    );
    expect(sealed).not.toBeNull();

    assertCentsExact(sealed!);
    // Single-frame bucket: aggregator initializes open/high/low/close from
    // the last price (541.2), not from the native open/high/low fields.
    expect(sealed!.open).toBe(541.2);
    expect(sealed!.high).toBe(541.2);
    expect(sealed!.low).toBe(541.2);
  });

  it('clamps out-of-band VWAP with Decimal8-exact value', () => {
    // Two TDX frames in one bucket: delta volume 10000, amount 310000
    // → vwap = 31.00 > sampled high 30.5 → clamp high to 31.00 exactly.
    const base = {
      Now: 30.5,
      Open: 30.4,
      Max: 30.5,
      Min: 30.3,
      LastClose: 30.8,
      DateTime: '2026-07-25 10:00:00',
      ErrorId: 0,
    };
    const frame1: Record<string, unknown> = {
      '600030.SH': { ...base, Volume: '10000', Amount: '310000' },
    };
    const frame2: Record<string, unknown> = {
      '600030.SH': {
        ...base,
        DateTime: '2026-07-25 10:00:30',
        Volume: '20000',
        Amount: '620000',
      },
    };
    const first = convertTdxNativeSnapshot({
      securityId: 10,
      providerSymbol: '600030.SH',
      capturedAt: '2026-07-25T10:00:00+08:00',
      native: frame1['600030.SH'] as Record<string, unknown>,
    });
    const second = convertTdxNativeSnapshot({
      securityId: 10,
      providerSymbol: '600030.SH',
      capturedAt: '2026-07-25T10:00:30+08:00',
      native: frame2['600030.SH'] as Record<string, unknown>,
    });

    const agg = new OpenCandleAggregator();
    // TDX quantities are unit-converted by the converter (Volume ×100 lots→
    // shares, Amount ×10000) — prior closing totals must use converted units.
    agg.applySnapshot(first, {
      priorClosingTotals: {
        tradingDay: '20260725',
        cumulativeVolume: '1000000',
        cumulativeAmount: '3100000000',
      },
    });
    agg.applySnapshot(second);
    const sealed = agg.freezeCandidate(
      10,
      'tdx',
      resolveCandleBucket(first.eventTime!)!.bucketStartMs,
    );
    expect(sealed).not.toBeNull();

    // delta = 1,000,000 shares / 3,100,000,000 yuan → vwap 3100 > sampled
    // high 30.5 → clamp high to the Decimal8-exact 3100.
    expect(sealed!.high).toBe(3100);
    expect(sealed!.low).toBe(30.5);
    assertCentsExact(sealed!);
  });

  it('keeps VWAP cents-exact when amount carries decimals', () => {
    // QMT frames: amount 6678914.25 (float) → converter canonicalizes to
    // string → Decimal8 VWAP → cents-exact sealed fields.
    const frame = (
      overrides: Record<string, unknown>,
    ): Record<string, unknown> => ({
      '300502.SZ': {
        timetag: '20260725 10:00:00',
        lastPrice: 540,
        open: 535,
        high: 540,
        low: 534,
        lastClose: 536.8,
        volume: 12345,
        amount: 6678914.25,
        ...overrides,
      },
    });
    const first = convertQmtNativeSnapshot({
      securityId: 4,
      providerSymbol: '300502.SZ',
      capturedAt: '2026-07-25T10:00:00+08:00',
      native: frame({})['300502.SZ'] as Record<string, unknown>,
    });
    const second = convertQmtNativeSnapshot({
      securityId: 4,
      providerSymbol: '300502.SZ',
      capturedAt: '2026-07-25T10:00:30+08:00',
      native: frame({
        timetag: '20260725 10:00:30',
        volume: 24690,
        amount: 13357828.5,
      })['300502.SZ'] as Record<string, unknown>,
    });

    expect(typeof first.cumulativeAmount).toBe('string');
    expect(typeof first.cumulativeVolume).toBe('string');
    // QMT volume native unit is lots → ×100 to shares.
    expect(first.cumulativeVolume).toBe('1234500');

    const agg = new OpenCandleAggregator();
    agg.applySnapshot(first, {
      priorClosingTotals: {
        tradingDay: '20260725',
        cumulativeVolume: '1234500',
        cumulativeAmount: '6678914.25',
      },
    });
    agg.applySnapshot(second);
    const sealed = agg.freezeCandidate(
      4,
      'qmt',
      resolveCandleBucket(first.eventTime!)!.bucketStartMs,
    );
    expect(sealed).not.toBeNull();

    // delta = 1234500 shares / 6678914.25 yuan → vwap = 5.41 (Decimal8-exact)
    // — far below the sampled low 534 (fixture volume is a mock value, not
    // self-consistent) → low clamped to the cents-exact vwap.
    const expectedVwap = Number(
      Decimal8.parseCanonical(second.cumulativeAmount!)
        .subtract(Decimal8.parseCanonical('6678914.25'))
        .divideRoundHalfUp(
          Decimal8.parseCanonical(second.cumulativeVolume!).subtract(
            Decimal8.parseCanonical('1234500'),
          ),
        )
        .roundToScale(2)
        .formatCanonical(),
    );
    expect(expectedVwap).toBe(5.41);
    expect(sealed!.high).toBe(540);
    expect(sealed!.low).toBe(5.41);
    assertCentsExact(sealed!);
  });
});
