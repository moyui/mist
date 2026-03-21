import {
  MarketDataBar,
  Security,
  KPeriod,
  SecurityType,
} from '@app/shared-data';
import { ERROR_MESSAGES } from '@app/constants';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';

@Injectable()
export class DataService {
  constructor(
    @InjectRepository(Security)
    private securityRepository: Repository<Security>,
    @InjectRepository(MarketDataBar)
    private marketDataBarRepository: Repository<MarketDataBar>,
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

  async findBarsById(queryDto: any): Promise<MarketDataBar[]> {
    const foundSecurity = await this.securityRepository.findOneBy({
      code: queryDto.symbol,
    });
    if (!foundSecurity) {
      throw new HttpException(
        ERROR_MESSAGES.INDEX_NOT_FOUND,
        HttpStatus.BAD_REQUEST,
      );
    }

    const foundBars = await this.marketDataBarRepository.find({
      relations: ['security'],
      where: {
        security: {
          id: foundSecurity.id,
          code: foundSecurity.code,
        },
        period: queryDto.period as KPeriod,
        timestamp: Between(
          new Date(queryDto.startDate),
          new Date(queryDto.endDate),
        ),
      },
      order: {
        timestamp: 'ASC',
      },
    });
    return foundBars;
  }

  /**
   * @deprecated Legacy method for API compatibility.
   * Maps period numbers to KPeriod enum and calls findBarsById.
   * TODO: Update API clients to use findBarsById directly with KPeriod enum.
   */
  async findIndexPeriodById(queryDto: any): Promise<MarketDataBar[]> {
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

    return this.findBarsById({
      symbol: queryDto.symbol,
      period,
      startDate: queryDto.startDate,
      endDate: queryDto.endDate,
    });
  }

  /**
   * @deprecated Legacy method for API compatibility.
   * Calls findBarsById with KPeriod.DAILY.
   * TODO: Update API clients to use findBarsById directly with KPeriod.DAILY.
   */
  async findIndexDailyById(queryDto: any): Promise<MarketDataBar[]> {
    return this.findBarsById({
      symbol: queryDto.symbol,
      period: KPeriod.DAILY,
      startDate: queryDto.startDate,
      endDate: queryDto.endDate,
    });
  }
}
