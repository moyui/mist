import { Controller, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Period } from '@app/shared-data';
import { TimezoneService } from '@app/timezone';
import { PostCloseSyncService } from '../../mist/src/collector';
import { addDays, getMonth, subDays } from 'date-fns';

/**
 * Data Collection Controller with Dual-Window Post-Close Synchronization.
 *
 * 1. Nightly primary sync at 22:30 (Monday - Friday on A-share trading days)
 *    - Ingests authoritative DAY, 1m, 5m, 15m, 30m, 60m K-lines
 *    - Automatically appends WEEK on Friday and MONTH on last trading day of month
 * 2. Next-morning fallback retry at 06:30 (Tuesday - Saturday)
 *    - Automatically retries sync for previous trading day before 09:15 pre-market lifecycle starts
 *
 * Trading day check uses TimezoneService.isTradingDay() which queries accurate exchange calendars.
 */
@Controller('schedule')
export class DataCollectionController {
  private readonly logger = new Logger(DataCollectionController.name);

  constructor(
    private readonly postCloseSyncService: PostCloseSyncService,
    private readonly timezoneService: TimezoneService,
  ) {}

  /**
   * 晚间主同步任务：周一至周五 22:30 触发
   */
  @Cron('30 22 * * 1-5')
  async handleNightlyPostCloseSync(): Promise<void> {
    const now = this.timezoneService.getCurrentBeijingTime();
    if (!(await this.timezoneService.isTradingDay(now))) {
      this.logger.debug(
        'Skipping nightly post-close sync: not an A-share trading day',
      );
      return;
    }

    const periods: Period[] = [
      Period.DAY,
      Period.ONE_MIN,
      Period.FIVE_MIN,
      Period.FIFTEEN_MIN,
      Period.THIRTY_MIN,
      Period.SIXTY_MIN,
    ];

    // 周五交易日自动追加周线
    if (now.getDay() === 5) {
      periods.push(Period.WEEK);
    }

    // 月末最后一个交易日自动追加月线
    const tomorrow = addDays(now, 1);
    if (getMonth(tomorrow) !== getMonth(now)) {
      periods.push(Period.MONTH);
    }

    try {
      const report = await this.postCloseSyncService.syncPostClose({
        targetDate: now,
        periods,
        window: 'nightly_2230',
      });

      this.logger.log(
        `[Schedule] event=nightly_sync_completed targetDate=${report.targetDate} ` +
          `succeeded=${report.succeededTasks}/${report.totalTasks} ` +
          `saved=${report.totalKLinesSaved} durationMs=${report.durationMs}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[Schedule] event=nightly_sync_failed error="${message}"`,
      );
    }
  }

  /**
   * 晨间兜底重试任务：周二至周六 06:30 触发（针对前一交易日）
   */
  @Cron('30 6 * * 2-6')
  async handleMorningRetrySync(): Promise<void> {
    const now = this.timezoneService.getCurrentBeijingTime();
    const previousTradingDay = await this.resolvePreviousTradingDay(now);

    if (!previousTradingDay) {
      this.logger.debug(
        'Skipping morning retry sync: no previous trading day identified',
      );
      return;
    }

    const periods: Period[] = [
      Period.DAY,
      Period.ONE_MIN,
      Period.FIVE_MIN,
      Period.FIFTEEN_MIN,
      Period.THIRTY_MIN,
      Period.SIXTY_MIN,
    ];

    if (previousTradingDay.getDay() === 5) {
      periods.push(Period.WEEK);
    }

    try {
      const report = await this.postCloseSyncService.syncPostClose({
        targetDate: previousTradingDay,
        periods,
        window: 'morning_0630',
      });

      this.logger.log(
        `[Schedule] event=morning_retry_completed targetDate=${report.targetDate} ` +
          `succeeded=${report.succeededTasks}/${report.totalTasks} ` +
          `saved=${report.totalKLinesSaved} durationMs=${report.durationMs}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[Schedule] event=morning_retry_failed error="${message}"`,
      );
    }
  }

  private async resolvePreviousTradingDay(
    currentDate: Date,
  ): Promise<Date | null> {
    // 往前查找最多 10 天找到最近的一个 A 股交易日
    for (let i = 1; i <= 10; i++) {
      const candidate = subDays(currentDate, i);
      if (await this.timezoneService.isTradingDay(candidate)) {
        return candidate;
      }
    }
    return null;
  }
}
