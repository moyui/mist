import { Period } from '@app/shared-data';
import {
  ITimeWindowStrategy,
  CollectionWindow,
} from './time-window.strategy.interface';

/**
 * East Money (东方财富) time window strategy implementation.
 *
 * East Money provides comprehensive A-share market data with the following characteristics:
 * - Data available during and outside market hours
 * - Real-time updates for intraday periods
 * - Historical data available for all periods
 * - No strict API rate limiting
 *
 * Collection Windows:
 * - 1min: Collect last 2 hours of data (120 records)
 * - 5min: Collect last 2 trading days of data (96 records)
 * - 15min: Collect last 5 trading days of data (80 records)
 * - 30min: Collect last 5 trading days of data (40 records)
 * - 60min: Collect last 10 trading days of data (40 records)
 * - daily: Collect last 30 trading days of data (30 records)
 */
export class EastMoneyTimeWindowStrategy implements ITimeWindowStrategy {
  /**
   * Calculate collection window for a given period.
   *
   * Window duration and recency count are based on period:
   * - Shorter periods need longer windows to ensure data continuity
   * - Longer periods need fewer records but longer time ranges
   */
  calculateCollectionWindow(
    period: Period,
    currentTime: Date = new Date(),
  ): CollectionWindow {
    const windowDuration = this.getWindowDuration(period);
    const ensureRecentCount = this.getEnsureRecentCount(period);

    const startTime = new Date(currentTime.getTime() - windowDuration);

    return {
      startTime,
      endTime: currentTime,
      ensureRecentCount,
    };
  }

  /**
   * Validate if collection window is valid.
   *
   * East Money does not have strict collection time restrictions,
   * so all windows are considered valid.
   */
  isValidCollectionWindow(
    _window?: CollectionWindow,
    _currentTime?: Date,
  ): boolean {
    // East Money allows collection at any time
    return true;
  }

  /**
   * Calculate next collection time based on period.
   *
   * Schedules collection at appropriate intervals:
   * - 1min: Every 1 minute
   * - 5min: At the start of every 5-minute interval (e.g., 09:35, 09:40)
   * - 15min: At the start of every 15-minute interval (e.g., 09:45, 10:00)
   * - 30min: At the start of every 30-minute interval (e.g., 10:00, 10:30)
   * - 60min: At the start of every hour (e.g., 10:00, 11:00)
   * - daily: Once per day at 15:05 (after market close)
   */
  getNextCollectionTime(period: Period, currentTime: Date = new Date()): Date {
    const periodMinutes = this.getPeriodMinutes(period);

    if (period === Period.DAY) {
      // Daily: collect at 15:05 (after market close at 15:00)
      const nextDate = new Date(currentTime);
      nextDate.setHours(15, 5, 0, 0);

      if (nextDate <= currentTime) {
        // Move to next day if 15:05 has passed
        nextDate.setDate(nextDate.getDate() + 1);
      }

      return nextDate;
    }

    // For intraday periods, calculate next interval start
    const currentMinutes =
      currentTime.getHours() * 60 + currentTime.getMinutes();
    const nextIntervalMinutes =
      Math.floor(currentMinutes / periodMinutes) * periodMinutes +
      periodMinutes;

    const nextTime = new Date(currentTime);
    const nextHours = Math.floor(nextIntervalMinutes / 60);
    const nextMinutes = nextIntervalMinutes % 60;

    nextTime.setHours(nextHours, nextMinutes, 0, 0);

    // Handle overflow to next day
    if (nextTime <= currentTime) {
      nextTime.setDate(nextTime.getDate() + 1);
    }

    return nextTime;
  }

  /**
   * Get window duration in milliseconds based on period.
   */
  private getWindowDuration(period: Period): number {
    const durationMap: Record<Period, number> = {
      [Period.ONE_MIN]: 2 * 60 * 60 * 1000, // 2 hours
      [Period.FIVE_MIN]: 2 * 24 * 60 * 60 * 1000, // 2 days
      [Period.FIFTEEN_MIN]: 5 * 24 * 60 * 60 * 1000, // 5 days
      [Period.THIRTY_MIN]: 5 * 24 * 60 * 60 * 1000, // 5 days
      [Period.SIXTY_MIN]: 10 * 24 * 60 * 60 * 1000, // 10 days
      [Period.DAY]: 30 * 24 * 60 * 60 * 1000, // 30 days
      [Period.WEEK]: 52 * 7 * 24 * 60 * 60 * 1000, // 1 year
      [Period.MONTH]: 365 * 24 * 60 * 60 * 1000, // 1 year
      [Period.QUARTER]: 365 * 24 * 60 * 60 * 1000, // 1 year
      [Period.YEAR]: 365 * 24 * 60 * 60 * 1000 * 2, // 2 years
    };

    return durationMap[period] || durationMap[Period.FIVE_MIN];
  }

  /**
   * Get number of recent records to ensure exist based on period.
   */
  private getEnsureRecentCount(period: Period): number {
    const countMap: Record<Period, number> = {
      [Period.ONE_MIN]: 120, // 2 hours of 1-min data
      [Period.FIVE_MIN]: 96, // 2 days of 5-min data (4 hours/day * 12 intervals/hour * 2 days)
      [Period.FIFTEEN_MIN]: 80, // 5 days of 15-min data (4 hours/day * 4 intervals/hour * 5 days)
      [Period.THIRTY_MIN]: 40, // 5 days of 30-min data (4 hours/day * 2 intervals/hour * 5 days)
      [Period.SIXTY_MIN]: 40, // 10 days of 60-min data (4 hours/day * 1 interval/hour * 10 days)
      [Period.DAY]: 30, // 30 days of daily data
      [Period.WEEK]: 52, // 1 year of weekly data
      [Period.MONTH]: 12, // 1 year of monthly data
      [Period.QUARTER]: 4, // 1 year of quarterly data
      [Period.YEAR]: 2, // 2 years of yearly data
    };

    return countMap[period] || countMap[Period.FIVE_MIN];
  }

  /**
   * Get period duration in minutes.
   */
  private getPeriodMinutes(period: Period): number {
    const minutesMap: Record<Period, number> = {
      [Period.ONE_MIN]: 1,
      [Period.FIVE_MIN]: 5,
      [Period.FIFTEEN_MIN]: 15,
      [Period.THIRTY_MIN]: 30,
      [Period.SIXTY_MIN]: 60,
      [Period.DAY]: 1440, // 24 * 60
      [Period.WEEK]: 10080, // 7 * 24 * 60
      [Period.MONTH]: 43200, // 30 * 24 * 60
      [Period.QUARTER]: 129600, // 90 * 24 * 60
      [Period.YEAR]: 525600, // 365 * 24 * 60
    };

    return minutesMap[period] || minutesMap[Period.FIVE_MIN];
  }
}
