import { Injectable } from '@nestjs/common';
import { ISourceFetcher, KLineFetchParams, KLineData } from '../data-collector';
import { AxiosInstance } from 'axios';
import { UtilsService } from '@app/utils';
import { PeriodMapping, DataSource, BarPeriod } from '@app/shared-data';
import { Period } from '../chan/enums/period.enum';

@Injectable()
export class EastMoneySource implements ISourceFetcher {
  private readonly axios: AxiosInstance;

  constructor(private readonly utilsService: UtilsService) {
    this.axios = this.utilsService.createAxiosInstance({
      baseURL: 'http://127.0.0.1:8080',
      timeout: 30000,
    });
  }

  // Helper function to convert Period enum to BarPeriod enum
  private periodToKLinePeriod(period: Period): BarPeriod {
    const mapping: Record<Period, BarPeriod> = {
      [Period.One]: BarPeriod.ONE_MIN,
      [Period.FIVE]: BarPeriod.FIVE_MIN,
      [Period.FIFTEEN]: BarPeriod.FIFTEEN_MIN,
      [Period.THIRTY]: BarPeriod.THIRTY_MIN,
      [Period.SIXTY]: BarPeriod.SIXTY_MIN,
      [Period.DAY]: BarPeriod.DAILY,
      // Note: BarPeriod only supports up to daily
      [Period.WEEK]: BarPeriod.DAILY,
      [Period.MONTH]: BarPeriod.DAILY,
      [Period.QUARTER]: BarPeriod.DAILY,
      [Period.YEAR]: BarPeriod.DAILY,
    };
    return mapping[period];
  }

  async fetchKLine(params: KLineFetchParams): Promise<KLineData[]> {
    const { code, period, startDate, endDate } = params;

    // Map the period to East Money format
    const klinePeriod = this.periodToKLinePeriod(period);
    const periodFormat = PeriodMapping.toSourceFormat(
      klinePeriod,
      DataSource.EAST_MONEY,
    );

    // Convert dates to timestamps
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    try {
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
    } catch (error) {
      throw new Error(
        `Failed to fetch K-line data from East Money API: ${error.message}`,
      );
    }
  }

  isSupportedPeriod(period: Period): boolean {
    const klinePeriod = this.periodToKLinePeriod(period);
    return PeriodMapping.isSupported(klinePeriod, DataSource.EAST_MONEY);
  }

  getPeriodFormat(period: Period): string {
    const klinePeriod = this.periodToKLinePeriod(period);
    return PeriodMapping.toSourceFormat(klinePeriod, DataSource.EAST_MONEY);
  }
}
