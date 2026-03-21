import { BarPeriod } from '../enums/bar-period.enum';
import { DataSource } from '../enums/data-source.enum';

/**
 * Period format mapping for each data source.
 * Maps the new BarPeriod enum to source-specific formats.
 */
const PERIOD_MAPPING: Record<DataSource, Partial<Record<BarPeriod, string>>> = {
  [DataSource.EAST_MONEY]: {
    [BarPeriod.ONE_MIN]: '1',
    [BarPeriod.FIVE_MIN]: '5',
    [BarPeriod.FIFTEEN_MIN]: '15',
    [BarPeriod.THIRTY_MIN]: '30',
    [BarPeriod.SIXTY_MIN]: '60',
    [BarPeriod.DAILY]: 'daily',
  },
  [DataSource.TDX]: {
    [BarPeriod.ONE_MIN]: '1m',
    [BarPeriod.FIVE_MIN]: '5m',
    [BarPeriod.DAILY]: '1d',
  },
  [DataSource.MINI_QMT]: {},
};

export class PeriodMapping {
  static toSourceFormat(period: BarPeriod, source: DataSource): string {
    const mapping = PERIOD_MAPPING[source];
    if (!mapping || !mapping[period]) {
      throw new Error(
        `Data source ${source} does not support period ${period}`,
      );
    }
    return mapping[period];
  }

  static isSupported(period: BarPeriod, source: DataSource): boolean {
    const mapping = PERIOD_MAPPING[source];
    return !!(mapping && mapping[period]);
  }
}
