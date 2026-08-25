import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { Period } from '@app/shared-data';
import { ASIA_SHANGHAI_TIMEZONE } from '@app/timezone';

export interface KCandleBoundary {
  startTime: Date;
  endTime: Date;
}

interface MarketDateParts {
  year: number;
  month: number;
  date: number;
  dayOfWeek: number;
}

const MARKET_TIME_ZONE = ASIA_SHANGHAI_TIMEZONE;

/**
 * Pure utility for calculating the previous completed K candle's time boundaries.
 *
 * A-share market sessions:
 * - Morning: 9:30 - 11:30
 * - Afternoon: 13:00 - 15:00
 *
 * K candle boundaries align to session start times, not natural time boundaries.
 * For example, 60min candles are: 9:30-10:30, 10:30-11:30, 13:00-14:00, 14:00-15:00.
 */
export class KBoundaryCalculator {
  /**
   * Calculate the previous completed K candle boundaries for a given period and trigger time.
   */
  calculate(period: Period, triggerTime: Date): KCandleBoundary | null {
    if (period >= Period.DAY) {
      return this.calculateDailyPlusCandle(period, triggerTime);
    }
    return this.calculateMinuteCandle(period, triggerTime);
  }

  /**
   * Calculate minute-level K candle boundaries.
   * Returns null if triggerTime is outside trading sessions.
   */
  calculateMinuteCandle(
    period: Period,
    triggerTime: Date,
  ): KCandleBoundary | null {
    const marketTime = toZonedTime(triggerTime, MARKET_TIME_ZONE);
    const sessionStartMinutes = this.getSessionStartMinutes(marketTime);
    if (sessionStartMinutes === null) {
      return null;
    }

    const triggerMinutes = marketTime.getHours() * 60 + marketTime.getMinutes();
    const periodMinutes = period as number;

    const minutesSinceSessionStart = triggerMinutes - sessionStartMinutes;
    const candleEndOffset =
      Math.floor(minutesSinceSessionStart / periodMinutes) * periodMinutes;

    const marketDate = this.toMarketDateParts(triggerTime);
    const endTime = this.toMarketDateTime(
      marketDate,
      sessionStartMinutes + candleEndOffset,
    );
    const startTime = this.toMarketDateTime(
      marketDate,
      sessionStartMinutes + candleEndOffset - periodMinutes,
    );

    return { startTime, endTime };
  }

  /**
   * Calculate daily+ K candle boundaries using natural time boundaries.
   */
  calculateDailyPlusCandle(period: Period, triggerTime: Date): KCandleBoundary {
    const marketDate = this.toMarketDateParts(triggerTime);

    switch (period) {
      case Period.DAY: {
        const startTime = this.toMarketDateTime(marketDate, 0);
        const endTime = this.toMarketDateTime(
          this.addMarketDays(marketDate, 1),
          0,
        );
        return { startTime, endTime };
      }
      case Period.WEEK: {
        const daysSinceMonday = (marketDate.dayOfWeek + 6) % 7;
        const startDate = this.addMarketDays(marketDate, -daysSinceMonday);
        const startTime = this.toMarketDateTime(startDate, 0);
        const endTime = this.toMarketDateTime(
          this.addMarketDays(startDate, 7),
          0,
        );
        return { startTime, endTime };
      }
      case Period.MONTH: {
        const startDate = this.normalizeMarketDate(
          marketDate.year,
          marketDate.month,
          1,
        );
        const endDate = this.normalizeMarketDate(
          marketDate.year,
          marketDate.month + 1,
          1,
        );
        const startTime = this.toMarketDateTime(startDate, 0);
        const endTime = this.toMarketDateTime(endDate, 0);
        return { startTime, endTime };
      }
      case Period.QUARTER: {
        const startMonth = Math.floor(marketDate.month / 3) * 3;
        const startDate = this.normalizeMarketDate(
          marketDate.year,
          startMonth,
          1,
        );
        const endDate = this.normalizeMarketDate(
          marketDate.year,
          startMonth + 3,
          1,
        );
        const startTime = this.toMarketDateTime(startDate, 0);
        const endTime = this.toMarketDateTime(endDate, 0);
        return { startTime, endTime };
      }
      case Period.HALF_YEAR: {
        const startMonth = marketDate.month < 6 ? 0 : 6;
        const startDate = this.normalizeMarketDate(
          marketDate.year,
          startMonth,
          1,
        );
        const endDate = this.normalizeMarketDate(
          marketDate.year,
          startMonth + 6,
          1,
        );
        const startTime = this.toMarketDateTime(startDate, 0);
        const endTime = this.toMarketDateTime(endDate, 0);
        return { startTime, endTime };
      }
      case Period.YEAR: {
        const startDate = this.normalizeMarketDate(marketDate.year, 0, 1);
        const endDate = this.normalizeMarketDate(marketDate.year + 1, 0, 1);
        const startTime = this.toMarketDateTime(startDate, 0);
        const endTime = this.toMarketDateTime(endDate, 0);
        return { startTime, endTime };
      }
      default:
        throw new Error(`Unsupported period: ${period}`);
    }
  }

  /**
   * Determine which market session the trigger time falls into.
   * Returns the session start time, or null if outside trading sessions.
   */
  private getSessionStartMinutes(triggerTime: Date): number | null {
    const hours = triggerTime.getHours();
    const minutes = triggerTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    // Morning session: 9:30 - 11:30 (+ 1min grace for post-session trigger)
    const morningStart = 9 * 60 + 30; // 570
    const morningEnd = 11 * 60 + 31; // 691
    if (totalMinutes >= morningStart && totalMinutes <= morningEnd) {
      return morningStart;
    }

    // Afternoon session: 13:00 - 15:00 (+ 1min grace for post-session trigger)
    const afternoonStart = 13 * 60; // 780
    const afternoonEnd = 15 * 60 + 1; // 901
    if (totalMinutes >= afternoonStart && totalMinutes <= afternoonEnd) {
      return afternoonStart;
    }

    return null;
  }

  private toMarketDateParts(date: Date): MarketDateParts {
    const marketTime = toZonedTime(date, MARKET_TIME_ZONE);
    return {
      year: marketTime.getFullYear(),
      month: marketTime.getMonth(),
      date: marketTime.getDate(),
      dayOfWeek: marketTime.getDay(),
    };
  }

  private addMarketDays(
    dateParts: MarketDateParts,
    days: number,
  ): MarketDateParts {
    return this.normalizeMarketDate(
      dateParts.year,
      dateParts.month,
      dateParts.date + days,
    );
  }

  private normalizeMarketDate(
    year: number,
    month: number,
    date: number,
  ): MarketDateParts {
    const normalized = new Date(Date.UTC(year, month, date));
    return {
      year: normalized.getUTCFullYear(),
      month: normalized.getUTCMonth(),
      date: normalized.getUTCDate(),
      dayOfWeek: normalized.getUTCDay(),
    };
  }

  private toMarketDateTime(
    dateParts: MarketDateParts,
    totalMinutes: number,
  ): Date {
    const normalizedDate = this.normalizeMarketDate(
      dateParts.year,
      dateParts.month,
      dateParts.date,
    );
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const wallTime = [
      normalizedDate.year.toString().padStart(4, '0'),
      '-',
      (normalizedDate.month + 1).toString().padStart(2, '0'),
      '-',
      normalizedDate.date.toString().padStart(2, '0'),
      'T',
      hours.toString().padStart(2, '0'),
      ':',
      minutes.toString().padStart(2, '0'),
      ':00.000',
    ].join('');

    return fromZonedTime(wallTime, MARKET_TIME_ZONE);
  }
}
