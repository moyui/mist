import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource, Period } from '@app/shared-data';

@Injectable()
export class PeriodMappingService {
  private readonly periodMapping: Record<
    DataSource,
    Partial<Record<Period, string>>
  > = {
    [DataSource.EAST_MONEY]: {
      [Period.ONE_MIN]: '1',
      [Period.FIVE_MIN]: '5',
      [Period.FIFTEEN_MIN]: '15',
      [Period.THIRTY_MIN]: '30',
      [Period.SIXTY_MIN]: '60',
      [Period.DAY]: 'daily',
    },
    [DataSource.TDX]: {
      [Period.ONE_MIN]: '1m',
      [Period.FIVE_MIN]: '5m',
      [Period.FIFTEEN_MIN]: '15m',
      [Period.THIRTY_MIN]: '30m',
      [Period.SIXTY_MIN]: '1h',
      [Period.DAY]: '1d',
      [Period.WEEK]: '1w',
      [Period.MONTH]: '1mon',
    },
    [DataSource.QMT]: {
      [Period.ONE_MIN]: '1m',
      [Period.THREE_MIN]: '3m',
      [Period.FIVE_MIN]: '5m',
      [Period.FIFTEEN_MIN]: '15m',
      [Period.THIRTY_MIN]: '30m',
      [Period.SIXTY_MIN]: '1h',
      [Period.DAY]: '1d',
      [Period.WEEK]: '1w',
      [Period.MONTH]: '1mon',
      [Period.QUARTER]: '1q',
      [Period.HALF_YEAR]: '1hy',
      [Period.YEAR]: '1y',
    },
  };

  private readonly sourcePeriodAliases: Record<
    DataSource,
    Record<string, string>
  > = {
    [DataSource.EAST_MONEY]: {
      '1min': '1',
      '5min': '5',
      '15min': '15',
      '30min': '30',
      '60min': '60',
      day: 'daily',
    },
    [DataSource.TDX]: {
      '1': '1m',
      '1min': '1m',
      '5': '5m',
      '5min': '5m',
      '15': '15m',
      '15min': '15m',
      '30': '30m',
      '30min': '30m',
      '60': '1h',
      '60m': '1h',
      '60min': '1h',
      day: '1d',
      week: '1w',
      month: '1mon',
      '1M': '1mon',
    },
    [DataSource.QMT]: {
      '1': '1m',
      '1min': '1m',
      '3': '3m',
      '3min': '3m',
      '5': '5m',
      '5min': '5m',
      '15': '15m',
      '15min': '15m',
      '30': '30m',
      '30min': '30m',
      '60': '1h',
      '60m': '1h',
      '60min': '1h',
      day: '1d',
      daily: '1d',
      week: '1w',
      month: '1mon',
      mon: '1mon',
      quarter: '1q',
      halfyear: '1hy',
      'half-year': '1hy',
      year: '1y',
    },
  };

  /**
   * Convert period to source-specific format
   */
  toSourceFormat(period: Period, source: DataSource): string {
    const mapping = this.periodMapping[source];
    if (!mapping || !mapping[period]) {
      throw new BadRequestException(
        `Data source ${source} does not support period ${Period[period]}`,
      );
    }
    return mapping[period]!;
  }

  /**
   * Convert source-specific period string back to the unified Period enum.
   */
  fromSourceFormat(sourcePeriod: string, source: DataSource): Period {
    const mapping = this.periodMapping[source];
    if (!mapping) {
      throw new BadRequestException(`Data source ${source} is not supported`);
    }

    const normalizedPeriod =
      this.sourcePeriodAliases[source]?.[sourcePeriod] ?? sourcePeriod;

    for (const [period, mappedPeriod] of Object.entries(mapping)) {
      if (mappedPeriod === normalizedPeriod) {
        return Number(period) as Period;
      }
    }

    throw new BadRequestException(
      `Data source ${source} does not support source period ${sourcePeriod}`,
    );
  }

  /**
   * Check if source supports the period
   */
  isSupported(period: Period, source: DataSource): boolean {
    const mapping = this.periodMapping[source];
    return !!(mapping && mapping[period]);
  }
}
