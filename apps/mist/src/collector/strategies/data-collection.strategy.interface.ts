import { Period } from '@app/shared-data';
import {
  ITimeWindowStrategy,
  CollectionWindow,
} from '../time-window/time-window.strategy.interface';
import { IKLineMergeService, RawKLineData, MergedKLineData } from '../kline-merge/kline-merge.service';

/**
 * Collection mode for data collection strategies.
 */
export enum CollectionMode {
  /**
   * One-time collection of historical data
   */
  ONE_TIME = 'one-time',

  /**
   * Scheduled recurring collection
   */
  SCHEDULED = 'scheduled',

  /**
   * Real-time streaming via WebSocket
   */
  REALTIME = 'realtime',
}

/**
 * Collection result with metadata.
 */
export interface CollectionResult {
  /**
   * Number of records collected
   */
  count: number;

  /**
   * Time range of collected data
   */
  startTime: Date;
  endTime: Date;

  /**
   * Data source used
   */
  source: string;

  /**
   * Collection mode used
   */
  mode: CollectionMode;

  /**
   * Whether collection was successful
   */
  success: boolean;

  /**
   * Error message if collection failed
   */
  error?: string;
}

/**
 * Data collection strategy interface.
 *
 * Defines the contract for collecting K-line data from different sources.
 * Each data source (East Money, TDX, etc.) implements this interface
 * with its own collection logic, time windows, and merge strategies.
 */
export interface IDataCollectionStrategy {
  /**
   * Get the collection mode supported by this strategy.
   */
  getCollectionMode(): CollectionMode;

  /**
   * Collect K-line data for a given security and period.
   *
   * @param securityCode - Security code (e.g., '000001.SH')
   * @param period - Time period for K-line data
   * @param window - Collection window (time range and recency requirements)
   * @returns Promise resolving to collection result
   */
  collect(
    securityCode: string,
    period: Period,
    window: CollectionWindow,
  ): Promise<CollectionResult>;

  /**
   * Get the time window strategy used by this collection strategy.
   */
  getTimeWindowStrategy(): ITimeWindowStrategy;

  /**
   * Get the K-line merge service used by this collection strategy.
   */
  getKLineMergeService(): IKLineMergeService;

  /**
   * Validate if this strategy can collect data for the given security.
   *
   * @param securityCode - Security code to validate
   * @returns true if strategy supports this security, false otherwise
   */
  canCollect(securityCode: string): boolean;
}
