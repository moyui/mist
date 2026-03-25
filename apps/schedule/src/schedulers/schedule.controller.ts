import { Controller, OnModuleInit, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Period } from '@app/shared-data';
import { EastMoneyCollectionStrategy } from '@app/mist';
import { DataCollectionScheduler } from '@app/mist';
import { SecurityService } from '@app/mist';

/**
 * Schedule Controller with Cron Jobs.
 *
 * Manages scheduled data collection tasks using cron expressions.
 * Each period has its own cron job that triggers collection for all active securities.
 *
 * Cron Schedule:
 * - 1min: Every minute
 * - 5min: Every 5 minutes
 * - 15min: Every 15 minutes
 * - 30min: Every 30 minutes
 * - 60min: Every hour
 * - daily: Once per day at 15:05 (after market close)
 */
@Controller('schedule')
export class ScheduleController implements OnModuleInit {
  private readonly logger = new Logger(ScheduleController.name);
  private strategies: Map<Period, EastMoneyCollectionStrategy> = new Map();

  constructor(
    private readonly dataCollectionScheduler: DataCollectionScheduler,
    private readonly securityService: SecurityService,
  ) {}

  /**
   * Initialize module and register collection strategies.
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing Schedule Controller...');

    // Register strategies for each period
    await this.registerStrategies();

    this.logger.log('Schedule Controller initialized successfully');
  }

  /**
   * Register collection strategies for all supported periods.
   */
  private async registerStrategies(): Promise<void> {
    this.logger.log('Registering collection strategies...');

    // Create and register a single strategy for all periods
    // EastMoneyCollectionStrategy can handle all periods
    const strategy = new EastMoneyCollectionStrategy();

    const periods = [
      Period.ONE_MIN,
      Period.FIVE_MIN,
      Period.FIFTEEN_MIN,
      Period.THIRTY_MIN,
      Period.SIXTY_MIN,
      Period.DAY,
    ];

    for (const period of periods) {
      // Register strategy with scheduler for each period
      this.dataCollectionScheduler.registerStrategy(period, strategy);
      this.logger.debug(`Registered strategy for period ${period}`);
    }

    this.logger.log(`Registered strategy for ${periods.length} periods`);
  }

  /**
   * Check if today is a trading day.
   * Excludes weekends and holidays.
   *
   * TODO: Implement actual trading day check
   * - Integrate with holiday calendar
   * - Support half-day trading
   * - Handle market suspension days
   *
   * @returns true if today is a trading day, false otherwise
   */
  private isTradingDay(): boolean {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Simple check: exclude weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }

    // TODO: Add holiday calendar check
    // TODO: Add market suspension check

    return true;
  }

  /**
   * Cron job for 1-minute K-line collection.
   * Runs every minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleOneMinuteCollection(): Promise<void> {
    if (!this.isTradingDay()) {
      this.logger.debug('Skipping 1min collection (non-trading day)');
      return;
    }

    try {
      this.logger.debug('Starting 1min K-line collection...');

      // Get all active securities
      const securityCodes = await this.securityService.getActiveSecurities();

      if (securityCodes.length === 0) {
        this.logger.debug('No active securities found for 1min collection');
        return;
      }

      // Trigger collection for all active securities
      await this.dataCollectionScheduler.collectForAllSecurities(
        securityCodes,
        Period.ONE_MIN,
      );

      this.logger.debug(
        `1min K-line collection completed for ${securityCodes.length} securities`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to collect 1min K-line data: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Cron job for 5-minute K-line collection.
   * Runs every 5 minutes.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleFiveMinuteCollection(): Promise<void> {
    if (!this.isTradingDay()) {
      this.logger.debug('Skipping 5min collection (non-trading day)');
      return;
    }

    try {
      this.logger.debug('Starting 5min K-line collection...');

      const securityCodes = await this.securityService.getActiveSecurities();

      if (securityCodes.length === 0) {
        this.logger.debug('No active securities found for 5min collection');
        return;
      }

      await this.dataCollectionScheduler.collectForAllSecurities(
        securityCodes,
        Period.FIVE_MIN,
      );

      this.logger.debug(
        `5min K-line collection completed for ${securityCodes.length} securities`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to collect 5min K-line data: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Cron job for 15-minute K-line collection.
   * Runs every 15 minutes.
   */
  @Cron(CronExpression.EVERY_15_MINUTES)
  async handleFifteenMinuteCollection(): Promise<void> {
    if (!this.isTradingDay()) {
      this.logger.debug('Skipping 15min collection (non-trading day)');
      return;
    }

    try {
      this.logger.debug('Starting 15min K-line collection...');

      const securityCodes = await this.securityService.getActiveSecurities();

      if (securityCodes.length === 0) {
        this.logger.debug('No active securities found for 15min collection');
        return;
      }

      await this.dataCollectionScheduler.collectForAllSecurities(
        securityCodes,
        Period.FIFTEEN_MIN,
      );

      this.logger.debug(
        `15min K-line collection completed for ${securityCodes.length} securities`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to collect 15min K-line data: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Cron job for 30-minute K-line collection.
   * Runs every 30 minutes.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleThirtyMinuteCollection(): Promise<void> {
    if (!this.isTradingDay()) {
      this.logger.debug('Skipping 30min collection (non-trading day)');
      return;
    }

    try {
      this.logger.debug('Starting 30min K-line collection...');

      const securityCodes = await this.securityService.getActiveSecurities();

      if (securityCodes.length === 0) {
        this.logger.debug('No active securities found for 30min collection');
        return;
      }

      await this.dataCollectionScheduler.collectForAllSecurities(
        securityCodes,
        Period.THIRTY_MIN,
      );

      this.logger.debug(
        `30min K-line collection completed for ${securityCodes.length} securities`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to collect 30min K-line data: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Cron job for 60-minute K-line collection.
   * Runs every hour.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleSixtyMinuteCollection(): Promise<void> {
    if (!this.isTradingDay()) {
      this.logger.debug('Skipping 60min collection (non-trading day)');
      return;
    }

    try {
      this.logger.debug('Starting 60min K-line collection...');

      const securityCodes = await this.securityService.getActiveSecurities();

      if (securityCodes.length === 0) {
        this.logger.debug('No active securities found for 60min collection');
        return;
      }

      await this.dataCollectionScheduler.collectForAllSecurities(
        securityCodes,
        Period.SIXTY_MIN,
      );

      this.logger.debug(
        `60min K-line collection completed for ${securityCodes.length} securities`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to collect 60min K-line data: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Cron job for daily K-line collection.
   * Runs once per day at 15:05 (after market close).
   */
  @Cron('5 15 * * 1-5') // 15:05 on weekdays (Mon-Fri)
  async handleDailyCollection(): Promise<void> {
    if (!this.isTradingDay()) {
      this.logger.debug('Skipping daily collection (non-trading day)');
      return;
    }

    try {
      this.logger.log('Starting daily K-line collection...');

      const securityCodes = await this.securityService.getActiveSecurities();

      if (securityCodes.length === 0) {
        this.logger.debug('No active securities found for daily collection');
        return;
      }

      await this.dataCollectionScheduler.collectForAllSecurities(
        securityCodes,
        Period.DAY,
      );

      this.logger.log(
        `Daily K-line collection completed for ${securityCodes.length} securities`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to collect daily K-line data: ${error.message}`,
        error.stack,
      );
    }
  }
}
