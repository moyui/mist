import { Period } from '@app/shared-data';
import { EastMoneyCollectionStrategy } from './east-money-collection.strategy';
import { EastMoneyTimeWindowStrategy } from '../time-window/east-money-time-window.strategy';
import { EastMoneyKLineMergeService } from '../kline-merge/east-money-kline-merge.service';
import { CollectionMode } from './data-collection.strategy.interface';

describe('EastMoneyCollectionStrategy', () => {
  let strategy: EastMoneyCollectionStrategy;

  beforeEach(() => {
    strategy = new EastMoneyCollectionStrategy();
  });

  describe('getCollectionMode', () => {
    it('should return SCHEDULED collection mode', () => {
      expect(strategy.getCollectionMode()).toBe(CollectionMode.SCHEDULED);
    });
  });

  describe('getTimeWindowStrategy', () => {
    it('should return EastMoneyTimeWindowStrategy instance', () => {
      const timeWindowStrategy = strategy.getTimeWindowStrategy();
      expect(timeWindowStrategy).toBeInstanceOf(EastMoneyTimeWindowStrategy);
    });
  });

  describe('getKLineMergeService', () => {
    it('should return EastMoneyKLineMergeService instance', () => {
      const mergeService = strategy.getKLineMergeService();
      expect(mergeService).toBeInstanceOf(EastMoneyKLineMergeService);
    });
  });

  describe('canCollect', () => {
    it('should return true for valid SH security codes', () => {
      expect(strategy.canCollect('000001.SH')).toBe(true);
      expect(strategy.canCollect('600000.SH')).toBe(true);
    });

    it('should return true for valid SZ security codes', () => {
      expect(strategy.canCollect('000001.SZ')).toBe(true);
      expect(strategy.canCollect('300001.SZ')).toBe(true);
    });

    it('should return false for invalid security codes', () => {
      expect(strategy.canCollect('INVALID')).toBe(false);
      expect(strategy.canCollect('000001')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(strategy.canCollect('')).toBe(false);
    });
  });

  describe('collect', () => {
    it('should collect data for 5min period', async () => {
      const window = strategy
        .getTimeWindowStrategy()
        .calculateCollectionWindow(
          Period.FIVE_MIN,
          new Date('2026-03-25T09:35:00Z'),
        );

      const result = await strategy.collect(
        '000001.SH',
        Period.FIVE_MIN,
        window,
      );

      expect(result.success).toBe(true);
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(result.source).toBe('ef');
      expect(result.mode).toBe(CollectionMode.SCHEDULED);
    });

    it('should collect data for daily period', async () => {
      const window = strategy
        .getTimeWindowStrategy()
        .calculateCollectionWindow(
          Period.DAY,
          new Date('2026-03-25T15:00:00Z'),
        );

      const result = await strategy.collect('000001.SH', Period.DAY, window);

      expect(result.success).toBe(true);
      expect(result.source).toBe('ef');
    });

    it('should handle collection for invalid security code', async () => {
      const window = strategy
        .getTimeWindowStrategy()
        .calculateCollectionWindow(Period.FIVE_MIN);

      const result = await strategy.collect('INVALID', Period.FIVE_MIN, window);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return empty result for valid security with no data', async () => {
      const window = strategy
        .getTimeWindowStrategy()
        .calculateCollectionWindow(
          Period.FIVE_MIN,
          new Date('2026-03-25T09:35:00Z'),
        );

      const result = await strategy.collect(
        '999999.SH',
        Period.FIVE_MIN,
        window,
      );

      // Should succeed but with no data (security doesn't exist)
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });
  });
});
