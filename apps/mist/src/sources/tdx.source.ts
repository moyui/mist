import { Injectable } from '@nestjs/common';
import { ISourceFetcher, KLineFetchParams, KLineData } from '../data-collector';
import { AxiosInstance } from 'axios';
import { UtilsService } from '@app/utils';
import { PeriodMapping, DataSource, KLinePeriod } from '@app/shared-data';
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

  // Helper function to convert Period enum to KLinePeriod enum
  private periodToKLinePeriod(period: Period): KLinePeriod {
    const mapping: Record<Period, KLinePeriod> = {
      [Period.One]: KLinePeriod.ONE_MIN,
      [Period.FIVE]: KLinePeriod.FIVE_MIN,
      [Period.FIFTEEN]: KLinePeriod.FIFTEEN_MIN,
      [Period.THIRTY]: KLinePeriod.THIRTY_MIN,
      [Period.SIXTY]: KLinePeriod.SIXTY_MIN,
      [Period.DAY]: KLinePeriod.DAILY,
      [Period.WEEK]: KLinePeriod.WEEKLY,
      [Period.MONTH]: KLinePeriod.MONTHLY,
      [Period.QUARTER]: KLinePeriod.QUARTERLY,
      [Period.YEAR]: KLinePeriod.YEARLY,
    };
    return mapping[period];
  }

  async fetchKLine(params: KLineFetchParams): Promise<KLineData[]> {
    const { code, period, startDate, endDate } = params;

    // Map the period to TDX format
    const klinePeriod = this.periodToKLinePeriod(period);
    const periodFormat = PeriodMapping.toSourceFormat(klinePeriod, DataSource.TDX);

    // Convert dates to timestamps
    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000);

    try {
      // TODO: Implement actual TDX API call
      // For now, return empty array to indicate API not yet implemented
      console.warn(`TDX API call not yet implemented for code: ${code}, period: ${periodFormat}`);

      return [];
    } catch (error) {
      throw new Error(`Failed to fetch K-line data from TDX API: ${error.message}`);
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