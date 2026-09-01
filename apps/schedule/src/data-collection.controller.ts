import { Controller, Logger, Post } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Period } from '@app/shared-data';
import {
  ASIA_SHANGHAI_TIMEZONE,
  CRON_POST_CLOSE_SYNC_MORNING_0630,
  CRON_POST_CLOSE_SYNC_NIGHTLY_2230,
  CRON_PRE_MARKET_INSPECTION_0905,
  TimezoneService,
} from '@app/timezone';
import { PostCloseSyncService } from '../../mist/src/collector';
import {
  PreMarketInspectionReport,
  PreMarketInspectionService,
} from './pre-market-inspection.service';
import { addDays, getMonth } from 'date-fns';

/**
 * Data Collection Controller with Dual-Window Post-Close Synchronization
 * and 09:05 Pre-Market Automated Health Inspection.
 *
 * 1. Pre-market health inspection at 09:05 (Monday - Friday on A-share trading days)
 *    - 6-dimension comprehensive health & readiness probe before 09:15 reset barrier
 * 2. Nightly primary sync at 22:30 (Monday - Friday on A-share trading days)
 *    - Ingests authoritative DAY, 1m, 5m, 15m, 30m, 60m K-lines
 *    - Automatically appends WEEK on Friday and MONTH on last trading day of month
 * 3. Next-morning fallback retry at 06:30 (Tuesday - Saturday)
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
    private readonly preMarketInspectionService: PreMarketInspectionService,
  ) {}

  /**
   * 盘前主动巡检 HTTP 触发入口（支持运维随时主动巡检并推送到企微）
   */
  @Post('pre-market-inspection')
  async triggerPreMarketInspection(): Promise<PreMarketInspectionReport> {
    const now = this.timezoneService.getCurrentBeijingTime();
    return this.preMarketInspectionService.runInspection(now);
  }

  /**
   * 盘前主动巡检任务：周一至周五 09:05 触发（北京时间）
   */
  @Cron(CRON_PRE_MARKET_INSPECTION_0905, {
    name: 'schedule-pre-market-inspection-0905',
    timeZone: ASIA_SHANGHAI_TIMEZONE,
  })
  async handlePreMarketInspection(): Promise<void> {
    const now = this.timezoneService.getCurrentBeijingTime();
    if (!(await this.timezoneService.isTradingDay(now))) {
      this.logger.debug(
        'Skipping pre-market inspection: not an A-share trading day',
      );
      return;
    }

    try {
      const report = await this.preMarketInspectionService.runInspection(now);
      this.logger.log(
        `[Schedule] event=pre_market_inspection_completed targetDate=${report.targetDate} ` +
          `status=${report.overallStatus} sentToFeishu=${report.sentToFeishu}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[Schedule] event=pre_market_inspection_failed error="${message}"`,
      );
    }
  }

  /**
   * 晚间主同步任务：周一至周五 22:30 触发（北京时间）
   */
  @Cron(CRON_POST_CLOSE_SYNC_NIGHTLY_2230, {
    name: 'schedule-post-close-nightly-2230',
    timeZone: ASIA_SHANGHAI_TIMEZONE,
  })
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
   * 晨间兜底重试任务：周二至周六 06:30 触发（北京时间，针对前一交易日）
   */
  @Cron(CRON_POST_CLOSE_SYNC_MORNING_0630, {
    name: 'schedule-post-close-morning-0630',
    timeZone: ASIA_SHANGHAI_TIMEZONE,
  })
  async handleMorningRetrySync(): Promise<void> {
    const now = this.timezoneService.getCurrentBeijingTime();
    const previousTradingDay =
      await this.timezoneService.resolvePreviousTradingDay(now);
    if (!previousTradingDay) {
      this.logger.warn(
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
}
