import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Security, SecurityStatus, Period, DataSource } from '@app/shared-data';
import { CollectorService } from '../collector.service';
import {
  IDataCollectionStrategy,
  CollectionMode,
} from './data-collection.strategy.interface';
import { KBoundaryCalculator } from '@app/utils';
import { TimezoneService } from '@app/timezone';

@Injectable()
export class EastMoneyCollectionStrategy implements IDataCollectionStrategy {
  readonly source = DataSource.EAST_MONEY;
  readonly mode: CollectionMode = 'polling';
  private readonly logger = new Logger(EastMoneyCollectionStrategy.name);
  private readonly calculator = new KBoundaryCalculator();

  // Note: Both this class and CollectorService inject Security repository.
  // This is acceptable because TypeORM provides singleton repos within forFeature scope.

  constructor(
    @InjectRepository(Security)
    private readonly securityRepository: Repository<Security>,
    private readonly collectorService: CollectorService,
    private readonly timezoneService: TimezoneService,
  ) {}

  /**
   * Manual collection: collect data for a user-specified time range.
   * Passes startDate/endDate directly to CollectorService.
   */
  async collectForSecurity(
    security: Security,
    period: Period,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    try {
      const count = await this.collectorService.collectKForSource(
        security.code,
        period,
        startDate,
        endDate,
        this.source,
      );
      this.logger.log(
        `Manual collection completed for ${security.code} ${period}: ${count} records`,
      );
      return count;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to collect ${security.code} ${period}: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }

  /**
   * Scheduled collection: collect the previous completed K candle.
   * Uses KBoundaryCalculator to determine the exact candle time boundaries.
   */
  async collectScheduledCandle(
    security: Security,
    period: Period,
    triggerTime?: Date,
  ): Promise<void> {
    const time = triggerTime || this.timezoneService.getCurrentBeijingTime();
    const boundary = this.calculator.calculate(period, time);

    if (!boundary) {
      this.logger.debug(
        `Skipping scheduled collection for ${security.code} ${period} at ${time.toISOString()} (outside trading session)`,
      );
      return;
    }

    try {
      await this.collectorService.collectKForSource(
        security.code,
        period,
        boundary.startTime,
        boundary.endTime,
        this.source,
      );
      this.logger.log(
        `Scheduled collection completed for ${security.code} ${period} from ${boundary.startTime.toISOString()} to ${boundary.endTime.toISOString()}`,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed scheduled collection for ${security.code} ${period}: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }

  /**
   * Batch scheduled collection for all active securities.
   */
  async collectForAllSecurities(
    period: Period,
    triggerTime?: Date,
  ): Promise<void> {
    const activeSecurities = await this.securityRepository.find({
      where: { status: SecurityStatus.ACTIVE },
    });

    if (activeSecurities.length === 0) {
      this.logger.debug('No active securities found for collection');
      return;
    }

    this.logger.log(
      `Scheduled collection for ${period}: ${activeSecurities.length} securities`,
    );

    const results = await Promise.allSettled(
      activeSecurities.map((security) =>
        this.collectScheduledCandle(security, period, triggerTime),
      ),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.logger.log(
      `Scheduled collection completed for ${period}: ${succeeded} succeeded, ${failed} failed`,
    );

    if (failed > 0) {
      results
        .filter((r) => r.status === 'rejected')
        .forEach((r) => {
          this.logger.error(
            `Collection failed: ${(r as PromiseRejectedResult).reason?.message || 'Unknown error'}`,
          );
        });
    }
  }
}
