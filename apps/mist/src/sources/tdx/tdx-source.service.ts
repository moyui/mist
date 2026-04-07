import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { PeriodMappingService } from '@app/utils';
import {
  DataSource,
  Period,
  K,
  KExtensionTdx,
  Security,
} from '@app/shared-data';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import { format } from 'date-fns';
import { ITdxSourceFetcher } from './tdx-source.interface';
import { TdxResponse, TdxSnapshot, TdxExtension } from './types';

@Injectable()
export class TdxSource implements ITdxSourceFetcher {
  private readonly axios: AxiosInstance;
  private readonly logger = new Logger(TdxSource.name);
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly periodMappingService: PeriodMappingService,
    private readonly typeOrmDataSource: TypeOrmDataSource,
  ) {
    this.baseUrl =
      this.configService.get<string>('TDX_BASE_URL') || 'http://127.0.0.1:9001';
    this.axios = this.createAxiosInstance();
  }

  async fetchK(params: {
    code: string;
    formatCode: string;
    period: Period;
    startDate: Date;
    endDate: Date;
  }): Promise<TdxResponse[]> {
    const { formatCode, period, startDate, endDate } = params;

    const periodFormat = this.periodMappingService.toSourceFormat(
      period,
      DataSource.TDX,
    );
    if (!periodFormat) {
      throw new HttpException(
        `Period ${period} not supported by TDX`,
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const response = await this.axios.get<{
        success: boolean;
        data: {
          [field: string]: {
            [stockCode: string]: (string | number)[];
          };
        };
      }>('/api/tdx/market-data', {
        params: {
          stocks: formatCode,
          period: periodFormat,
          start_time: format(startDate, 'yyyyMMdd'),
          end_time: format(endDate, 'yyyyMMdd'),
          dividend_type: 'none',
        },
      });

      if (!response.data?.success || !response.data?.data) {
        throw new HttpException(
          'Invalid response from TDX API',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return this.parseMarketDataResponse(response.data.data, formatCode);
    } catch (error) {
      this.logger.error(`TDX fetchK error: ${error.message}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to fetch TDX data: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async fetchSnapshot(stockCode: string): Promise<TdxSnapshot> {
    try {
      const response = await this.axios.get<{
        success: boolean;
        data: {
          stock_code: string;
          snapshot: any;
        };
      }>('/api/tdx/market-snapshot', {
        params: { stock_code: stockCode },
      });

      if (!response.data?.success || !response.data?.data) {
        throw new HttpException(
          'Invalid response from TDX snapshot API',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return this.parseSnapshot(response.data.data.snapshot, stockCode);
    } catch (error) {
      this.logger.error(`TDX fetchSnapshot error: ${error.message}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to fetch TDX snapshot: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async fetchDividFactors(
    stockCode: string,
    startDate: Date,
    endDate: Date,
  ): Promise<
    { timestamp: Date; forwardFactor: number; backwardFactor: number }[]
  > {
    try {
      const response = await this.axios.get<{
        success: boolean;
        data: {
          date: string[];
          forward_factor: number[];
          backward_factor: number[];
        };
      }>('/api/tdx/divid-factors', {
        params: {
          stock_code: stockCode,
          start_time: format(startDate, 'yyyyMMdd'),
          end_time: format(endDate, 'yyyyMMdd'),
        },
      });

      if (!response.data?.success || !response.data?.data) {
        return [];
      }

      const { date, forward_factor, backward_factor } = response.data.data;
      return date.map((d, i) => ({
        timestamp: new Date(d),
        forwardFactor: forward_factor[i],
        backwardFactor: backward_factor[i],
      }));
    } catch (error) {
      this.logger.error(`TDX fetchDividFactors error: ${error.message}`);
      return [];
    }
  }

  async saveK(
    data: TdxResponse[],
    security: Security,
    period: Period,
  ): Promise<void> {
    if (data.length === 0) return;

    await this.typeOrmDataSource.transaction(async (manager) => {
      const sourceConfig = security.sourceConfigs?.find(
        (sc) => sc.source === DataSource.TDX,
      );
      const formatCode = sourceConfig?.formatCode || security.code;

      const kEntities = data.map((d) =>
        manager.create(K, {
          security,
          source: DataSource.TDX,
          period,
          timestamp: d.timestamp,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: BigInt(Math.round(d.volume)),
          amount: d.amount || 0,
        }),
      );

      try {
        const savedKs = await manager.save(K, kEntities);

        const extensions = savedKs.map((k, i) => {
          const ext: Partial<TdxExtension> = {
            fullCode: formatCode,
          };
          if (data[i].forwardFactor !== undefined) {
            ext.forwardFactor = data[i].forwardFactor;
          }
          return manager.create(KExtensionTdx, {
            k,
            fullCode: ext.fullCode || '',
            forwardFactor: ext.forwardFactor ?? 0,
            backwardFactor: 0,
            volumeRatio: 0,
            turnoverRate: 0,
            turnoverAmount: 0,
            totalMarketValue: 0,
            floatMarketValue: 0,
            earningsPerShare: 0,
            priceEarningsRatio: 0,
            priceToBookRatio: 0,
          });
        });

        await manager.save(KExtensionTdx, extensions);
      } catch (error: any) {
        if (
          error.code === 'ER_DUP_ENTRY' ||
          error.message?.includes('Duplicate')
        ) {
          this.logger.warn('Duplicate K-line entry, skipping');
          return;
        }
        throw error;
      }
    });
  }

  isSupportedPeriod(period: Period): boolean {
    return this.periodMappingService.isSupported(period, DataSource.TDX);
  }

  /**
   * Parse mist-datasource market-data response into TdxResponse[]
   * Input format: {Date: {SH600519: [...]}, Time: {SH600519: [...]}, ...}
   */
  private parseMarketDataResponse(
    data: { [field: string]: { [stockCode: string]: (string | number)[] } },
    stockCode: string,
  ): TdxResponse[] {
    const dates = data.Date?.[stockCode] || [];
    const times = data.Time?.[stockCode] || [];
    const opens = data.Open?.[stockCode] || [];
    const highs = data.High?.[stockCode] || [];
    const lows = data.Low?.[stockCode] || [];
    const closes = data.Close?.[stockCode] || [];
    const volumes = data.Volume?.[stockCode] || [];
    const amounts = data.Amount?.[stockCode] || [];
    const forwardFactors = data.ForwardFactor?.[stockCode] || [];

    const length = dates.length;
    const result: TdxResponse[] = [];

    for (let i = 0; i < length; i++) {
      const dateStr = dates[i] as string;
      const timeStr = times[i] as string;

      // Parse timestamp: date (yyyyMMdd) + time (HHmmss)
      const timestamp = new Date(
        `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T` +
          `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}Z`,
      );

      result.push({
        timestamp,
        open: Number(opens[i]),
        high: Number(highs[i]),
        low: Number(lows[i]),
        close: Number(closes[i]),
        volume: Number(volumes[i]),
        amount: Number(amounts[i]),
        forwardFactor:
          forwardFactors[i] !== undefined
            ? Number(forwardFactors[i])
            : undefined,
      });
    }

    return result;
  }

  /**
   * Parse mist-datasource snapshot response
   */
  private parseSnapshot(data: any, stockCode: string): TdxSnapshot {
    return {
      stockCode,
      now: Number(data.Now),
      open: Number(data.Open),
      high: Number(data.Max),
      low: Number(data.Min),
      lastClose: Number(data.LastClose),
      volume: Number(data.Volume),
      amount: Number(data.Amount),
      timestamp: new Date(),
    };
  }

  /**
   * Create axios instance
   */
  private createAxiosInstance(): AxiosInstance {
    return axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
