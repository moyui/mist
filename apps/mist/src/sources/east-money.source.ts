import { Injectable, Logger } from '@nestjs/common';
import {
  ISourceFetcher,
  KFetchParams,
  KData,
} from './source-fetcher.interface';
import { AxiosInstance } from 'axios';
import { UtilsService, PeriodMappingService } from '@app/utils';
import { DataSource, Period } from '@app/shared-data';
import { format } from 'date-fns';

/**
 * 东方财富 - 分钟级K线接口返回结构 (index_zh_a_hist_min_em)
 */
interface SecurityPeriodVo {
  时间: string;
  开盘: number;
  收盘: number;
  最高: number;
  最低: number;
  涨跌幅?: number;
  涨跌额?: number;
  成交量: number;
  成交额: number;
  振幅?: number;
  换手率?: number;
}

/**
 * 东方财富 - 日线K线接口返回结构 (stock_zh_index_daily_em)
 */
interface SecurityDailyVo {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
}

@Injectable()
export class EastMoneySource implements ISourceFetcher {
  private readonly axios: AxiosInstance;
  private readonly logger = new Logger(EastMoneySource.name);

  constructor(
    private readonly utilsService: UtilsService,
    private readonly periodMappingService: PeriodMappingService,
  ) {
    this.axios = this.utilsService.createAxiosInstance({
      baseURL: 'http://127.0.0.1:8080',
      timeout: 30000,
    });
  }

  async fetchK(params: KFetchParams): Promise<KData[]> {
    const { code, formatCode, period, startDate, endDate } = params;

    if (period === Period.DAY) {
      return this.fetchDaily(formatCode, startDate, endDate, period);
    }

    return this.fetchPeriod(code, period, startDate, endDate);
  }

  /**
   * 分钟级K线数据 - 使用 index_zh_a_hist_min_em 接口
   */
  private async fetchPeriod(
    code: string,
    period: Period,
    startDate: Date,
    endDate: Date,
  ): Promise<KData[]> {
    const periodFormat = this.periodMappingService.toSourceFormat(
      period,
      DataSource.EAST_MONEY,
    );

    const response = await this.axios.get<SecurityPeriodVo[]>(
      '/api/public/index_zh_a_hist_min_em',
      {
        params: {
          symbol: code,
          period: periodFormat,
          start_date: format(startDate, 'yyyy-MM-dd HH:mm:ss'),
          end_date: format(endDate, 'yyyy-MM-dd HH:mm:ss'),
        },
      },
    );

    if (!response.data || !Array.isArray(response.data)) {
      this.logger.error(
        `Invalid response from East Money period API: ${JSON.stringify(response.data)}`,
      );
      throw new Error(
        `Invalid response from East Money period API: ${JSON.stringify(response.data)}`,
      );
    }

    return response.data.map(
      (item): KData => ({
        timestamp: new Date(item['时间']),
        open: Number(item['开盘']),
        high: Number(item['最高']),
        low: Number(item['最低']),
        close: Number(item['收盘']),
        volume: Number(item['成交量']),
        amount: item['成交额'] ? Number(item['成交额']) : undefined,
        period,
      }),
    );
  }

  /**
   * 日线K线数据 - 使用 stock_zh_index_daily_em 接口
   */
  private async fetchDaily(
    code: string,
    startDate: Date,
    endDate: Date,
    period: Period,
  ): Promise<KData[]> {
    const response = await this.axios.get<SecurityDailyVo[]>(
      '/api/public/stock_zh_index_daily_em',
      {
        params: {
          symbol: code,
          start_date: format(startDate, 'yyyyMMdd'),
          end_date: format(endDate, 'yyyyMMdd'),
        },
      },
    );

    if (!response.data || !Array.isArray(response.data)) {
      this.logger.error(
        `Invalid response from East Money daily API: ${JSON.stringify(response.data)}`,
      );
      throw new Error(
        `Invalid response from East Money daily API: ${JSON.stringify(response.data)}`,
      );
    }

    return response.data.map(
      (item): KData => ({
        timestamp: new Date(item.date),
        open: Number(item.open),
        high: Number(item.high),
        low: Number(item.low),
        close: Number(item.close),
        volume: Number(item.volume),
        amount: item.amount ? Number(item.amount) : undefined,
        period,
      }),
    );
  }

  isSupportedPeriod(period: Period): boolean {
    return this.periodMappingService.isSupported(period, DataSource.EAST_MONEY);
  }
}
