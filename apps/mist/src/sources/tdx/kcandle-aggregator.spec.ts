import { KCandleAggregator } from './kcandle-aggregator';
import { Period } from '@app/shared-data';
import { TdxSnapshot } from './types';

describe('KCandleAggregator', () => {
  let aggregator: KCandleAggregator;
  const mockSnapshot = (
    time: string,
    price: number,
    volume: number,
  ): TdxSnapshot => ({
    stockCode: 'SH600519',
    now: price,
    open: 1750,
    high: 1760,
    low: 1740,
    lastClose: 1745,
    volume,
    amount: volume * price,
    timestamp: new Date(`2024-01-02T${time}:00Z`),
  });

  beforeEach(() => {
    aggregator = new KCandleAggregator();
  });

  describe('1-minute aggregation', () => {
    it('should emit completed candle on minute boundary', () => {
      const candles: any[] = [];
      aggregator.on('candle', (candle: any) => candles.push(candle));

      // 9:30:00 - first tick of first candle
      aggregator.process(
        'SH600519',
        Period.ONE_MIN,
        mockSnapshot('09:30', 1750, 100),
      );
      expect(candles.length).toBe(0);

      // 9:30:30 - still same candle
      aggregator.process(
        'SH600519',
        Period.ONE_MIN,
        mockSnapshot('09:30:30', 1755, 50),
      );
      expect(candles.length).toBe(0);

      // 9:31:00 - first tick of next candle, should emit 9:30 candle
      aggregator.process(
        'SH600519',
        Period.ONE_MIN,
        mockSnapshot('09:31', 1760, 80),
      );
      expect(candles.length).toBe(1);
      expect(candles[0].timestamp).toEqual(new Date('2024-01-02T09:30:00Z'));
      expect(candles[0].open).toBe(1750);
      expect(candles[0].high).toBe(1755);
      expect(candles[0].low).toBe(1750);
      expect(candles[0].close).toBe(1755);
      expect(candles[0].volume).toBe(150);
    });

    it('should track OHLC correctly across multiple ticks', () => {
      const candles: any[] = [];
      aggregator.on('candle', (candle: any) => candles.push(candle));

      aggregator.process(
        'SH600519',
        Period.ONE_MIN,
        mockSnapshot('09:30', 1750, 100),
      );
      aggregator.process(
        'SH600519',
        Period.ONE_MIN,
        mockSnapshot('09:30:20', 1745, 50),
      );
      aggregator.process(
        'SH600519',
        Period.ONE_MIN,
        mockSnapshot('09:30:40', 1760, 30),
      );
      aggregator.process(
        'SH600519',
        Period.ONE_MIN,
        mockSnapshot('09:31', 1755, 80),
      );

      expect(candles.length).toBe(1);
      expect(candles[0].open).toBe(1750);
      expect(candles[0].high).toBe(1760);
      expect(candles[0].low).toBe(1745);
      expect(candles[0].close).toBe(1760);
      expect(candles[0].volume).toBe(180);
    });
  });

  describe('5-minute aggregation', () => {
    it('should align to :00, :05, :10 boundaries', () => {
      const candles: any[] = [];
      aggregator.on('candle', (candle: any) => candles.push(candle));

      // 9:30-9:35 candle
      aggregator.process(
        'SH600519',
        Period.FIVE_MIN,
        mockSnapshot('09:30', 1750, 100),
      );
      aggregator.process(
        'SH600519',
        Period.FIVE_MIN,
        mockSnapshot('09:35', 1760, 80),
      );

      expect(candles.length).toBe(1);
      expect(candles[0].timestamp).toEqual(new Date('2024-01-02T09:30:00Z'));

      // 9:35-9:40 candle
      aggregator.process(
        'SH600519',
        Period.FIVE_MIN,
        mockSnapshot('09:40', 1770, 90),
      );

      expect(candles.length).toBe(2);
      expect(candles[1].timestamp).toEqual(new Date('2024-01-02T09:35:00Z'));
    });
  });

  describe('multiple stocks and periods', () => {
    it('should track different stocks independently', () => {
      const candles: any[] = [];
      aggregator.on('candle', (candle: any) => candles.push(candle));

      const mockSh = (time: string) => mockSnapshot(time, 1750, 100);
      const mockSz = (time: string) => ({
        ...mockSnapshot(time, 12.5, 1000),
        stockCode: 'SZ000001',
      });

      aggregator.process('SH600519', Period.ONE_MIN, mockSh('09:30'));
      aggregator.process('SZ000001', Period.ONE_MIN, mockSz('09:30'));
      aggregator.process('SH600519', Period.ONE_MIN, mockSh('09:31'));
      aggregator.process('SZ000001', Period.ONE_MIN, mockSz('09:31'));

      expect(candles.length).toBe(2);
    });
  });
});
