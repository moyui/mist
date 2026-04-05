import { Security, Period, DataSource } from '@app/shared-data';

/**
 * Data collection mode.
 * - polling: Actively fetch data on schedule (East Money)
 * - streaming: Receive data via WebSocket push (TDX, miniQMT)
 */
export type CollectionMode = 'polling' | 'streaming';

/**
 * Data collection strategy interface.
 *
 * All data sources must implement this interface.
 * Each strategy encapsulates the collection logic for a specific data source.
 */
export interface IDataCollectionStrategy {
  /**
   * Data source type (e.g., EAST_MONEY, TDX, MINI_QMT)
   */
  readonly source: DataSource;

  /**
   * Collection mode.
   * - polling: Actively fetch data on schedule (East Money)
   * - streaming: Receive data via WebSocket push (TDX, miniQMT)
   */
  readonly mode: CollectionMode;

  /**
   * Manual collection: collect data for a specific time range.
   *
   * @param security - Security entity
   * @param period - K-line period
   * @param startDate - Start of the time range (inclusive)
   * @param endDate - End of the time range (exclusive)
   */
  collectForSecurity(
    security: Security,
    period: Period,
    startDate: Date,
    endDate: Date,
  ): Promise<number>;

  /**
   * Scheduled collection: collect the previous completed K candle.
   * Only available for polling strategies.
   *
   * @param security - Security entity
   * @param period - K-line period
   * @param triggerTime - The time when the collection is triggered (defaults to now)
   */
  collectScheduledCandle?(
    security: Security,
    period: Period,
    triggerTime?: Date,
  ): Promise<void>;

  /**
   * Batch scheduled collection for all active securities.
   * Only available for polling strategies.
   *
   * @param period - K-line period
   * @param triggerTime - The time when the collection is triggered (defaults to now)
   */
  collectForAllSecurities?(period: Period, triggerTime?: Date): Promise<void>;

  /**
   * Start the strategy (for streaming mode).
   */
  start?(): Promise<void>;

  /**
   * Stop the strategy (for streaming mode).
   */
  stop?(): Promise<void>;
}
