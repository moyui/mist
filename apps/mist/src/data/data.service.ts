import { MarketDataBar, Security, BarPeriod } from '@app/shared-data';
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
    security.type = 'INDEX';
    security.exchange = 'SH';
    await this.securityRepository.save(security);

    const security2 =
      (await this.securityRepository.findOne({
        where: { code: '000300' },
      })) || new Security();
    security2.code = '000300';
    security2.name = '沪深300';
    security2.type = 'INDEX';
    security2.exchange = 'SH';
    await this.securityRepository.save(security2);
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
        period: queryDto.period as BarPeriod,
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
}
