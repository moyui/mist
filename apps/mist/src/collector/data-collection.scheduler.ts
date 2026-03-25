import { Injectable, Logger } from '@nestjs/common';
import { DataSourceSelectionService } from '@app/utils';
import { Period, Security, DataSource } from '@app/shared-data';
import { IDataCollectionStrategy } from './strategies/data-collection.strategy.interface';
import { CollectorService } from './collector.service';

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

  constructor(
    private readonly collectorService: CollectorService,
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
   * This method iterates through all provided security codes and collects data
   * for each one using the registered strategy. Errors for individual securities
   * are logged but do not stop the collection process for other securities.
   *
   * @param securityCodes - Array of security codes to collect data for
   * @param period - Time period for collection
   */
  async collectForAllSecurities(
    securityCodes: string[],
    period: Period,
  ): Promise<void> {
    const strategy = this.strategies.get(period);

    if (!strategy) {
      this.logger.warn(
        `No strategy registered for period ${period}. Skipping collection.`,
      );
      return;
    }

    this.logger.log(
      `Starting collection for ${securityCodes.length} securities, period ${period}`,
    );

    for (const code of securityCodes) {
      try {
        await this.collectForSecurity(code, period);
      } catch (error) {
        this.logger.error(
          `Failed to collect data for ${code}, period ${period}: ${error.message}`,
          error.stack,
        );
        // Continue with next security even if this one fails
      }
    }

    this.logger.log(
      `Completed collection for ${securityCodes.length} securities, period ${period}`,
    );
  }

  /**
   * Collect K-line data for a single security.
   *
   * This method:
   * 1. Checks if the security exists
   * 2. Validates if the strategy can collect for this security
   * 3. Gets the appropriate data source
   * 4. Determines the time window (from strategy or defaults)
   * 5. Collects and saves the data
   *
   * @param securityCode - Security code to collect data for
   * @param period - Time period for collection
   */
  async collectForSecurity(
    securityCode: string,
    period: Period,
  ): Promise<void> {
    const strategy = this.strategies.get(period);

    if (!strategy) {
      this.logger.warn(
        `No strategy registered for period ${period}. Skipping collection for ${securityCode}.`,
      );
      return;
    }

    // Check if security exists
    const security =
      await this.collectorService.findSecurityByCode(securityCode);

    if (!security) {
      this.logger.warn(
        `Security ${securityCode} not found. Skipping collection.`,
      );
      return;
    }

    // Check if strategy can collect for this security
    if (!strategy.canCollect(securityCode)) {
      this.logger.debug(
        `Strategy cannot collect for ${securityCode}. Skipping.`,
      );
      return;
    }

    // Get data source for this security
    const dataSource = await this.getDataSourceForSecurity(security);

    // Determine time window
    const timeWindowStrategy = strategy.getTimeWindowStrategy();
    let startTime: Date;
    let endTime: Date;

    if (timeWindowStrategy) {
      const window = timeWindowStrategy.calculateCollectionWindow(period);
      startTime = window.startTime;
      endTime = window.endTime;
    } else {
      // Default to last 24 hours
      endTime = new Date();
      startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
    }

    // Collect data
    await this.collectorService.collectKLineForSource(
      securityCode,
      period,
      startTime,
      endTime,
      dataSource,
    );

    this.logger.debug(
      `Successfully collected data for ${securityCode}, period ${period} from ${dataSource}`,
    );
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
  private async getDataSourceForSecurity(
    security: Security,
  ): Promise<DataSource> {
    return this.dataSourceSelectionService.getDataSourceForSecurity(security);
  }
}
