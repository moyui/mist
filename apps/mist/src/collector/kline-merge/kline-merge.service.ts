import { Period } from '@app/shared-data';

/**
 * Raw K-line data structure from external data sources.
 * Represents a single candlestick with OHLCV data.
 */
export interface RawKLineData {
  /**
   * Timestamp of the candlestick
   */
  timestamp: Date;

  /**
   * Open price
   */
  open: number;

  /**
   * High price
   */
  high: number;

  /**
   * Low price
   */
  low: number;

  /**
   * Close price
   */
  close: number;

  /**
   * Trading volume
   */
  volume: number;

  /**
   * Trading amount (optional, not all sources provide this)
   */
  amount?: number;
}

/**
 * Merged K-line data structure.
 * Same as raw data but explicitly typed for merged output.
 */
export type MergedKLineData = RawKLineData;

/**
 * K-line merge service interface for merging raw K-line data.
 *
 * Different data sources may return data in different granularities.
 * This service handles merging raw data into the requested period.
 *
 * For example:
 * - East Money 1min data → merge into 5min candles
 * - Raw tick data → aggregate into 1min candles
 */
export interface IKLineMergeService {
  /**
   * Merge raw K-line data into target period.
   *
   * @param rawData - Array of raw K-line data (typically 1min granularity)
   * @param targetPeriod - The target period to merge into
   * @param sourcePeriod - The period of the raw data (default: 1min)
   * @returns Array of merged K-line data in target period
   */
  mergeKLineData(
    rawData: RawKLineData[],
    targetPeriod: Period,
    sourcePeriod?: Period,
  ): MergedKLineData[];

  /**
   * Build X-minute data from 1-minute data.
   * Convenience method for common merging scenario.
   *
   * @param oneMinData - Array of 1-minute K-line data
   * @param minutes - Number of minutes per candle (e.g., 5, 15, 30, 60)
   * @returns Array of merged K-line data
   */
  buildXMinData(oneMinData: RawKLineData[], minutes: number): MergedKLineData[];
}
