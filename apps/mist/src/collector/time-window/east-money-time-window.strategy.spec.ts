import { Period } from '@app/shared-data';
import { EastMoneyTimeWindowStrategy } from './east-money-time-window.strategy';

describe('EastMoneyTimeWindowStrategy', () => {
  let strategy: EastMoneyTimeWindowStrategy;

  beforeEach(() => {
    strategy = new EastMoneyTimeWindowStrategy();
  });

  describe('calculateCollectionWindow', () => {
    it('should calculate window for 1min period', () => {
      const currentTime = new Date('2026-03-25T09:35:00Z');
      const window = strategy.calculateCollectionWindow(
        Period.ONE_MIN,
        currentTime,
      );

      expect(window.endTime).toEqual(currentTime);
      expect(window.startTime.getTime()).toBeLessThan(window.endTime.getTime());
      expect(window.ensureRecentCount).toBeGreaterThan(0);
    });

    it('should calculate window for 5min period', () => {
      const currentTime = new Date('2026-03-25T09:35:00Z');
      const window = strategy.calculateCollectionWindow(
        Period.FIVE_MIN,
        currentTime,
      );

      expect(window.endTime).toEqual(currentTime);
      expect(window.ensureRecentCount).toBeGreaterThan(0);
    });

    it('should calculate window for daily period', () => {
      const currentTime = new Date('2026-03-25T15:00:00Z');
      const window = strategy.calculateCollectionWindow(
        Period.DAY,
        currentTime,
      );

      expect(window.endTime).toEqual(currentTime);
      expect(window.ensureRecentCount).toBeGreaterThan(0);
    });

    it('should use current time when not provided', () => {
      const beforeTime = new Date();
      const window = strategy.calculateCollectionWindow(Period.FIVE_MIN);
      const afterTime = new Date();

      expect(window.endTime.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime(),
      );
      expect(window.endTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('isValidCollectionWindow', () => {
    it('should validate window during market hours', () => {
      const currentTime = new Date('2026-03-25T10:30:00Z');
      strategy.calculateCollectionWindow(Period.FIVE_MIN, currentTime);

      expect(strategy.isValidCollectionWindow()).toBe(true);
    });

    it('should validate window outside market hours', () => {
      const currentTime = new Date('2026-03-25T08:00:00Z'); // Before market open
      strategy.calculateCollectionWindow(Period.FIVE_MIN, currentTime);

      // East Money allows collection outside market hours
      expect(strategy.isValidCollectionWindow()).toBe(true);
    });

    it('should use current time when not provided', () => {
      strategy.calculateCollectionWindow(Period.FIVE_MIN);

      expect(strategy.isValidCollectionWindow()).toBe(true);
    });
  });

  describe('getNextCollectionTime', () => {
    it('should calculate next collection time for 1min period', () => {
      const currentTime = new Date('2026-03-25T09:35:00Z');
      const nextTime = strategy.getNextCollectionTime(
        Period.ONE_MIN,
        currentTime,
      );

      expect(nextTime.getTime()).toBeGreaterThan(currentTime.getTime());
      expect(nextTime.getTime()).toBeLessThanOrEqual(
        currentTime.getTime() + 60 * 1000, // Within 1 minute
      );
    });

    it('should calculate next collection time for 5min period', () => {
      const currentTime = new Date('2026-03-25T09:35:00Z');
      const nextTime = strategy.getNextCollectionTime(
        Period.FIVE_MIN,
        currentTime,
      );

      expect(nextTime.getTime()).toBeGreaterThan(currentTime.getTime());
      expect(nextTime.getTime()).toBeLessThanOrEqual(
        currentTime.getTime() + 5 * 60 * 1000, // Within 5 minutes
      );
    });

    it('should calculate next collection time for daily period', () => {
      const currentTime = new Date('2026-03-25T15:00:00Z');
      const nextTime = strategy.getNextCollectionTime(Period.DAY, currentTime);

      expect(nextTime.getTime()).toBeGreaterThan(currentTime.getTime());
      expect(nextTime.getTime()).toBeLessThanOrEqual(
        currentTime.getTime() + 24 * 60 * 60 * 1000, // Within 1 day
      );
    });

    it('should use current time when not provided', () => {
      const beforeTime = new Date();
      const nextTime = strategy.getNextCollectionTime(Period.FIVE_MIN);
      const afterTime = new Date();

      expect(nextTime.getTime()).toBeGreaterThan(beforeTime.getTime());
      expect(nextTime.getTime()).toBeLessThanOrEqual(
        afterTime.getTime() + 5 * 60 * 1000,
      );
    });
  });
});
