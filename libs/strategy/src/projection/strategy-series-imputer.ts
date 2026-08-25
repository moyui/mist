import { Decimal8 } from '@app/decimal';
import { ASIA_SHANGHAI_TIMEZONE } from '@app/timezone';
import type { StrategyBar } from '../market-data/strategy-bar';

export type StrategyImputationResolution =
  | 'observed'
  | 'forwardFilled'
  | 'backfilled'
  | 'unavailable';

export type StrategyOhlcTuple = {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
};

/**
 * Evaluation-only OHLC projection. `raw` carries the original four-tuple only when all
 * four values are finite (an incomplete bar exposes `raw: null`); `effective` carries the
 * determined value used by consumers: the raw tuple for an anchor, an imputed copy for a
 * filled gap, or null when no anchor exists in the evaluation window.
 */
export interface ProjectedStrategyOhlc {
  readonly raw: StrategyOhlcTuple | null;
  readonly effective: StrategyOhlcTuple | null;
  readonly resolution: StrategyImputationResolution;
}

export interface ProjectedStrategyQuantity {
  readonly raw: string | null;
  readonly effective: string | null;
  readonly resolution: StrategyImputationResolution;
}

export interface ProjectedStrategyBar {
  readonly rawBar: StrategyBar;
  readonly tradingDay: string;
  readonly ohlc: ProjectedStrategyOhlc;
  readonly volume: ProjectedStrategyQuantity;
  readonly amount: ProjectedStrategyQuantity;
}

const SHANGHAI_TRADING_DAY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: ASIA_SHANGHAI_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Deterministic evaluation-only OHLCVA imputation over one ordered bar sequence
 * (the current evaluation window). Raw bars and persistence remain untouched.
 *
 * Rules (user-decided contract):
 * - OHLC and quantity fields share one directional rule, judged independently;
 * - a missing value with a later anchor in the same trading day is back-filled from the
 *   nearest later anchor (`backfilled`); a trailing missing value is forward-filled from
 *   the nearest earlier anchor (`forwardFilled`); with no anchor anywhere it stays
 *   `unavailable` — nothing is invented;
 * - an OHLC anchor requires all four values finite and non-zero; a quantity anchor
 *   requires a valid non-zero canonical decimal string (invalid raw fails closed,
 *   never silently zero-filled; a valid zero is an anomaly and is corrected like null);
 * - imputation never crosses trading days (both OHLC and quantity).
 */
export function imputeSeries(
  bars: readonly StrategyBar[],
): readonly ProjectedStrategyBar[] {
  assertStrictlyIncreasing(bars);
  const projected: ProjectedStrategyBar[] = [];
  let dayStart = 0;
  while (dayStart < bars.length) {
    const tradingDay = toShanghaiTradingDay(bars[dayStart].timestamp);
    let dayEnd = dayStart + 1;
    while (
      dayEnd < bars.length &&
      toShanghaiTradingDay(bars[dayEnd].timestamp) === tradingDay
    ) {
      dayEnd += 1;
    }
    imputeDay(bars, dayStart, dayEnd, tradingDay, projected);
    dayStart = dayEnd;
  }
  return projected;
}

/**
 * Incremental imputation with monotonic, immutable effective values: a hydrated segment
 * is imputed bidirectionally once and frozen; an appended bar is only forward-filled from
 * the segment's last anchor and then frozen; a trim drops the oldest bar without
 * recomputing the rest. Trading-day boundaries reset the anchors (no cross-day carry).
 */
export class StrategySeriesImputer {
  private bars: ProjectedStrategyBar[] = [];
  private lastTradingDay: string | null = null;
  private lastOhlc: StrategyOhlcTuple | null = null;
  private lastVolume: string | null = null;
  private lastAmount: string | null = null;

  hydrate(bars: readonly StrategyBar[]): void {
    if (bars.length === 0) {
      this.reset();
      return;
    }
    this.bars = [...imputeSeries(bars)];
    this.lastTradingDay = this.bars[this.bars.length - 1].tradingDay;
    this.lastOhlc = null;
    this.lastVolume = null;
    this.lastAmount = null;
    // The segment's last anchors (within the last trading day only) become the
    // forward-fill source for the first appended bar.
    for (let i = this.bars.length - 1; i >= 0; i -= 1) {
      const projected = this.bars[i];
      if (projected.tradingDay !== this.lastTradingDay) break;
      if (this.lastOhlc === null) this.lastOhlc = projected.ohlc.effective;
      if (this.lastVolume === null)
        this.lastVolume = projected.volume.effective;
      if (this.lastAmount === null)
        this.lastAmount = projected.amount.effective;
      if (
        this.lastOhlc !== null &&
        this.lastVolume !== null &&
        this.lastAmount !== null
      ) {
        break;
      }
    }
  }

