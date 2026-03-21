import {
  CronIndexDailyDto,
  CronIndexPeriodDto,
  Security,
  MarketDataBar,
} from '@app/shared-data';
import { TimezoneService } from '@app/timezone';
import { UtilsService } from '@app/utils';
import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

/**
 * @deprecated This service uses old entity architecture (IndexData, IndexPeriod, IndexDaily).
 * It needs to be rewritten to use the new unified schema (Security, MarketDataBar).
 * The cron methods below are stubs to maintain API compatibility during migration.
 *
 * TODO: Rewrite cronIndexPeriod and cronIndexDaily to use Security and MarketDataBar entities.
 * The new architecture should fetch data from AKTools and save to market_data_bars table.
 */
@Injectable()
export class SharedDataService {
  private readonly logger = new Logger();

  constructor(
    private readonly httpService: HttpService,
    private readonly timezoneService: TimezoneService,
    private readonly utilsService: UtilsService,
    @InjectRepository(Security)
    private securityRepository: Repository<Security>,
    @InjectRepository(MarketDataBar)
    private marketDataBarRepository: Repository<MarketDataBar>,
  ) {}

  /**
   * @deprecated Stub method for API compatibility.
   * TODO: Rewrite to use Security and MarketDataBar entities.
   * Should fetch period data from AKTools and save to market_data_bars table.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async cronIndexPeriod(_cronIndexDto: CronIndexPeriodDto): Promise<string> {
    this.logger.warn(
      'cronIndexPeriod is deprecated and needs to be rewritten for the new unified schema',
    );
    throw new NotImplementedException(
      'cronIndexPeriod needs to be rewritten to use Security and MarketDataBar entities. ' +
        'See migration plan in docs/superpowers/plans/2026-03-21-unified-data-schema.md',
    );
  }

  /**
   * @deprecated Stub method for API compatibility.
   * TODO: Rewrite to use Security and MarketDataBar entities.
   * Should fetch daily data from AKTools and save to market_data_bars table with period='daily'.
   */
  /* eslint-disable @typescript-eslint/no-unused-vars */
  async cronIndexDaily(
    _cronIndexDto: CronIndexDailyDto,
    _all: boolean = false,
  ): Promise<string> {
    /* eslint-enable @typescript-eslint/no-unused-vars */
    this.logger.warn(
      'cronIndexDaily is deprecated and needs to be rewritten for the new unified schema',
    );
    throw new NotImplementedException(
      'cronIndexDaily needs to be rewritten to use Security and MarketDataBar entities. ' +
        'See migration plan in docs/superpowers/plans/2026-03-21-unified-data-schema.md',
    );
  }
}
