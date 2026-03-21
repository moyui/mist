import { KPeriod } from '../enums/k-period.enum';
import { DataSource } from '../enums/data-source.enum';

/**
 * Period format mapping for each data source.
 * Maps the new KPeriod enum to source-specific formats.
 */
const PERIOD_MAPPING: Record<DataSource, Partial<Record<KPeriod, string>>> = {
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
  [DataSource.MINI_QMT]: {},
};

export class PeriodMapping {
  static toSourceFormat(period: KPeriod, source: DataSource): string {
    const mapping = PERIOD_MAPPING[source];
    if (!mapping || !mapping[period]) {
      throw new Error(
        `Data source ${source} does not support period ${period}`,
      );
    }
    return mapping[period];
  }

  static isSupported(period: KPeriod, source: DataSource): boolean {
    const mapping = PERIOD_MAPPING[source];
    return !!(mapping && mapping[period]);
  }
}
