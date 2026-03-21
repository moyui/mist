import { MarketDataBar, Security } from '@app/shared-data';
import { ERROR_MESSAGES } from '@app/constants';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';

@Injectable()
export class MarketDataService {
  constructor(
    @InjectRepository(Security)
    private securityRepository: Repository<Security>,
    @InjectRepository(MarketDataBar)
    private marketDataBarRepository: Repository<MarketDataBar>,
  ) {}

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

    return await this.marketDataBarRepository.find({
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
  }
}
