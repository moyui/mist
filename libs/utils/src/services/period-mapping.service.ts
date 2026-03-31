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
      [Period.SIXTY_MIN]: '60m',
      [Period.DAY]: '1d',
      [Period.WEEK]: '1w',
      [Period.MONTH]: '1M',
    },
    [DataSource.MINI_QMT]: {
      [Period.ONE_MIN]: '1',
      [Period.FIVE_MIN]: '5',
      [Period.FIFTEEN_MIN]: '15',
      [Period.THIRTY_MIN]: '30',
      [Period.SIXTY_MIN]: '60',
      [Period.DAY]: 'daily',
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
   * Check if source supports the period
   */
  isSupported(period: Period, source: DataSource): boolean {
    const mapping = this.periodMapping[source];
    return !!(mapping && mapping[period]);
  }
}
