import {
  K,
  Security,
  KPeriod,
  SecurityType,
  DataSource,
} from '@app/shared-data';
import { ERROR_MESSAGES } from '@app/constants';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { DataSourceService } from '@app/utils';

interface FindBarsQuery {
  symbol: string;
  code?: string;
  period: KPeriod;
  startDate: Date;
  endDate: Date;
  source?: DataSource;
}

@Injectable()
export class DataService {
  constructor(
    @InjectRepository(Security)
    private securityRepository: Repository<Security>,
    @InjectRepository(K)
    private kRepository: Repository<K>,
    private dataSourceService: DataSourceService,
  ) {}

  async initData() {
    const security =
      (await this.securityRepository.findOne({
        where: { code: '000001' },
      })) || new Security();
    security.code = '000001';
    security.name = '上证指数';
    security.type = SecurityType.INDEX;
    security.exchange = 'SH';
    await this.securityRepository.save(security);

    const security2 =
      (await this.securityRepository.findOne({
        where: { code: '000300' },
      })) || new Security();
    security2.code = '000300';
    security2.name = '沪深300';
    security2.type = SecurityType.INDEX;
    security2.exchange = 'SH';
    await this.securityRepository.save(security2);
  }

  async index() {
    return await this.securityRepository.find();
  }

  /**
   * Unified method to find K-line bars with optional data source selection.
   * Uses default data source when source is not provided.
   *
   * @param queryDto - Query parameters including symbol, period, dates, and optional source
   * @returns Array of K entities
   */
  async findBars(queryDto: FindBarsQuery): Promise<K[]> {
    const foundSecurity = await this.securityRepository.findOneBy({
      code: queryDto.symbol,
    });
    if (!foundSecurity) {
      throw new HttpException(
        ERROR_MESSAGES.INDEX_NOT_FOUND,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Resolve data source (use provided or fall back to default)
    const source = queryDto.source
      ? this.dataSourceService.select(queryDto.source)
      : this.dataSourceService.getDefault();

    // TODO: In future iterations, use the resolved source to query from appropriate data source
    // For now, source is logged for debugging purposes
    if (queryDto.source) {
      console.debug(
        `Finding bars for symbol ${queryDto.symbol} from source: ${source}`,
      );
    }

    const foundBars = await this.kRepository.find({
      relations: ['security'],
      where: {
        security: {
          id: foundSecurity.id,
          code: foundSecurity.code,
        },
        period: queryDto.period,
        timestamp: Between(queryDto.startDate, queryDto.endDate),
      },
      order: {
        timestamp: 'ASC',
      },
    });
    return foundBars;
  }

  /**
   * @deprecated Legacy method for API compatibility.
   * Use findBars() with explicit period parameter instead.
   * TODO: Update API clients to use findBars() directly.
   */
  async findBarsById(queryDto: any): Promise<K[]> {
    return this.findBars({
      symbol: queryDto.symbol,
      code: queryDto.code,
      period: queryDto.period as KPeriod,
      startDate: new Date(queryDto.startDate),
      endDate: new Date(queryDto.endDate),
    });
  }

  /**
   * @deprecated Legacy method for API compatibility.
   * Maps period numbers to KPeriod enum and calls findBars().
   * TODO: Update API clients to use findBars() directly with KPeriod enum.
   */
  async findIndexPeriodById(queryDto: any): Promise<K[]> {
    // Map legacy period numbers to KPeriod enum
    const periodMapping: Record<number, KPeriod> = {
      1: KPeriod.ONE_MIN,
      5: KPeriod.FIVE_MIN,
      15: KPeriod.FIFTEEN_MIN,
      30: KPeriod.THIRTY_MIN,
      60: KPeriod.SIXTY_MIN,
    };

    const period = periodMapping[queryDto.period];
    if (!period) {
      throw new HttpException(
        `Invalid period: ${queryDto.period}. Supported periods: 1, 5, 15, 30, 60`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.findBars({
      symbol: queryDto.symbol,
      code: queryDto.code,
      period,
      startDate: new Date(queryDto.startDate),
      endDate: new Date(queryDto.endDate),
    });
  }

  /**
   * @deprecated Legacy method for API compatibility.
   * Calls findBars() with KPeriod.DAILY.
   * TODO: Update API clients to use findBars() directly with KPeriod.DAILY.
   */
  async findIndexDailyById(queryDto: any): Promise<K[]> {
    return this.findBars({
      symbol: queryDto.symbol,
      code: queryDto.code,
      period: KPeriod.DAILY,
      startDate: new Date(queryDto.startDate),
      endDate: new Date(queryDto.endDate),
    });
  }
}