  append(bar: StrategyBar): ProjectedStrategyBar {
    const timestampMs = bar.timestamp.getTime();
    if (!Number.isFinite(timestampMs)) {
      throw new TypeError('series imputation requires a finite timestamp');
    }
    const last = this.bars.at(-1);
    if (last && timestampMs <= last.rawBar.timestamp.getTime()) {
      throw new RangeError(
        'series imputation requires strictly increasing bars per market group',
      );
    }
    const tradingDay = toShanghaiTradingDay(bar.timestamp);
    if (tradingDay !== this.lastTradingDay) {
      this.lastTradingDay = tradingDay;
      this.lastOhlc = null;
      this.lastVolume = null;
      this.lastAmount = null;
    }
    const ohlc = projectOhlcAppend(bar, this.lastOhlc);
    const volume = projectQuantityAppend(bar.volume, this.lastVolume);
    const amount = projectQuantityAppend(bar.amount, this.lastAmount);
    if (ohlc.effective !== null) this.lastOhlc = ohlc.effective;
    if (volume.effective !== null) this.lastVolume = volume.effective;
    if (amount.effective !== null) this.lastAmount = amount.effective;
    const projected = Object.freeze({
      rawBar: bar,
      tradingDay,
      ohlc,
      volume,
      amount,
    });
    this.bars.push(projected);
    return projected;
  }

  trim(): void {
    if (this.bars.length > 0) this.bars.shift();
  }

  read(): readonly ProjectedStrategyBar[] {
    return Object.freeze([...this.bars]);
  }

  reset(): void {
    this.bars = [];
    this.lastTradingDay = null;
    this.lastOhlc = null;
    this.lastVolume = null;
    this.lastAmount = null;
  }
}

function imputeDay(
  bars: readonly StrategyBar[],
  start: number,
  end: number,
  tradingDay: string,
  out: ProjectedStrategyBar[],
): void {
  const count = end - start;
  const ohlcAnchors = new Array<boolean>(count);
  const volumeAnchors = new Array<boolean>(count);
  const amountAnchors = new Array<boolean>(count);
  for (let offset = 0; offset < count; offset += 1) {
    const bar = bars[start + offset];
    ohlcAnchors[offset] = isOhlcAnchor(bar);
    volumeAnchors[offset] = isQuantityAnchor(bar.volume);
    amountAnchors[offset] = isQuantityAnchor(bar.amount);
  }
  for (let offset = 0; offset < count; offset += 1) {
    const bar = bars[start + offset];
    out.push(
      Object.freeze({
        rawBar: bar,
        tradingDay,
        ohlc: imputeOhlc(bars, start, ohlcAnchors, offset),
        volume: imputeQuantity(
          bars,
          start,
          'volume',
          bar.volume,
          volumeAnchors,
          offset,
        ),
        amount: imputeQuantity(
          bars,
          start,
          'amount',
          bar.amount,
          amountAnchors,
          offset,
        ),
      }),
    );
  }
}

function imputeOhlc(
  bars: readonly StrategyBar[],
  start: number,
  anchors: readonly boolean[],
  offset: number,
): ProjectedStrategyOhlc {
  const bar = bars[start + offset];
  const raw = isOhlcAnchor(bar)
    ? freezeTuple(bar.open, bar.high, bar.low, bar.close)
    : null;
  if (anchors[offset]) {
    return Object.freeze({ raw, effective: raw, resolution: 'observed' });
  }
  const later = nearestAnchor(anchors, offset, 1);
  if (later !== null) {
    const anchor = bars[start + later];
    return Object.freeze({
      raw: null,
      effective: freezeTuple(
        anchor.open,
        anchor.high,
        anchor.low,
        anchor.close,
      ),
      resolution: 'backfilled',
    });
  }
  const earlier = nearestAnchor(anchors, offset, -1);
  if (earlier !== null) {
    const anchor = bars[start + earlier];
    return Object.freeze({
      raw: null,
      effective: freezeTuple(
        anchor.open,
        anchor.high,
        anchor.low,
        anchor.close,
      ),
      resolution: 'forwardFilled',
    });
  }
  return Object.freeze({
    raw: null,
    effective: null,
    resolution: 'unavailable',
  });
}

