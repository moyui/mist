import { Controller, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Period } from '@app/shared-data';
import { PostCloseSyncService } from '../../mist/src/collector';
import { TimezoneService } from '@app/timezone';
import { addDays, getDay, getMonth } from 'date-fns';

/**
 * Data Collection Controller with Cron Jobs.
 *
 * Nightly post-close synchronization fires at 22:30 on weekdays to ensure
 * all provider local downloads (e.g. QMT starting at 17:00) and market
 * clearing settlements are completely finished.
 *
 * Trading day check uses TimezoneService.isTradingDay() which queries SZSE API
 * for accurate trading calendar (includes holidays, not just weekends).
 */
@Controller('schedule')
export class DataCollectionController {
  private readonly logger = new Logger(DataCollectionController.name);

  constructor(
    private readonly postCloseSyncService: PostCloseSyncService,
    private readonly timezoneService: TimezoneService,
  ) {}

  /**
   * Nightly post-close sync: 22:30 every weekday (Monday - Friday).
   *
   * Ingests authoritative Day and 1-minute K-lines for all active securities.
   * On Friday, automatically appends Week period sync.
   * On the last trading day of the month, automatically appends Month period sync.
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

    const periods = [Period.DAY, Period.ONE_MIN];

    // Friday: append weekly period
    if (getDay(now) === 5) {
      periods.push(Period.WEEK);
    }

    // Last trading day of the month: append monthly period
    const tomorrow = addDays(now, 1);
    if (getMonth(tomorrow) !== getMonth(now)) {
      periods.push(Period.MONTH);
    }

    this.logger.log(
      `Triggering nightly post-close sync at 22:30 for periods: [${periods.join(', ')}]`,
    );

    try {
      const report = await this.postCloseSyncService.syncPostClose({
        targetDate: now,
        periods,
      });

      this.logger.log(
        `Nightly post-close sync finished: ${report.succeededTasks}/${report.totalTasks} tasks succeeded, ` +
          `${report.totalKLinesSaved} K-lines saved in ${report.durationMs}ms`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Nightly post-close sync failed: ${message}`);
    }
  }
}
