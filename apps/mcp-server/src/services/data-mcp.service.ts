import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndexData } from '@app/shared-data';
import { IndexPeriod } from '@app/shared-data';
import { IndexDaily } from '@app/shared-data';

// Zod schemas
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PeriodEnum = z.enum(['ONE', 'FIVE', 'FIFTEEN', 'THIRTY', 'SIXTY']);

@Injectable()
export class DataMcpService {
  constructor(
    @InjectRepository(IndexData)
    private readonly indexDataRepository: Repository<IndexData>,
    @InjectRepository(IndexPeriod)
    private readonly indexPeriodRepository: Repository<IndexPeriod>,
    @InjectRepository(IndexDaily)
    private readonly indexDailyRepository: Repository<IndexDaily>,
  ) {}

  @Tool({
    name: 'get_index_info',
    description: '根据代码获取指数信息',
  })
  async getIndexInfo(symbol: string) {
    const index = await this.indexDataRepository.findOne({
      where: { symbol },
    });

    if (!index) {
      return {
        success: false,
        error: `Index with symbol ${symbol} not found`,
      };
    }

    return {
      success: true,
      data: {
        id: index.id,
        symbol: index.symbol,
        name: index.name,
        type: index.type,
      },
    };
  }

  @Tool({
    name: 'get_kline_data',
    description: '获取K线数据（分时数据）',
  })
  async getKlineData(
    symbol: string,
    period: z.infer<typeof PeriodEnum>,
    limit: number = 100,
    startTime?: string,
    endTime?: string,
  ) {
    const index = await this.indexDataRepository.findOne({ where: { symbol } });
    if (!index) {
      return {
        success: false,
        error: `Index with symbol ${symbol} not found`,
      };
    }

    const queryBuilder = this.indexPeriodRepository
      .createQueryBuilder('ip')
      .where('ip.index_id = :indexId', { indexId: index.id })
      .andWhere('ip.type = :period', { period })
      .orderBy('ip.time', 'DESC')
      .limit(limit);

    if (startTime) {
      queryBuilder.andWhere('ip.time >= :startTime', { startTime });
    }
    if (endTime) {
      queryBuilder.andWhere('ip.time <= :endTime', { endTime });
    }

    const data = await queryBuilder.getMany();

    return {
      success: true,
      data: data.map((item) => ({
        id: item.id,
        time: item.time,
        open: item.open,
        close: item.close,
        highest: item.highest,
        lowest: item.lowest,
        volume: item.volume,
      })),
      count: data.length,
      params: { symbol, period, limit },
    };
  }

  @Tool({
    name: 'get_daily_kline',
    description: '获取日线K线数据',
  })
  async getDailyKline(
    symbol: string,
    limit: number = 100,
    startDate?: string,
    endDate?: string,
  ) {
    const index = await this.indexDataRepository.findOne({ where: { symbol } });
    if (!index) {
      return {
        success: false,
        error: `Index with symbol ${symbol} not found`,
      };
    }

    const queryBuilder = this.indexDailyRepository
      .createQueryBuilder('id')
      .where('id.index_id = :indexId', { indexId: index.id })
      .orderBy('id.time', 'DESC')
      .limit(limit);

    if (startDate) {
      queryBuilder.andWhere('id.time >= :startDate', { startDate });
    }
    if (endDate) {
      queryBuilder.andWhere('id.time <= :endDate', { endDate });
    }

    const data = await queryBuilder.getMany();

    return {
      success: true,
      data: data.map((item) => ({
        id: item.id,
        time: item.time,
        open: item.open,
        close: item.close,
        highest: item.highest,
        lowest: item.lowest,
        volume: item.volume,
        amount: item.amount,
      })),
      count: data.length,
      params: { symbol, limit },
    };
  }

  @Tool({
    name: 'list_indices',
    description: '获取所有可用的指数列表',
  })
  async listIndices() {
    const indices = await this.indexDataRepository.find({
      select: ['id', 'symbol', 'name', 'type'],
    });
    return {
      success: true,
      data: indices,
      count: indices.length,
    };
  }

  @Tool({
    name: 'get_latest_data',
    description: '获取指数的最新数据（所有周期）',
  })
  async getLatestData(symbol: string) {
    const index = await this.indexDataRepository.findOne({ where: { symbol } });
    if (!index) {
      return {
        success: false,
        error: `Index with symbol ${symbol} not found`,
      };
    }

    const periods: ('ONE' | 'FIVE' | 'FIFTEEN' | 'THIRTY' | 'SIXTY')[] = [
      'ONE',
      'FIVE',
      'FIFTEEN',
      'THIRTY',
      'SIXTY',
    ];

    const [dailyData, ...periodData] = await Promise.all([
      this.indexDailyRepository
        .createQueryBuilder('id')
        .where('id.index_id = :indexId', { indexId: index.id })
        .orderBy('id.time', 'DESC')
        .limit(1)
        .getOne(),
      ...periods.map((period) =>
        this.indexPeriodRepository
          .createQueryBuilder('ip')
          .where('ip.index_id = :indexId', { indexId: index.id })
          .andWhere('ip.type = :period', { period })
          .orderBy('ip.time', 'DESC')
          .limit(1)
          .getOne(),
      ),
    ]);

    return {
      success: true,
      data: {
        symbol,
        name: index.name,
        daily: dailyData,
        '1min': periodData[0],
        '5min': periodData[1],
        '15min': periodData[2],
        '30min': periodData[3],
        '60min': periodData[4],
      },
    };
  }
}
