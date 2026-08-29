import type { StrategyBar } from '../strategy-bar';
import { imputeSeries } from './strategy-series-imputer';

// 阈值冻结：0/null/NaN 的锚点与补齐口径 DO NOT CHANGE
// - 0是有可能的：OHLC 0 为有效 observed
// - null/NaN 仅由 Imputer 进入 backfilled/forwardFilled/unavailable
describe('StrategySeriesImputer — 阈值冻结 (0/null/NaN)', () => {
  const base = (
    overrides: Partial<StrategyBar> & { timestamp: Date },
  ): StrategyBar => ({
    securityId: 1,
    source: 'tdx',
    period: 5,
    open: 10,
    high: 10,
    low: 10,
    close: 10,
    volume: '100',
    amount: '100',
    type: 'complete',
    ...overrides,
  });

  it('treats OHLC 0 as valid anchor (observed), not missing', () => {
    const bars: StrategyBar[] = [
      base({
        timestamp: new Date(Date.UTC(2026, 7, 3, 1, 0)),
        open: 0,
        high: 0,
        low: 0,
        close: 0,
      }),
      base({
        timestamp: new Date(Date.UTC(2026, 7, 3, 1, 5)),
        open: 10,
        high: 10,
        low: 10,
        close: 10,
      }),
    ];
    const [first] = imputeSeries(bars);
    expect(first.ohlc.resolution).toBe('observed');
    expect(first.ohlc.effective).toEqual({
      open: 0,
      high: 0,
      low: 0,
      close: 0,
    });
  });

  it('补全 null/NaN 为 backfilled/forwardFilled', () => {
    const bars: StrategyBar[] = [
      base({
        timestamp: new Date(Date.UTC(2026, 7, 3, 1, 0)),
        open: NaN,
        high: NaN,
        low: NaN,
        close: NaN,
        volume: null,
        amount: null,
      }),
      base({ timestamp: new Date(Date.UTC(2026, 7, 3, 1, 5)) }),
      base({
        timestamp: new Date(Date.UTC(2026, 7, 3, 1, 10)),
        open: NaN,
        high: NaN,
        low: NaN,
        close: NaN,
        volume: null,
        amount: null,
      }),
    ];
    const projected = imputeSeries(bars);
    expect(projected[0].ohlc.resolution).toBe('backfilled');
    expect(projected[2].ohlc.resolution).toBe('forwardFilled');
    expect(projected[2].volume.resolution).toBe('forwardFilled');
  });
});
