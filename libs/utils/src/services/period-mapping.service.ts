import { Injectable } from '@nestjs/common';
import { KPeriod, DataSource } from '@app/shared-data';

@Injectable()
export class PeriodMappingService {
  private readonly periodMapping: Record<
    DataSource,
    Partial<Record<KPeriod, string>>
  > = {
    [DataSource.EAST_MONEY]: {
      [KPeriod.ONE_MIN]: '1',
      [KPeriod.FIVE_MIN]: '5',
      [KPeriod.FIFTEEN_MIN]: '15',
      [KPeriod.THIRTY_MIN]: '30',
      [KPeriod.SIXTY_MIN]: '60',
      [KPeriod.DAILY]: 'daily',
    },
    [DataSource.TDX]: {
      [KPeriod.ONE_MIN]: '1m',
      [KPeriod.FIVE_MIN]: '5m',
      [KPeriod.DAILY]: '1d',
    },
    [DataSource.MINI_QMT]: {
      // Fallback to EAST_MONEY format for MINI_QMT
      // TODO: Update with MINI_QMT-specific formats when available
      [KPeriod.ONE_MIN]: '1',
      [KPeriod.FIVE_MIN]: '5',
      [KPeriod.FIFTEEN_MIN]: '15',
      [KPeriod.THIRTY_MIN]: '30',
      [KPeriod.SIXTY_MIN]: '60',
      [KPeriod.DAILY]: 'daily',
    },
  };

  /**
   * Convert period to source-specific format
   */
  toSourceFormat(period: KPeriod, source: DataSource): string {
    const mapping = this.periodMapping[source];
    if (!mapping || !mapping[period]) {
      throw new Error(
        `Data source ${source} does not support period ${period}`,
      );
    }
    return mapping[period]!;
  }

  /**
   * Check if source supports the period
   */
  isSupported(period: KPeriod, source: DataSource): boolean {
    const mapping = this.periodMapping[source];
    return !!(mapping && mapping[period]);
  }

  /**
   * Get all supported periods for a source
   */
  getSupportedPeriods(source: DataSource): KPeriod[] {
    const mapping = this.periodMapping[source];
    return mapping ? (Object.keys(mapping) as KPeriod[]) : [];
  }
}
