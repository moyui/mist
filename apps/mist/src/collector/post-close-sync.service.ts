import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Security, SecurityStatus, Period, DataSource } from '@app/shared-data';
import { DataSourceSelectionService } from '@app/utils';
import { TimezoneService } from '@app/timezone';
import { format } from 'date-fns';
import { CollectorService } from './collector.service';
import {
  PostCloseSyncReport,
  SecuritySyncResult,
} from './dto/sync-post-close.dto';

export interface SyncPostCloseOptions {
  targetDate?: Date;
  periods?: Period[];
  securityCodes?: string[];
  sourceOverride?: DataSource;
}

@Injectable()
export class PostCloseSyncService {
  private readonly logger = new Logger(PostCloseSyncService.name);

  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly collectorService: CollectorService,
    private readonly dataSourceSelectionService: DataSourceSelectionService,
    private readonly timezoneService: TimezoneService,
  ) {}

  /**
   * Execute post-close synchronization for specified or all active securities.
   */
  async syncPostClose(
    options: SyncPostCloseOptions = {},
  ): Promise<PostCloseSyncReport> {
    const startTime = Date.now();
    const targetDate =
      options.targetDate ?? this.timezoneService.getCurrentBeijingTime();
    const targetDateString = format(targetDate, 'yyyy-MM-dd');
    const periods = options.periods?.length
      ? options.periods
      : [Period.DAY, Period.ONE_MIN];

    this.logger.log(
      `Starting post-close sync for ${targetDateString}, periods: [${periods.join(
        ', ',
      )}], codes: ${options.securityCodes?.join(',') ?? 'ALL_ACTIVE'}`,
    );

    // 1. Resolve securities
    const securities = await this.resolveSecurities(options.securityCodes);
    if (securities.length === 0) {
      this.logger.warn('No matching securities found for post-close sync');
      return {
        targetDate: targetDateString,
        totalSecurities: 0,
        totalTasks: 0,
        succeededTasks: 0,
        failedTasks: 0,
        totalKLinesSaved: 0,
        durationMs: Date.now() - startTime,
        details: [],
      };
    }

    // 2. Calculate time boundaries for the trading day
    const startDate = this.timezoneService.parseDateString(
      `${targetDateString} 00:00:00`,
    );
    const endDate = this.timezoneService.parseDateString(
      `${targetDateString} 23:59:59`,
    );

    // 3. Construct tasks matrix: Security x Period
    const tasks: Array<{
      security: Security;
      period: Period;
    }> = [];

    for (const security of securities) {
      for (const period of periods) {
        tasks.push({ security, period });
      }
    }

    // 4. Execute all tasks with fault isolation (Promise.allSettled)
    const taskPromises = tasks.map(async ({ security, period }) => {
      return this.syncSingleTask(
        security,
        period,
        startDate,
        endDate,
        options.sourceOverride,
      );
    });

    const settledResults = await Promise.allSettled(taskPromises);

    // 5. Aggregate results
    const details: SecuritySyncResult[] = [];
    let succeededTasks = 0;
    let failedTasks = 0;
    let totalKLinesSaved = 0;

    for (let i = 0; i < settledResults.length; i++) {
      const item = settledResults[i];
      const { security, period } = tasks[i];

      if (item.status === 'fulfilled') {
        details.push(item.value);
        if (item.value.success) {
          succeededTasks++;
          totalKLinesSaved += item.value.count;
        } else {
          failedTasks++;
        }
      } else {
        failedTasks++;
        const errorMsg =
          item.reason instanceof Error
            ? item.reason.message
            : String(item.reason);
        details.push({
          code: security.code,
          period,
          source: options.sourceOverride ?? DataSource.EAST_MONEY,
          success: false,
          count: 0,
          error: errorMsg,
          freshnessVerified: false,
        });
      }
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `Post-close sync completed for ${targetDateString}: ${succeededTasks}/${tasks.length} tasks succeeded, ` +
        `saved ${totalKLinesSaved} K-lines across ${securities.length} securities in ${durationMs}ms`,
    );

    return {
      targetDate: targetDateString,
      totalSecurities: securities.length,
      totalTasks: tasks.length,
      succeededTasks,
      failedTasks,
      totalKLinesSaved,
      durationMs,
      details,
    };
  }

  private async syncSingleTask(
    security: Security,
    period: Period,
    startDate: Date,
    endDate: Date,
    sourceOverride?: DataSource,
  ): Promise<SecuritySyncResult> {
    const source =
      sourceOverride ??
      (await this.dataSourceSelectionService.getDataSourceForSecurity(
        security,
      ));

    try {
      const count = await this.collectorService.collectKForSource(
        security.code,
        period,
        startDate,
        endDate,
        source,
      );

      const freshnessVerified = count > 0;
      if (!freshnessVerified) {
        this.logger.warn(
          `No records returned for ${security.code} ${period} from ${source} on ${format(
            startDate,
            'yyyy-MM-dd',
          )}`,
        );
      }

      return {
        code: security.code,
        period,
        source,
        success: true,
        count,
        freshnessVerified,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to sync ${security.code} (period ${period}) from ${source}: ${errorMsg}`,
      );
      return {
        code: security.code,
        period,
        source,
        success: false,
        count: 0,
        error: errorMsg,
        freshnessVerified: false,
      };
    }
  }

  private async resolveSecurities(codes?: string[]): Promise<Security[]> {
    if (codes && codes.length > 0) {
      return this.securityRepository.find({
        where: { code: In(codes) },
        relations: ['sourceConfigs'],
      });
    }

    return this.securityRepository.find({
      where: { status: SecurityStatus.ACTIVE },
      relations: ['sourceConfigs'],
    });
  }
}
