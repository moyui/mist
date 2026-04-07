import { ISourceFetcher } from '../source-fetcher.interface';
import { Period } from '@app/shared-data';
import { TdxResponse, TdxSnapshot } from './types';

/**
 * TDX-specific source fetcher interface
 * Extends base ISourceFetcher with TDX raw data type and additional methods
 */
export interface ITdxSourceFetcher extends ISourceFetcher<TdxResponse> {
  /**
   * Fetch real-time snapshot for a single stock
   */
  fetchSnapshot(stockCode: string): Promise<TdxSnapshot>;

  /**
   * Fetch dividend factors for a stock
   */
  fetchDividFactors(
    stockCode: string,
    startDate: Date,
    endDate: Date,
  ): Promise<
    {
      timestamp: Date;
      forwardFactor: number;
      backwardFactor: number;
    }[]
  >;

  /**
   * Check if TDX supports a specific period
   * TDX supports: 1m, 5m, 15m, 30m, 60m, 1d, 1w, 1M
   */
  isSupportedPeriod(period: Period): boolean;
}
