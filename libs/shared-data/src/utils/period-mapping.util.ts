import { KPeriod } from '../enums/k-period.enum';
import { DataSource } from '../enums/data-source.enum';

/**
 * Period format mapping for each data source.
 * Maps the new KPeriod enum to source-specific formats.
 */
const PERIOD_MAPPING: Record<DataSource, Partial<Record<KPeriod, string>>> = {
  [DataSource.EAST_MONEY]: {
    [KPeriod.MIN_1]: '1',
    [KPeriod.MIN_5]: '5',
    [KPeriod.MIN_15]: '15',
    [KPeriod.MIN_30]: '30',
    [KPeriod.MIN_60]: '60',
    [KPeriod.DAILY]: 'daily',
  },
  [DataSource.TDX]: {
    [KPeriod.MIN_1]: '1m',
    [KPeriod.MIN_5]: '5m',
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
