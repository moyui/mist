import { ERROR_MESSAGES } from '@app/constants';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { K, Security, Period, DataSource } from '@app/shared-data';
import { DataSourceService } from '@app/utils';
import {
  computeMacdSeries,
  computeKdjSeries,
  computeRsiSeries,
  computeAdxSeries,
  computeAtrSeries,
  computeDualMaSeries,
} from '@app/indicators';

// Internal interfaces for indicator calculations
interface RunKDJDto {
  high: number[];
  low: number[];
  close: number[];
  period?: number;
  kSmoothing?: number;
  dSmoothing?: number;
}

interface RunOhlcIndicatorDto {
  high: number[];
  low: number[];
  close: number[];
  period?: number;
}

interface RunDualMADto {
  close: number[];
  shortPeriod?: number;
  longPeriod?: number;
}

interface FindKDataQuery {
  code: string;
  period: Period;
  startDate: Date;
  endDate: Date;
  source?: DataSource;
}

@Injectable()
export class IndicatorService {
  constructor(
    @InjectRepository(Security)
    private securityRepository: Repository<Security>,
    @InjectRepository(K)
    private kRepository: Repository<K>,
    private dataSourceService: DataSourceService,
  ) {}

  async runMACD(prices: number[]): Promise<{
    begIndex: number;
    nbElement: number;
    macd: number[];
    signal: number[];
    histogram: number[];
  }> {
    const { begIndex, macd, signal, histogram } = computeMacdSeries(
      prices.map(Number),
    );

    return {
      begIndex,
      nbElement: macd.length,
      macd,
      signal,
      histogram,
    };
  }

  async runRSI(
    prices: number[],
    period: number = 14,
  ): Promise<{
    begIndex: number;
    nbElement: number;
    rsi: number[];
  }> {
    const { begIndex, rsi } = computeRsiSeries(prices, period);

    return {
      begIndex,
      nbElement: rsi.length,
      rsi,
    };
  }

  async runKDJ(data: RunKDJDto): Promise<{
    begIndex: number;
    nbElement: number;
    K: number[];
    D: number[];
    J: number[];
  }> {
    const { begIndex, K, D, J } = computeKdjSeries(
      data.high,
      data.low,
      data.close,
      {
        period: data.period,
        kSmoothing: data.kSmoothing,
        dSmoothing: data.dSmoothing,
      },
    );

    return {
      begIndex,
      nbElement: K.length,
      K,
      D,
      J,
    };
  }

  async runADX(data: RunOhlcIndicatorDto): Promise<number[]> {
    const { adx } = computeAdxSeries(
      data.high,
      data.low,
      data.close,
      data.period,
    );
    return adx;
  }

  async runDualMA(
    data: RunDualMADto,
  ): Promise<{ shortMA: number[]; longMA: number[] }> {
    const { shortMA, longMA } = computeDualMaSeries(data.close, {
      shortPeriod: data.shortPeriod,
      longPeriod: data.longPeriod,
    });
    return { shortMA, longMA };
  }

  async runATR(data: RunOhlcIndicatorDto): Promise<number[]> {
    const { atr } = computeAtrSeries(
      data.high,
      data.low,
      data.close,
      data.period,
    );
    return atr;
  }

  /**
   * Find K-line data from database with optional data source selection.
   * This method provides read access to K-line data for indicators and Chan Theory.
   *
   * @param query - Query parameters including symbol, period, dates, and optional source
   * @returns Array of K entities
   */
  async findKData(query: FindKDataQuery): Promise<K[]> {
    const foundSecurity = await this.securityRepository.findOneBy({
      code: query.code,
    });
    if (!foundSecurity) {
      throw new HttpException(
        ERROR_MESSAGES.INDEX_NOT_FOUND,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Resolve data source (use provided or fall back to default)
    const source = query.source
      ? this.dataSourceService.select(query.source)
      : this.dataSourceService.getDefault();

    const foundKs = await this.kRepository.find({
      relations: ['security'],
      where: {
        security: {
          id: foundSecurity.id,
          code: foundSecurity.code,
        },
        source,
        period: query.period,
        timestamp: Between(query.startDate, query.endDate),
      },
      order: {
        timestamp: 'ASC',
      },
    });
    return foundKs;
  }
}
