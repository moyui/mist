import { Injectable } from '@nestjs/common';
import { ISourceFetcher, KLineFetchParams, KLineData } from '../collector';
import { AxiosInstance } from 'axios';
import { UtilsService, PeriodMappingService } from '@app/utils';
import { DataSource, Period } from '@app/shared-data';

@Injectable()
export class EastMoneySource implements ISourceFetcher {
  private readonly axios: AxiosInstance;

  constructor(
    private readonly utilsService: UtilsService,
    private readonly periodMappingService: PeriodMappingService,
  ) {
    this.axios = this.utilsService.createAxiosInstance({
      baseURL: 'http://127.0.0.1:8080',
      timeout: 30000,
    });
  }

  async fetchKLine(params: KLineFetchParams): Promise<KLineData[]> {
    const { code, period, startDate, endDate } = params;

    // Map the period to East Money format
    const periodFormat = this.periodMappingService.toSourceFormat(
      period,
      DataSource.EAST_MONEY,
    );

    // Convert dates to timestamps
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    const response = await this.axios.get('/api/kline', {
      params: {
        code,
        period: periodFormat,
        start: startTimestamp,
        end: endTimestamp,
      },
    });

    if (!response.data || !Array.isArray(response.data)) {
      throw new Error(
        `Invalid response format from East Money API: ${JSON.stringify(response.data)}`,
      );
    }

    return response.data.map((item: any) => ({
      timestamp: new Date(item.timestamp),
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.close),
      volume: Number(item.volume),
      amount: item.amount ? Number(item.amount) : undefined,
      period,
    }));
  }

  isSupportedPeriod(period: Period): boolean {
    return this.periodMappingService.isSupported(period, DataSource.EAST_MONEY);
  }

  getPeriodFormat(period: Period): string {
    return this.periodMappingService.toSourceFormat(
      period,
      DataSource.EAST_MONEY,
    );
  }
}
