import { Injectable, Logger } from '@nestjs/common';
import { Security, Period, DataSource } from '@app/shared-data';
import { CollectorService } from '../collector.service';
import { EastMoneyTimeWindowStrategy } from '../time-window/east-money-time-window.strategy';
import { EastMoneyKLineMergeService } from '../kline-merge/east-money-kline-merge.service';
import {
  IDataCollectionStrategy,
  CollectionMode,
} from './data-collection.strategy.interface';

/**
 * East Money (东方财富) data collection strategy implementation.
 *
 * Features:
 * - Scheduled collection mode (not real-time WebSocket)
 * - Uses East Money HTTP API for data retrieval
 * - Supports all security codes (SH/SZ exchanges)
 * - Integrates with EastMoneyTimeWindowStrategy for time windows
 * - Integrates with EastMoneyKLineMergeService for data merging
 */
@Injectable()
export class EastMoneyCollectionStrategy implements IDataCollectionStrategy {
  readonly source = DataSource.EAST_MONEY;
  readonly mode: CollectionMode = 'polling';

  constructor(
    private readonly collectorService: CollectorService,
    private readonly timeWindowStrategy: EastMoneyTimeWindowStrategy,
    private readonly kLineMergeService: EastMoneyKLineMergeService,
    private readonly logger: Logger,
  ) {}

  /**
   * Collect K-line data for a security.
   *
   * This method:
   * 1. Validates collection window
   * 2. Calculates collection window (what time range to collect)
   * 3. Calls CollectorService with K-line merge post-processing
   *
   * @param security - Security object
   * @param period - Time period for K-line data
   * @param time - Current time (defaults to now)
   */
  async collectForSecurity(
    security: Security,
    period: Period,
    time?: Date,
  ): Promise<void> {
    const currentTime = time || new Date();

    // 1. Calculate collection window
    const window = this.timeWindowStrategy.calculateCollectionWindow(
      period,
      currentTime,
    );

    // 2. Validate collection window (East Money allows collection at any time)
    if (!this.timeWindowStrategy.isValidCollectionWindow()) {
      this.logger.debug(
        `Collection window not valid for ${security.code} ${period} at ${currentTime}`,
      );
      return;
    }

    // 3. Extract start and end times from window
    const startTime = window.startTime;
    const endTime = window.endTime;

    // 3. Collect data with post-processing (K-line merge)
    try {
      await this.collectorService.collectKLineForSource(
        security.code,
        period,
        startTime,
        endTime,
        this.source,
        async (rawData) => {
          // Apply K-line merge to collected data
          const mergedData = this.kLineMergeService.mergeKLineData(
            rawData,
            period,
            Period.ONE_MIN,
          );

          // Save merged data (Note: CollectorService already saves rawData,
          // this callback is for additional processing if needed)
          this.logger.debug(
            `Merged ${rawData.length} records into ${mergedData.length} for ${security.code} ${period}`,
          );
        },
      );

      this.logger.log(
        `Successfully collected ${security.code} ${period} from ${startTime.toISOString()} to ${endTime.toISOString()}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to collect ${security.code} ${period}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
