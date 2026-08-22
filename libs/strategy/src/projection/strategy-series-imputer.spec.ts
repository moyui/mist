import type { StrategyBar } from '../market-data/strategy-bar';
import { StrategySeriesImputer, imputeSeries } from './strategy-series-imputer';

describe('imputeSeries', () => {
  it('back-fills a leading missing value from the nearest later anchor', () => {
    const bars = buildBars(3);
    bars[0] = { ...bars[0], open: Number.NaN };

    const [first] = imputeSeries(bars);

    expect(first.ohlc).toEqual({
      raw: null,
      effective: {
        open: bars[1].open,
        high: bars[1].high,
        low: bars[1].low,
        close: bars[1].close,
      },
      resolution: 'backfilled',
    });
  });

  it('back-fills a middle missing value from the nearest later anchor, not the earlier one', () => {
    const bars = buildBars(3);
    bars[1] = { ...bars[1], open: Number.NaN };
    expect(bars[0].close).not.toEqual(bars[2].close);

    const [, middle] = imputeSeries(bars);

    expect(middle.ohlc.resolution).toBe('backfilled');
    expect(middle.ohlc.effective?.close).toBe(bars[2].close);
  });

  it('forward-fills trailing missing values from the nearest earlier anchor', () => {
    const bars = buildBars(3);
    bars[1] = { ...bars[1], open: Number.NaN };
    bars[2] = { ...bars[2], open: Number.NaN };

    const projected = imputeSeries(bars);

    expect(projected[1].ohlc.resolution).toBe('forwardFilled');
    expect(projected[2].ohlc.resolution).toBe('forwardFilled');
    expect(projected[2].ohlc.effective).toEqual(projected[0].ohlc.effective);
  });

  it('keeps every value unavailable when no anchor exists anywhere', () => {
    const bars = buildBars(3).map((bar) => ({
      ...bar,
      open: Number.NaN,
      high: Number.NaN,
      low: Number.NaN,
      close: Number.NaN,
      volume: null,
      amount: null,
    }));

    for (const projected of imputeSeries(bars)) {
      expect(projected.ohlc).toEqual({
        raw: null,
        effective: null,
        resolution: 'unavailable',
      });
      expect(projected.volume).toEqual({
        raw: null,
        effective: null,
        resolution: 'unavailable',
      });
      expect(projected.amount).toEqual({
        raw: null,
        effective: null,
        resolution: 'unavailable',
      });
    }
  });

  it('handles a mixed window with leading, middle and trailing gaps', () => {
    const bars = buildBars(5);
    bars[0] = { ...bars[0], open: Number.NaN };
    bars[2] = { ...bars[2], open: Number.NaN };
    bars[4] = { ...bars[4], open: Number.NaN };

    const projected = imputeSeries(bars);

    expect(projected.map((bar) => bar.ohlc.resolution)).toEqual([
      'backfilled',
      'observed',
      'backfilled',
      'observed',
      'forwardFilled',
    ]);
  });

  it('does not treat an incomplete OHLC four-tuple as an anchor', () => {
    const bars = buildBars(2);
    bars[0] = {
      ...bars[0],
      open: Number.NaN,
      high: Number.NaN,
      low: Number.NaN,
      close: Number.NaN,
    };
    bars[1] = { ...bars[1], volume: null, amount: null };

    const projected = imputeSeries(bars);

    expect(projected[0].ohlc.resolution).toBe('backfilled');
    expect(projected[0].ohlc.effective?.close).toBe(bars[1].close);
  });

  it('fails closed on an invalid canonical quantity instead of inventing a value', () => {
    const bars = buildBars(2);
    bars[1] = { ...bars[1], volume: 'not-a-decimal' };

    expect(() => imputeSeries(bars)).toThrow();
  });

  it('judges OHLC and quantity resolutions independently', () => {
    const bars = buildBars(2);
    bars[1] = { ...bars[1], open: Number.NaN, volume: null, amount: null };
    bars[0] = { ...bars[0], volume: null, amount: null };

    const [, second] = imputeSeries(bars);

    // Volume/amount have no anchor at all while OHLC still has one: resolutions differ.
    expect(second.ohlc.resolution).toBe('forwardFilled');
    expect(second.volume.resolution).toBe('unavailable');
    expect(second.amount.resolution).toBe('unavailable');
    expect(second.ohlc.effective?.close).toBe(bars[0].close);
  });

  it('never carries an anchor across trading days (OHLC and quantity)', () => {
    const bars = [
      buildBar(new Date(Date.UTC(2026, 7, 3, 1, 0))),
      {
        ...buildBar(new Date(Date.UTC(2026, 7, 4, 1, 0))),
        open: Number.NaN,
        volume: null,
        amount: null,
      },
    ];

    const [, second] = imputeSeries(bars);

    expect(second.ohlc.resolution).toBe('unavailable');
    expect(second.volume.resolution).toBe('unavailable');
    expect(second.amount.resolution).toBe('unavailable');
  });

  it('is deterministic across repeated calls', () => {
    const bars = buildBars(5);
    bars[0] = { ...bars[0], open: Number.NaN };
    bars[4] = { ...bars[4], open: Number.NaN, volume: null };

    const first = imputeSeries(bars);
    const second = imputeSeries(bars);

    expect(first).toEqual(second);
  });

  it('rejects non-increasing timestamps', () => {
    const bars = buildBars(2);
    bars[1] = { ...bars[1], timestamp: bars[0].timestamp };

    expect(() => imputeSeries(bars)).toThrow(RangeError);
  });

  it('treats a zero volume/amount as an anomaly and back-fills it (leading)', () => {
    const bars = buildBars(3);
    bars[0] = { ...bars[0], volume: '0', amount: '0' };

    const [first] = imputeSeries(bars);

    expect(first.volume).toEqual({
      raw: '0',
      effective: bars[1].volume,
      resolution: 'backfilled',
    });
    expect(first.amount).toEqual({
      raw: '0',
      effective: bars[1].amount,
      resolution: 'backfilled',
    });
  });

  it('treats a zero quantity in the middle as an anomaly, anchored by the later non-zero value', () => {
    const bars = buildBars(3);
    bars[1] = { ...bars[1], volume: '0' };

    const [, middle] = imputeSeries(bars);

    expect(middle.volume.resolution).toBe('backfilled');
    expect(middle.volume.effective).toBe(bars[2].volume);
    expect(bars[1].volume).not.toEqual(bars[2].volume);
  });

  it('forward-fills a trailing zero quantity from the earlier non-zero anchor', () => {
    const bars = buildBars(3);
    bars[2] = { ...bars[2], volume: '0', amount: '0' };

    const projected = imputeSeries(bars);

    expect(projected[2].volume).toEqual({
      raw: '0',
      effective: bars[1].volume,
      resolution: 'forwardFilled',
    });
    expect(projected[2].amount.resolution).toBe('forwardFilled');
  });

  it('keeps quantity unavailable when the whole window is zero', () => {
    const bars = buildBars(3).map((bar) => ({
      ...bar,
      volume: '0', amount: '0',
    }));

    for (const projected of imputeSeries(bars)) {
      expect(projected.volume).toEqual({
        raw: '0',
        effective: null,
        resolution: 'unavailable',
      });
      expect(projected.amount).toEqual({
        raw: '0',
        effective: null,
        resolution: 'unavailable',
      });
    }
  });

  it('judges zero quantity independently of OHLC anchors', () => {
    // OHLC valid but quantity zero: OHLC stays observed, quantity is corrected.
    const bars = buildBars(3);
    bars[1] = { ...bars[1], volume: '0' };

    const [, middle] = imputeSeries(bars);

    expect(middle.ohlc.resolution).toBe('observed');
    expect(middle.volume.resolution).toBe('backfilled');
    expect(middle.volume.effective).toBe(bars[2].volume);
  });

  it('treats a bar with an OHLC value of zero as invalid and imputes the tuple', () => {
    const bars = buildBars(3);
    bars[0] = { ...bars[0], open: 0 };

    const [first] = imputeSeries(bars);

    expect(first.ohlc.resolution).toBe('backfilled');
    expect(first.ohlc.effective).toEqual({
      open: bars[1].open,
      high: bars[1].high,
      low: bars[1].low,
      close: bars[1].close,
    });
  });

  it('keeps OHLC unavailable when the whole window has zero OHLC', () => {
    const bars = buildBars(3).map((bar) => ({
      ...bar,
      open: 0,
      high: 0,
      low: 0,
      close: 0,
    }));

    for (const projected of imputeSeries(bars)) {
      expect(projected.ohlc).toEqual({
        raw: null,
        effective: null,
        resolution: 'unavailable',
      });
    }
  });
});