function imputeQuantity(
  bars: readonly StrategyBar[],
  start: number,
  field: 'volume' | 'amount',
  raw: string | null,
  anchors: readonly boolean[],
  offset: number,
): ProjectedStrategyQuantity {
  if (anchors[offset]) {
    return Object.freeze({ raw, effective: raw, resolution: 'observed' });
  }
  const later = nearestAnchor(anchors, offset, 1);
  if (later !== null) {
    return Object.freeze({
      raw,
      effective: bars[start + later][field],
      resolution: 'backfilled',
    });
  }
  const earlier = nearestAnchor(anchors, offset, -1);
  if (earlier !== null) {
    return Object.freeze({
      raw,
      effective: bars[start + earlier][field],
      resolution: 'forwardFilled',
    });
  }
  return Object.freeze({ raw, effective: null, resolution: 'unavailable' });
}

function projectOhlcAppend(
  bar: StrategyBar,
  lastAnchor: StrategyOhlcTuple | null,
): ProjectedStrategyOhlc {
  const raw = isOhlcAnchor(bar)
    ? freezeTuple(bar.open, bar.high, bar.low, bar.close)
    : null;
  if (raw !== null) {
    return Object.freeze({ raw, effective: raw, resolution: 'observed' });
  }
  if (lastAnchor !== null) {
    return Object.freeze({
      raw: null,
      effective: lastAnchor,
      resolution: 'forwardFilled',
    });
  }
  return Object.freeze({
    raw: null,
    effective: null,
    resolution: 'unavailable',
  });
}

function projectQuantityAppend(
  raw: string | null,
  lastAnchor: string | null,
): ProjectedStrategyQuantity {
  if (raw !== null) {
    Decimal8.parseCanonical(raw);
    return Object.freeze({ raw, effective: raw, resolution: 'observed' });
  }
  if (lastAnchor !== null) {
    return Object.freeze({
      raw,
      effective: lastAnchor,
      resolution: 'forwardFilled',
    });
  }
  return Object.freeze({ raw, effective: null, resolution: 'unavailable' });
}

function nearestAnchor(
  anchors: readonly boolean[],
  offset: number,
  direction: 1 | -1,
): number | null {
  for (
    let cursor = offset + direction;
    cursor >= 0 && cursor < anchors.length;
    cursor += direction
  ) {
    if (anchors[cursor]) return cursor;
  }
  return null;
}

function isOhlcAnchor(bar: StrategyBar): boolean {
  return (
    Number.isFinite(bar.open) &&
    bar.open !== 0 &&
    Number.isFinite(bar.high) &&
    bar.high !== 0 &&
    Number.isFinite(bar.low) &&
    bar.low !== 0 &&
    Number.isFinite(bar.close) &&
    bar.close !== 0
  );
}

function isQuantityAnchor(raw: string | null): boolean {
  if (raw === null) return false;
  // Fail closed: an invalid canonical string is a data error, not a missing value;
  // a valid zero is an anomaly (suspension/placeholder bars) and NOT an anchor —
  // zero and null share the correction path (user-decided contract, 2026-08-21).
  const parsed = Decimal8.parseCanonical(raw);
  return parsed.compare(Decimal8.ZERO) !== 0;
}

function freezeTuple(
  open: number,
  high: number,
  low: number,
  close: number,
): StrategyOhlcTuple {
  return Object.freeze({ open, high, low, close });
}

function assertStrictlyIncreasing(bars: readonly StrategyBar[]): void {
  let previous = Number.NEGATIVE_INFINITY;
  for (const bar of bars) {
    const timestampMs = bar.timestamp.getTime();
    if (!Number.isFinite(timestampMs) || timestampMs <= previous) {
      throw new RangeError(
        'series imputation requires finite strictly increasing timestamps',
      );
    }
    previous = timestampMs;
  }
}

export function toShanghaiTradingDay(timestamp: Date): string {
  const parts = SHANGHAI_TRADING_DAY_FORMATTER.formatToParts(timestamp);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new TypeError('could not resolve Shanghai trading day');
  }
  return `${year}-${month}-${day}`;
}
