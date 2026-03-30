import { Period } from '@app/shared-data';

export interface KCandleBoundary {
  startTime: Date;
  endTime: Date;
}

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
    const sessionStart = this.getSessionStart(triggerTime);
    if (!sessionStart) {
      return null;
    }

    const triggerMinutes =
      triggerTime.getHours() * 60 + triggerTime.getMinutes();
    const sessionStartMinutes =
      sessionStart.getHours() * 60 + sessionStart.getMinutes();
    const periodMinutes = period as number;

    const minutesSinceSessionStart = triggerMinutes - sessionStartMinutes;
    const candleEndOffset =
      Math.floor(minutesSinceSessionStart / periodMinutes) * periodMinutes;

    const endTime = new Date(sessionStart.getTime());
    endTime.setMinutes(endTime.getMinutes() + candleEndOffset);
    endTime.setSeconds(0, 0);

    const startTime = new Date(endTime.getTime());
    startTime.setMinutes(startTime.getMinutes() - periodMinutes);

    return { startTime, endTime };
  }

  /**
   * Calculate daily+ K candle boundaries using natural time boundaries.
   */
  calculateDailyPlusCandle(period: Period, triggerTime: Date): KCandleBoundary {
    const year = triggerTime.getFullYear();
    const month = triggerTime.getMonth();

    switch (period) {
      case Period.DAY: {
        const startTime = new Date(
          year,
          month,
          triggerTime.getDate(),
          0,
          0,
          0,
          0,
        );
        const endTime = new Date(
          year,
          month,
          triggerTime.getDate() + 1,
          0,
          0,
          0,
          0,
        );
        return { startTime, endTime };
      }
      case Period.WEEK: {
        const dayOfWeek = triggerTime.getDay();
        const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(triggerTime);
        monday.setDate(monday.getDate() - daysSinceMonday);
        monday.setHours(0, 0, 0, 0);

        const nextMonday = new Date(monday);
        nextMonday.setDate(nextMonday.getDate() + 7);

        return { startTime: monday, endTime: nextMonday };
      }
      case Period.MONTH: {
        const startTime = new Date(year, month, 1, 0, 0, 0, 0);
        const endTime = new Date(year, month + 1, 1, 0, 0, 0, 0);
        return { startTime, endTime };
      }
      case Period.QUARTER: {
        const quarterStartMonth = Math.floor(month / 3) * 3;
        const startTime = new Date(year, quarterStartMonth, 1, 0, 0, 0, 0);
        const endTime = new Date(year, quarterStartMonth + 3, 1, 0, 0, 0, 0);
        return { startTime, endTime };
      }
      case Period.YEAR: {
        const startTime = new Date(year, 0, 1, 0, 0, 0, 0);
        const endTime = new Date(year + 1, 0, 1, 0, 0, 0, 0);
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
  private getSessionStart(triggerTime: Date): Date | null {
    const hours = triggerTime.getHours();
    const minutes = triggerTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    // Morning session: 9:30 - 11:30 (+ 1min grace for post-session trigger)
    const morningStart = 9 * 60 + 30; // 570
    const morningEnd = 11 * 60 + 31; // 691
    if (totalMinutes >= morningStart && totalMinutes <= morningEnd) {
      return new Date(
        triggerTime.getFullYear(),
        triggerTime.getMonth(),
        triggerTime.getDate(),
        9,
        30,
        0,
        0,
      );
    }

    // Afternoon session: 13:00 - 15:00 (+ 1min grace for post-session trigger)
    const afternoonStart = 13 * 60; // 780
    const afternoonEnd = 15 * 60 + 1; // 901
    if (totalMinutes >= afternoonStart && totalMinutes <= afternoonEnd) {
      return new Date(
        triggerTime.getFullYear(),
        triggerTime.getMonth(),
        triggerTime.getDate(),
        13,
        0,
        0,
        0,
      );
    }

    return null;
  }
}
