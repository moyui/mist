import { Injectable } from '@nestjs/common';
import { ISourceFetcher, KLineFetchParams, KLineData } from '../data-collector';
import { AxiosInstance } from 'axios';
import { UtilsService } from '@app/utils';
import { PeriodMapping, DataSource, BarPeriod } from '@app/shared-data';
import { Period } from '../chan/enums/period.enum';

@Injectable()
export class TdxSource implements ISourceFetcher {
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

    // Map the period to TDX format
    const klinePeriod = this.periodToKLinePeriod(period);
    const periodFormat = PeriodMapping.toSourceFormat(
      klinePeriod,
      DataSource.TDX,
    );

    // Dates will be used when TDX API is implemented
    void startDate;
    void endDate;

    try {
      // TODO: Implement actual TDX API call
      // For now, return empty array to indicate API not yet implemented
      console.warn(
        `TDX API call not yet implemented for code: ${code}, period: ${periodFormat}`,
      );

      return [];
    } catch (error) {
      throw new Error(
        `Failed to fetch K-line data from TDX API: ${error.message}`,
      );
    }
  }

  isSupportedPeriod(period: Period): boolean {
    const klinePeriod = this.periodToKLinePeriod(period);
    return PeriodMapping.isSupported(klinePeriod, DataSource.TDX);
  }

  getPeriodFormat(period: Period): string {
    const klinePeriod = this.periodToKLinePeriod(period);
    return PeriodMapping.toSourceFormat(klinePeriod, DataSource.TDX);
  }
}
