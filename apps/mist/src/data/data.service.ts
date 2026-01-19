import {
  DataType,
  IndexDaily,
  IndexDailyDto,
  IndexData,
  IndexPeriod,
  IndexPeriodDto,
  IndexVo,
} from '@app/shared-data';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';

@Injectable()
export class DataService {
  @InjectRepository(IndexData)
  private indexDataRepository: Repository<IndexData>;

  @InjectRepository(IndexPeriod)
  private indexPeriodRepository: Repository<IndexPeriod>;

  @InjectRepository(IndexDaily)
  private indexDailyRepository: Repository<IndexDaily>;

  async initData() {
    const indexData =
      (await this.indexDataRepository.findOne({
        where: { symbol: '000001' },
      })) || new IndexData();
    indexData.symbol = '000001';
    indexData.type = DataType.LARGE;
    indexData.code = 'sh';
    indexData.name = '上证指数';
    await this.indexDataRepository.save(indexData);

    const indexData2 =
      (await this.indexDataRepository.findOne({
        where: { symbol: '000300' },
      })) || new IndexData();
    indexData2.symbol = '000300';
    indexData2.type = DataType.LARGE;
    indexData2.code = 'sh';
    indexData2.name = '沪深300';
    await this.indexDataRepository.save(indexData2);
  }

  async index() {
    return await this.indexDataRepository.find();
  }

  async findIndexPeriodById(
    indexPeriodDto: IndexPeriodDto,
  ): Promise<IndexVo[]> {
    const foundIndex = await this.indexDataRepository.findOneBy({
      symbol: indexPeriodDto.symbol,
    });
    if (!foundIndex.name) {
      throw new HttpException('查询不到该指数信息', HttpStatus.BAD_REQUEST);
    }
    const foundPeriod = await this.indexPeriodRepository.find({
      relations: ['indexData'],
      where: {
        indexData: {
          id: foundIndex.id,
          symbol: foundIndex.symbol,
        },
        type: indexPeriodDto.period,
        time: Between(indexPeriodDto.startDate, indexPeriodDto.endDate),
      },
      order: {
        time: 'ASC',
      },
    });
    return foundPeriod.map((item) => ({
      symbol: item.indexData.symbol,
      ...item,
    }));
  }

  async findIndexDailyById(indexDailyDto: IndexDailyDto): Promise<IndexVo[]> {
    const foundIndex = await this.indexDataRepository.findOneBy({
      symbol: indexDailyDto.symbol,
    });
    if (!foundIndex.name) {
      throw new HttpException('查询不到该指数信息', HttpStatus.BAD_REQUEST);
    }
    const foundDaily = await this.indexDailyRepository.find({
      relations: ['indexData'],
      where: {
        indexData: {
          id: foundIndex.id,
          symbol: foundIndex.symbol,
        },
        time: Between(indexDailyDto.startDate, indexDailyDto.endDate),
      },
      order: {
        time: 'ASC',
      },
    });
    return foundDaily.map((item) => ({
      symbol: item.indexData.symbol,
      ...item,
    }));
  }
}
