import { Injectable } from '@nestjs/common';
import { ISourceFetcher, KLineFetchParams, KLineData } from '../collector';
import { AxiosInstance } from 'axios';
import { UtilsService, PeriodMappingService } from '@app/utils';
import { DataSource, Period } from '@app/shared-data';

@Injectable()
export class TdxSource implements ISourceFetcher {
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

    // Map the period to TDX format
    const periodFormat = this.periodMappingService.toSourceFormat(
      period,
      DataSource.TDX,
    );

    // Dates will be used when TDX API is implemented
    void startDate;
    void endDate;

    // TODO: Implement actual TDX API call
    // For now, return empty array to indicate API not yet implemented
    console.warn(
      `TDX API call not yet implemented for code: ${code}, period: ${periodFormat}`,
    );

    return [];
  }

  isSupportedPeriod(period: Period): boolean {
    return this.periodMappingService.isSupported(period, DataSource.TDX);
  }

  getPeriodFormat(period: Period): string {
    return this.periodMappingService.toSourceFormat(period, DataSource.TDX);
  }
}
