import { Period } from '@app/shared-data';
import { EastMoneyKLineMergeService } from './east-money-kline-merge.service';
import { RawKLineData } from './kline-merge.service';

describe('EastMoneyKLineMergeService', () => {
  let service: EastMoneyKLineMergeService;

  beforeEach(() => {
    service = new EastMoneyKLineMergeService();
  });

  const createMockData = (count: number, baseTime: Date): RawKLineData[] => {
    const data: RawKLineData[] = [];
    for (let i = 0; i < count; i++) {
      const time = new Date(baseTime.getTime() + i * 60 * 1000);
      data.push({
        timestamp: time,
        open: 10 + i * 0.1,
        high: 11 + i * 0.1,
        low: 9 + i * 0.1,
        close: 10.5 + i * 0.1,
        volume: 1000 + i * 100,
        amount: 10000 + i * 1000,
      });
    }
    return data;
  };

  describe('mergeKLineData', () => {
    it('should merge 1min data into 5min period', () => {
      const baseTime = new Date('2026-03-25T09:30:00Z');
      const rawData = createMockData(15, baseTime); // 15 minutes of data

      const merged = service.mergeKLineData(rawData, Period.FIVE_MIN);

      expect(merged).toHaveLength(3); // 15 min / 5 min = 3 candles
      expect(merged[0].timestamp).toEqual(baseTime);
      expect(merged[0].volume).toBeGreaterThan(0);
    });

    it('should merge 1min data into 15min period', () => {
      const baseTime = new Date('2026-03-25T09:30:00Z');
      const rawData = createMockData(30, baseTime); // 30 minutes of data

      const merged = service.mergeKLineData(rawData, Period.FIFTEEN_MIN);

      expect(merged).toHaveLength(2); // 30 min / 15 min = 2 candles
    });

    it('should merge 1min data into 30min period', () => {
      const baseTime = new Date('2026-03-25T09:30:00Z');
      const rawData = createMockData(60, baseTime); // 60 minutes of data

      const merged = service.mergeKLineData(rawData, Period.THIRTY_MIN);

      expect(merged).toHaveLength(2); // 60 min / 30 min = 2 candles
    });

    it('should merge 1min data into 60min period', () => {
      const baseTime = new Date('2026-03-25T09:30:00Z');
      const rawData = createMockData(120, baseTime); // 120 minutes of data

      const merged = service.mergeKLineData(rawData, Period.SIXTY_MIN);

      expect(merged).toHaveLength(2); // 120 min / 60 min = 2 candles
    });

    it('should handle empty data array', () => {
      const merged = service.mergeKLineData([], Period.FIVE_MIN);
      expect(merged).toHaveLength(0);
    });

    it('should handle data that does not align perfectly', () => {
      const baseTime = new Date('2026-03-25T09:32:00Z');
      const rawData = createMockData(13, baseTime); // 13 minutes (not divisible by 5)

      const merged = service.mergeKLineData(rawData, Period.FIVE_MIN);

      expect(merged.length).toBeGreaterThan(0);
      expect(merged.length).toBeLessThanOrEqual(3);
    });

    it('should correctly calculate OHLCV for merged candles', () => {
      const baseTime = new Date('2026-03-25T09:30:00Z');
      const rawData = createMockData(5, baseTime);

      const merged = service.mergeKLineData(rawData, Period.FIVE_MIN);

      expect(merged).toHaveLength(1);
      const candle = merged[0];

      // Open should be first candle's open
      expect(candle.open).toBe(rawData[0].open);

      // Close should be last candle's close
      expect(candle.close).toBe(rawData[4].close);

      // High should be max of all highs
      const expectedHigh = Math.max(...rawData.map((d) => d.high));
      expect(candle.high).toBe(expectedHigh);

      // Low should be min of all lows
      const expectedLow = Math.min(...rawData.map((d) => d.low));
      expect(candle.low).toBe(expectedLow);

      // Volume should be sum of all volumes
      const expectedVolume = rawData.reduce((sum, d) => sum + d.volume, 0);
      expect(candle.volume).toBe(expectedVolume);

      // Amount should be sum of all amounts
      const expectedAmount = rawData.reduce(
        (sum, d) => sum + (d.amount || 0),
        0,
      );
      expect(candle.amount).toBe(expectedAmount);
    });
  });

  describe('buildXMinData', () => {
    it('should build 5min data from 1min data', () => {
      const baseTime = new Date('2026-03-25T09:30:00Z');
      const oneMinData = createMockData(20, baseTime);

      const fiveMinData = service.buildXMinData(oneMinData, 5);

      expect(fiveMinData).toHaveLength(4); // 20 min / 5 min = 4 candles
    });

    it('should build 15min data from 1min data', () => {
      const baseTime = new Date('2026-03-25T09:30:00Z');
      const oneMinData = createMockData(45, baseTime);

      const fifteenMinData = service.buildXMinData(oneMinData, 15);

      expect(fifteenMinData).toHaveLength(3); // 45 min / 15 min = 3 candles
    });

    it('should build 30min data from 1min data', () => {
      const baseTime = new Date('2026-03-25T09:30:00Z');
      const oneMinData = createMockData(60, baseTime);

      const thirtyMinData = service.buildXMinData(oneMinData, 30);

      expect(thirtyMinData).toHaveLength(2); // 60 min / 30 min = 2 candles
    });

    it('should handle partial candles at end', () => {
      const baseTime = new Date('2026-03-25T09:30:00Z');
      const oneMinData = createMockData(17, baseTime); // Not divisible by 5

      const fiveMinData = service.buildXMinData(oneMinData, 5);

      // Should have 3 full candles + 1 partial
      expect(fiveMinData.length).toBeGreaterThan(0);
    });
  });
});