describe('StrategySeriesImputer', () => {
  it('freezes a hydrated segment and never rewrites it on later appends', () => {
    const imputer = new StrategySeriesImputer();
    const bars = buildBars(3);
    bars[0] = { ...bars[0], open: Number.NaN };
    imputer.hydrate(bars);

    const before = imputer.read();
    imputer.append(buildBar(new Date(Date.UTC(2026, 7, 3, 1, 3))));

    expect(imputer.read().slice(0, 3)).toEqual(before);
  });

  it('forward-fills an appended missing bar from the last determined anchor', () => {
    const imputer = new StrategySeriesImputer();
    imputer.hydrate(buildBars(1));
    const appended = imputer.append({
      ...buildBar(new Date(Date.UTC(2026, 7, 3, 1, 1))),
      volume: null,
      amount: null,
    });

    expect(appended.volume).toEqual({
      raw: null,
      effective: '100',
      resolution: 'forwardFilled',
    });
  });

  it('does not rewrite a trailing-missing hydrated bar when a later bar arrives', () => {
    const imputer = new StrategySeriesImputer();
    const bars = buildBars(2);
    bars[1] = { ...bars[1], open: Number.NaN };
    imputer.hydrate(bars);
    const before = imputer.read()[1];

    imputer.append(buildBar(new Date(Date.UTC(2026, 7, 3, 1, 2))));

    expect(imputer.read()[1]).toEqual(before);
  });

  it('keeps remaining values unchanged when trimming the oldest bar', () => {
    const imputer = new StrategySeriesImputer();
    imputer.hydrate(buildBars(3));
    const before = imputer.read().slice(1);

    imputer.trim();

    expect(imputer.read()).toEqual(before);
  });

  it('resets anchors at a trading-day boundary without cross-day carry', () => {
    const imputer = new StrategySeriesImputer();
    imputer.hydrate([buildBar(new Date(Date.UTC(2026, 7, 3, 1, 0)))]);
    const appended = imputer.append({
      ...buildBar(new Date(Date.UTC(2026, 7, 4, 1, 0))),
      open: Number.NaN,
      volume: null,
      amount: null,
    });

    expect(appended.ohlc.resolution).toBe('unavailable');
    expect(appended.volume.resolution).toBe('unavailable');
  });

  it('does not carry a zero-quantity day into the next trading day (append)', () => {
    const imputer = new StrategySeriesImputer();
    const day1 = Array.from({ length: 2 }, (_, index) =>
      buildBar(new Date(Date.UTC(2026, 7, 3, 1, index)), index),
    );
    day1[1] = { ...day1[1], volume: '0', amount: '0' };
    // hydrate：昨日末 bar 量价 0 → 其 effective 为 forwardFilled(day1[0])，
    // 但量价锚点不跨日（append 跨日重置 lastVolume/lastAmount），今日首 bar
    // 缺失时不得继承 0 也不得继承昨日任何量价 → unavailable（诚实）。
    imputer.hydrate(day1);

    const appended = imputer.append({
      ...buildBar(new Date(Date.UTC(2026, 7, 4, 1, 0))),
      volume: null,
      amount: null,
    });

    expect(appended.volume.effective).toBeNull();
    expect(appended.volume.resolution).toBe('unavailable');
    expect(appended.amount.resolution).toBe('unavailable');
  });

  it('clears all state on reset', () => {
    const imputer = new StrategySeriesImputer();
    imputer.hydrate(buildBars(2));

    imputer.reset();

    expect(imputer.read()).toEqual([]);
    const appended = imputer.append({
      ...buildBar(new Date(Date.UTC(2026, 7, 3, 1, 0))),
      volume: null,
      amount: null,
    });
    expect(appended.volume.resolution).toBe('unavailable');
  });

  it('rejects out-of-order appends', () => {
    const imputer = new StrategySeriesImputer();
    imputer.hydrate(buildBars(1));

    expect(() =>
      imputer.append(buildBar(new Date(Date.UTC(2026, 7, 3, 0, 59)))),
    ).toThrow(RangeError);
  });
});

function buildBars(count: number): StrategyBar[] {
  return Array.from({ length: count }, (_, index) =>
    buildBar(new Date(Date.UTC(2026, 7, 3, 1, index)), index),
  );
}

function buildBar(timestamp: Date, seed = 0): StrategyBar {
  const close = 10.5 + seed;
  return {
    securityId: 1,
    source: 'tdx',
    period: 1,
    timestamp,
    open: close - 0.2,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: String(100 + seed),
    amount: String(200 + seed),
    type: 'complete',
  };
}
