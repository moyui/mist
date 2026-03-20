import { KLinePeriod } from '../enums/kline-period.enum';
import { DataSource } from '../enums/data-source.enum';

/**
 * Period format mapping for each data source.
 * Note: QUARTERLY and YEARLY periods are reserved for future implementation.
 */
const PERIOD_MAPPING: Record<
  DataSource,
  Partial<Record<KLinePeriod, string>>
> = {
  [DataSource.EAST_MONEY]: {
    [KLinePeriod.ONE_MIN]: '1',
    [KLinePeriod.FIVE_MIN]: '5',
    [KLinePeriod.FIFTEEN_MIN]: '15',
    [KLinePeriod.THIRTY_MIN]: '30',
    [KLinePeriod.SIXTY_MIN]: '60',
    [KLinePeriod.DAILY]: 'daily',
    [KLinePeriod.WEEKLY]: 'weekly',
    [KLinePeriod.MONTHLY]: 'monthly',
  },
  [DataSource.TDX]: {
    [KLinePeriod.ONE_MIN]: '1m',
    [KLinePeriod.FIVE_MIN]: '5m',
    [KLinePeriod.DAILY]: '1d',
  },
  [DataSource.MINI_QMT]: {},
};

export class PeriodMapping {
  static toSourceFormat(period: KLinePeriod, source: DataSource): string {
    const mapping = PERIOD_MAPPING[source];
    if (!mapping || !mapping[period]) {
      throw new Error(
        `Data source ${source} does not support period ${period}`,
      );
    }
    return mapping[period];
  }

  static isSupported(period: KLinePeriod, source: DataSource): boolean {
    const mapping = PERIOD_MAPPING[source];
    return !!(mapping && mapping[period]);
  }
}
