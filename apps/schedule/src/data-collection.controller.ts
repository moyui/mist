import { Controller, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Period } from '@app/shared-data';
import { EastMoneyCollectionStrategy } from '../../mist/src/collector';

/**
 * Data Collection Controller with Cron Jobs.
 *
 * Cron expressions fire 1 minute after K candle close to ensure the candle is complete.
 * K candle boundaries align to A-share market session start times (9:30, 13:00).
 *
 * Non-market-hour triggers are guarded by KBoundaryCalculator returning null.
 */
@Controller('schedule')
export class DataCollectionController {
  private readonly logger = new Logger(DataCollectionController.name);

  constructor(private readonly strategy: EastMoneyCollectionStrategy) {}

  private isTradingDay(): boolean {
    const dayOfWeek = new Date().getDay();
    return dayOfWeek !== 0 && dayOfWeek !== 6;
  }

  // 1min: fire at :01, :02, ..., :59 every weekday
  @Cron('1-59 * * * 1-5')
  async handleOneMinuteCollection(): Promise<void> {
    if (!this.isTradingDay()) return;
    try {
      await this.strategy.collectForAllSecurities(Period.ONE_MIN);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`1min collection failed: ${message}`);
    }
  }

  // 5min: fire at :01, :06, :11, ... after each 5min candle close
  @Cron('1,6,11,16,21,26,31,36,41,46,51,56 * * * 1-5')
  async handleFiveMinuteCollection(): Promise<void> {
    if (!this.isTradingDay()) return;
    try {
      await this.strategy.collectForAllSecurities(Period.FIVE_MIN);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`5min collection failed: ${message}`);
    }
  }

  // 15min: fire at :01, :16, :31, :46 after each 15min candle close
  @Cron('1,16,31,46 * * * 1-5')
  async handleFifteenMinuteCollection(): Promise<void> {
    if (!this.isTradingDay()) return;
    try {
      await this.strategy.collectForAllSecurities(Period.FIFTEEN_MIN);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`15min collection failed: ${message}`);
    }
  }

  // 30min: fire at :01, :31 after each 30min candle close
  @Cron('1,31 * * * 1-5')
  async handleThirtyMinuteCollection(): Promise<void> {
    if (!this.isTradingDay()) return;
    try {
      await this.strategy.collectForAllSecurities(Period.THIRTY_MIN);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`30min collection failed: ${message}`);
    }
  }

  // 60min: fire at :31 after each 60min candle close (9:30→10:31, 10:30→11:31, 13:00→14:31, 14:00→15:31)
  @Cron('31 * * * 1-5')
  async handleSixtyMinuteCollection(): Promise<void> {
    if (!this.isTradingDay()) return;
    try {
      await this.strategy.collectForAllSecurities(Period.SIXTY_MIN);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`60min collection failed: ${message}`);
    }
  }

  // daily: 18:00 weekdays, post-market
  @Cron('0 18 * * 1-5')
  async handleDailyCollection(): Promise<void> {
    if (!this.isTradingDay()) return;
    try {
      await this.strategy.collectForAllSecurities(Period.DAY);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Daily collection failed: ${message}`);
    }
  }

  // weekly: Friday 18:00
  @Cron('0 18 * * 5')
  async handleWeeklyCollection(): Promise<void> {
    if (!this.isTradingDay()) return;
    try {
      await this.strategy.collectForAllSecurities(Period.WEEK);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Weekly collection failed: ${message}`);
    }
  }

  // monthly: 18:00 on days 28-31 with last-trading-day-of-month check
  @Cron('0 18 28-31 * *')
  async handleMonthlyCollection(): Promise<void> {
    if (!this.isTradingDay()) return;
    // Only run on the last trading day of the month
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getMonth() === now.getMonth()) return; // not last day yet
    try {
      await this.strategy.collectForAllSecurities(Period.MONTH);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Monthly collection failed: ${message}`);
    }
  }
}
