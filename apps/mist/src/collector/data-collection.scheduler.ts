import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Security, SecurityStatus, Period } from '@app/shared-data';
import { IDataCollectionStrategy } from './strategies/data-collection.strategy.interface';
import { DataSourceSelectionService } from '@app/utils';

/**
 * Data Collection Scheduler.
 *
 * Orchestrates scheduled data collection tasks for multiple securities and periods.
 * Integrates with collection strategies to determine time windows and collection methods.
 *
 * Key Features:
 * - Strategy registration for different time periods
 * - Batch collection for multiple securities
 * - Individual security collection
 * - Data source selection via DataSourceSelectionService
 * - Error handling and logging
 */
@Injectable()
export class DataCollectionScheduler {
  private readonly logger = new Logger(DataCollectionScheduler.name);
  private strategies: Map<Period, IDataCollectionStrategy> = new Map();
  private isTradingDay = false;

  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly dataSourceSelectionService: DataSourceSelectionService,
  ) {}

  /**
   * Register a collection strategy for a specific period.
   *
   * @param period - Time period for this strategy
   * @param strategy - Collection strategy implementation
   */
  registerStrategy(period: Period, strategy: IDataCollectionStrategy): void {
    this.strategies.set(period, strategy);
    this.logger.log(`Registered strategy for period ${period}`);
  }

  /**
   * Collect K-line data for all securities for a given period.
   *
   * This method queries all active securities and collects data for each one
   * using the registered strategy. Errors for individual securities are logged
   * but do not stop the collection process for other securities.
   *
   * @param period - Time period for collection
   * @param time - Current time (defaults to now)
   */
  async collectForAllSecurities(period: Period, time?: Date): Promise<void> {
    if (!this.isTradingDay) {
      this.logger.debug(
        'Not a trading day, skipping collection for period ' + period,
      );
      return;
    }

    const strategy = this.strategies.get(period);

    if (!strategy) {
      this.logger.warn(
        `No strategy registered for period ${period}. Skipping collection.`,
      );
      return;
    }

    // Query all active securities
    const activeSecurities = await this.securityRepository.find({
      where: { status: SecurityStatus.ACTIVE },
    });

    if (activeSecurities.length === 0) {
      this.logger.debug('No active securities found for collection');
      return;
    }

    this.logger.log(
      `Collecting ${period} data for ${activeSecurities.length} active securities`,
    );

    // Collect for each security
    const results = await Promise.allSettled(
      activeSecurities.map((security) =>
        this.collectForSecurity(security, period, time),
      ),
    );

    // Log results
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.log(
      `Collection completed for ${period}: ${succeeded} succeeded, ${failed} failed`,
    );

    if (failed > 0) {
      results
        .filter((r) => r.status === 'rejected')
        .forEach((r) => {
          this.logger.error(
            `Collection failed: ${(r as PromiseRejectedResult).reason.message}`,
          );
        });
    }
  }

  /**
   * Collect K-line data for a single security.
   *
   * This method:
   * 1. Gets the appropriate data source for the security
   * 2. Gets the strategy for the period
   * 3. Delegates collection to the strategy
   *
   * @param security - Security entity
   * @param period - Time period for collection
   * @param time - Current time (defaults to now)
   */
  async collectForSecurity(
    security: Security,
    period: Period,
    time?: Date,
  ): Promise<void> {
    const strategy = this.strategies.get(period);

    if (!strategy) {
      this.logger.warn(
        `No strategy registered for period ${period}. Skipping collection for ${security.code}.`,
      );
      return;
    }

    // Get data source for this security
    const dataSource = await this.getDataSourceForSecurity(security);

    // Verify strategy matches data source
    if (strategy.source !== dataSource) {
      this.logger.warn(
        `Strategy source mismatch: expected ${dataSource}, got ${strategy.source}. Skipping ${security.code}.`,
      );
      return;
    }

    // Only process polling-mode strategies in scheduled collection
    if (strategy.mode !== 'polling') {
      this.logger.debug(
        `Skipping ${security.code}: ${dataSource} uses streaming mode`,
      );
      return;
    }

    // Execute collection via strategy
    await strategy.collectForSecurity(security, period, time);
  }

  /**
   * Update trading day status.
   *
   * @param isTradingDay - Whether today is a trading day
   */
  setIsTradingDay(isTradingDay: boolean): void {
    this.isTradingDay = isTradingDay;
    this.logger.log(`Trading day updated: ${isTradingDay}`);
  }

  /**
   * Get data source for a security using DataSourceSelectionService.
   *
   * This method delegates to the shared DataSourceSelectionService to avoid
   * duplicating data source selection logic.
   *
   * @param security - Security entity
   * @returns Data source to use for this security
   */
  private async getDataSourceForSecurity(security: Security): Promise<string> {
    return this.dataSourceSelectionService.getDataSourceForSecurity(security);
  }

  /**
   * Start all streaming strategies.
   *
   * Iterates through registered strategies and starts any that are in streaming mode.
   */
  async startStreamingStrategies(): Promise<void> {
    const uniqueStrategies = Array.from(
      new Map(
        Array.from(this.strategies.values()).map((strategy) => [
          strategy.source,
          strategy,
        ]),
      ).values(),
    );

    for (const strategy of uniqueStrategies) {
      if (strategy.mode === 'streaming' && strategy.start) {
        try {
          await strategy.start();
          this.logger.log(`Started streaming strategy for ${strategy.source}`);
        } catch (error) {
          this.logger.error(
            `Failed to start streaming strategy for ${strategy.source}: ${error.message}`,
          );
        }
      }
    }
  }

  /**
   * Stop all streaming strategies.
   *
   * Iterates through registered strategies and stops any that are in streaming mode.
   */
  async stopStreamingStrategies(): Promise<void> {
    const uniqueStrategies = Array.from(
      new Map(
        Array.from(this.strategies.values()).map((strategy) => [
          strategy.source,
          strategy,
        ]),
      ).values(),
    );

    for (const strategy of uniqueStrategies) {
      if (strategy.mode === 'streaming' && strategy.stop) {
        try {
          await strategy.stop();
          this.logger.log(`Stopped streaming strategy for ${strategy.source}`);
        } catch (error) {
          this.logger.error(
            `Failed to stop streaming strategy for ${strategy.source}: ${error.message}`,
          );
        }
      }
    }
  }
}
