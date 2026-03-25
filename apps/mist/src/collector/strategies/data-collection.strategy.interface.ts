import { Security, Period, DataSource } from '@app/shared-data';

/**
 * Data collection mode.
 */
export type CollectionMode = 'polling' | 'streaming';

/**
 * Data collection strategy interface.
 *
 * All data sources must implement this interface.
 * Each strategy encapsulates the collection logic for a specific data source.
 *
 * Polling mode (East Money): Actively fetch data on schedule
 * Streaming mode (TDX, miniQMT): Receive data via WebSocket push
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
   * Collect data for a specific security.
   *
   * For polling mode: Fetch data for the given time range
   * For streaming mode: Subscribe to data feed
   *
   * @param security - Security object
   * @param period - K-line period
   * @param time - Current time (only used for polling mode)
   */
  collectForSecurity(
    security: Security,
    period: Period,
    time?: Date,
  ): Promise<void>;

  /**
   * Start the strategy (for streaming mode).
   * Establishes WebSocket connection, sets up handlers.
   */
  start?(): Promise<void>;

  /**
   * Stop the strategy (for streaming mode).
   * Closes WebSocket connection, cleans up resources.
   */
  stop?(): Promise<void>;
}
