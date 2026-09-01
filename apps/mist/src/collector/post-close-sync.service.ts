import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DataSource, Period, Security, SecurityStatus } from '@app/shared-data';
import { TimezoneService } from '@app/timezone';
import { DataSourceSelectionService } from '@app/utils';
import { CollectorService } from './collector.service';
import { DataFreshnessValidator } from './helpers/data-freshness.validator';
import { PostCloseSyncMetrics } from './observability/post-close-sync-metrics';
import {
  DataFreshnessStatus,
  PostCloseSyncReport,
  SecuritySyncTaskResult,
  SyncPostCloseCriteria,
} from './types/post-close-sync.types';

@Injectable()
export class PostCloseSyncService {
  private readonly logger = new Logger(PostCloseSyncService.name);

  private static readonly DEFAULT_PERIODS: Period[] = [
    Period.DAY,
    Period.ONE_MIN,
    Period.FIVE_MIN,
    Period.THIRTY_MIN,
  ];

  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly collectorService: CollectorService,
    private readonly dataSourceSelectionService: DataSourceSelectionService,
    private readonly timezoneService: TimezoneService,
    private readonly freshnessValidator: DataFreshnessValidator,
    private readonly syncMetrics: PostCloseSyncMetrics,
  ) {}

  /**
   * 执行收盘后权威 K 线数据同步
   */
  async syncPostClose(
    criteria: SyncPostCloseCriteria = {},
  ): Promise<PostCloseSyncReport> {
    const startTime = Date.now();
    const windowName = criteria.window ?? 'manual';

    const targetDate =
      criteria.targetDate ?? this.timezoneService.getCurrentBeijingTime();
    const targetDateStr = this.formatDateString(targetDate);

    const periods = criteria.periods?.length
      ? criteria.periods
      : PostCloseSyncService.DEFAULT_PERIODS;

    const securities = await this.resolveTargetSecurities(
      criteria.securityCodes,
    );

    this.logger.log(
      `[PostCloseSync] event=sync_started targetDate=${targetDateStr} window=${windowName} ` +
        `periods=${periods.join(',')} totalSecurities=${securities.length}`,
    );

    const { startWindow, endWindow } = this.calculateDateWindow(targetDateStr);

    const concurrencyLimit = Math.max(1, criteria.concurrencyLimit ?? 5);
    const taskResults: SecuritySyncTaskResult[] = [];

    // 分批受控并发处理
    for (let i = 0; i < securities.length; i += concurrencyLimit) {
      const batch = securities.slice(i, i + concurrencyLimit);
      const batchPromises = batch.flatMap((security) =>
        periods.map((period) =>
          this.executeSingleSyncTask(
            security,
            period,
            startWindow,
            endWindow,
            targetDateStr,
            criteria.sourceOverride,
          ),
        ),
      );

      const settled = await Promise.allSettled(batchPromises);
      for (const res of settled) {
        if (res.status === 'fulfilled') {
          taskResults.push(res.value);
        } else {
          taskResults.push({
            securityCode: 'UNKNOWN',
            period: Period.DAY,
            source: DataSource.QMT,
            success: false,
            freshnessStatus: DataFreshnessStatus.NOT_LATEST,
            count: 0,
            error:
              res.reason instanceof Error
                ? res.reason.message
                : String(res.reason),
          });
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const succeededTasks = taskResults.filter((t) => t.success).length;
    const notReadyTasks = taskResults.filter(
      (t) =>
        !t.success &&
        !t.error &&
        t.freshnessStatus === DataFreshnessStatus.NOT_LATEST,
    ).length;
    const failedTasks = taskResults.filter(
      (t) => !t.success && Boolean(t.error),
    ).length;
    const totalKLinesSaved = taskResults.reduce((acc, t) => acc + t.count, 0);

    // 记录 OTel 耗时与成功运行
    this.syncMetrics.recordDuration(windowName, durationMs);
    if (failedTasks === 0) {
      this.syncMetrics.recordSuccessfulRun(windowName);
    }

    this.logger.log(
      `[PostCloseSync] event=sync_finished targetDate=${targetDateStr} window=${windowName} ` +
        `totalTasks=${taskResults.length} succeeded=${succeededTasks} notReady=${notReadyTasks} ` +
        `failed=${failedTasks} totalKLines=${totalKLinesSaved} durationMs=${durationMs}`,
    );

    return {
      targetDate: targetDateStr,
      window: windowName,
      totalSecurities: securities.length,
      totalTasks: taskResults.length,
      succeededTasks,
      notReadyTasks,
      failedTasks,
      totalKLinesSaved,
      durationMs,
      details: taskResults,
    };
  }

  private async executeSingleSyncTask(
    security: Security,
    period: Period,
    startWindow: Date,
    endWindow: Date,
    targetDateStr: string,
    sourceOverride?: DataSource,
  ): Promise<SecuritySyncTaskResult> {
    const source =
      sourceOverride ??
      (await this.dataSourceSelectionService.getDataSourceForSecurity(
        security,
      ));

    try {
      // 1. 调用底层 CollectorService 抓取并落库
      const count = await this.collectorService.collectKForSource(
        security.code,
        period,
        startWindow,
        endWindow,
        source,
      );

      // 2. 数据就绪自检（若返回 0 条记录且非停牌，视为数据源未就绪）
      if (count === 0) {
        const validation = this.freshnessValidator.validateFreshness(
          [],
          targetDateStr,
          period,
        );
        this.syncMetrics.recordTask('not_ready', source, period);
        this.logger.warn(
          `[PostCloseSync] event=task_unready securityCode=${security.code} source=${source} ` +
            `period=${period} freshnessStatus=${validation.status} reason="0 bars returned"`,
        );

        return {
          securityCode: security.code,
          period,
          source,
          success: false,
          freshnessStatus: validation.status,
          count: 0,
        };
      }

      this.syncMetrics.recordTask('succeeded', source, period);
      this.syncMetrics.recordKLinesSaved(source, period, count);

      return {
        securityCode: security.code,
        period,
        source,
        success: true,
        freshnessStatus: DataFreshnessStatus.READY,
        count,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.syncMetrics.recordTask('failed', source, period);

      this.logger.error(
        `[PostCloseSync] event=task_failed securityCode=${security.code} source=${source} ` +
          `period=${period} error="${errorMessage}"`,
      );

      return {
        securityCode: security.code,
        period,
        source,
        success: false,
        freshnessStatus: DataFreshnessStatus.NOT_LATEST,
        count: 0,
        error: errorMessage,
      };
    }
  }

  private async resolveTargetSecurities(
    securityCodes?: string[],
  ): Promise<Security[]> {
    if (securityCodes && securityCodes.length > 0) {
      return this.securityRepository.find({
        where: { code: In(securityCodes) },
      });
    }

    return this.securityRepository.find({
      where: { status: SecurityStatus.ACTIVE },
    });
  }

  private calculateDateWindow(targetDateStr: string): {
    startWindow: Date;
    endWindow: Date;
  } {
    const startWindow = this.timezoneService.parseDateString(
      `${targetDateStr} 00:00:00`,
    );
    const endWindow = this.timezoneService.parseDateString(
      `${targetDateStr} 23:59:59`,
    );
    return { startWindow, endWindow };
  }

  private formatDateString(date: Date): string {
    return this.timezoneService.formatDate(date);
  }
}
