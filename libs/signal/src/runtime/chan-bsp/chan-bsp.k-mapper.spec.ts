import type { ChanK } from '@app/chancore';
import type { ProjectedStrategyBar } from '@app/strategy';
import { toChanKSeries } from './chan-bsp.k-mapper';

function bar(
  time: string,
  overrides: Partial<{
    ohlcEffective: {
      open: number;
      high: number;
      low: number;
      close: number;
    } | null;
    volumeEffective: string | null;
    amountEffective: string | null;
  }> = {},
): ProjectedStrategyBar {
  const ohlc =
    overrides.ohlcEffective === undefined
      ? { open: 10, high: 11, low: 9, close: 10.5 }
      : overrides.ohlcEffective;
  const volume =
    overrides.volumeEffective === undefined ? '100' : overrides.volumeEffective;
  const amount =
    overrides.amountEffective === undefined ? '200' : overrides.amountEffective;
  return {
    rawBar: {
      securityId: 9,
      source: 'tdx',
      period: 30,
      timestamp: new Date(time),
      open: ohlc?.open ?? 0,
      high: ohlc?.high ?? 0,
      low: ohlc?.low ?? 0,
      close: ohlc?.close ?? 0,
      volume,
      amount,
      type: 'complete',
    },
    tradingDay: '2024-08-04',
    ohlc: {
      raw: ohlc,
      effective: ohlc,
      resolution: ohlc === null ? 'unavailable' : 'observed',
    },
    volume: {
      raw: volume,
      effective: volume,
      resolution: volume === null ? 'unavailable' : 'observed',
    },
    amount: {
      raw: amount,
      effective: amount,
      resolution: amount === null ? 'unavailable' : 'observed',
    },
  };
}

describe('toChanKSeries', () => {
  it('maps effective OHLC, identity and quantity into ChanK', () => {
    const window = [
      bar('2024-08-04T01:30:00.000Z'),
      bar('2024-08-04T02:00:00.000Z'),
    ];
    const series: readonly ChanK[] = toChanKSeries(window);

    expect(series).toHaveLength(2);
    expect(series[0]).toEqual(
      expect.objectContaining({
        id: 1,
        symbol: '9',
        time: new Date('2024-08-04T01:30:00.000Z'),
        open: 10,
        high: 11,
        low: 9,
        close: 10.5,
        volume: '100',
        amount: '200',
      }),
    );
    expect(series[1]).toEqual(expect.objectContaining({ id: 2 }));
  });

  it('drops bars whose effective OHLC is unavailable', () => {
    const window = [
      bar('2024-08-04T01:30:00.000Z'),
      bar('2024-08-04T02:00:00.000Z', { ohlcEffective: null }),
      bar('2024-08-04T02:30:00.000Z'),
    ];
    const series = toChanKSeries(window);

    expect(series).toHaveLength(2);
    expect(series.map((k) => k.time)).toEqual([
      new Date('2024-08-04T01:30:00.000Z'),
      new Date('2024-08-04T02:30:00.000Z'),
    ]);
    // dropped bar must not shift the remaining ids out of order
    expect(series[1].id).toBe(3);
  });

  it('passes unavailable quantity through as null without inventing values', () => {
    const window = [
      bar('2024-08-04T01:30:00.000Z', {
        volumeEffective: null,
        amountEffective: null,
      }),
    ];
    const series = toChanKSeries(window);

    expect(series[0].volume).toBeNull();
    expect(series[0].amount).toBeNull();
  });

  it('returns an empty series for an empty window', () => {
    expect(toChanKSeries([])).toEqual([]);
  });
});
