import {
  DataType,
  IndexData,
  IndexVo,
  MarketDataBar,
  Security,
} from '@app/shared-data';
import { ERROR_MESSAGES } from '@app/constants';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';

@Injectable()
export class DataService {
  constructor(
    @InjectRepository(IndexData)
    private indexDataRepository: Repository<IndexData>,
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
    security.type = DataType.LARGE;
    security.exchange = 'SH';
    await this.securityRepository.save(security);

    const security2 =
      (await this.securityRepository.findOne({
        where: { code: '000300' },
      })) || new Security();
    security2.code = '000300';
    security2.name = '沪深300';
    security2.type = DataType.LARGE;
    security2.exchange = 'SH';
    await this.securityRepository.save(security2);
  }

  async index() {
    return await this.indexDataRepository.find();
  }

  async findBarsById(queryDto: any): Promise<IndexVo[]> {
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
        period: queryDto.period,
        timestamp: Between(
          new Date(queryDto.startDate),
          new Date(queryDto.endDate),
        ),
      },
      order: {
        timestamp: 'ASC',
      },
    });
    return foundBars.map((item) => ({
      symbol: item.security.code,
      ...item,
    }));
  }

  async findIndexDailyById(indexDailyDto: IndexDailyDto): Promise<IndexVo[]> {
    return this.findBarsById({
      symbol: indexDailyDto.symbol,
      period: 'daily',
      startDate: indexDailyDto.startDate,
      endDate: indexDailyDto.endDate,
    });
  }

  async findIndexPeriodById(indexPeriodDto: any): Promise<IndexVo[]> {
    return this.findBarsById({
      symbol: indexPeriodDto.symbol,
      period: indexPeriodDto.period,
      startDate: indexPeriodDto.startDate,
      endDate: indexPeriodDto.endDate,
    });
  }
}
