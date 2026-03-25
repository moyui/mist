import { Period } from '@app/shared-data';

/**
 * Collection window configuration for scheduled data collection.
 * Defines the time range and recency requirements for data collection.
 */
export interface CollectionWindow {
  /**
   * Start timestamp of the collection window (inclusive)
   */
  startTime: Date;

  /**
   * End timestamp of the collection window (exclusive)
   */
  endTime: Date;

  /**
   * Number of most recent records to ensure exist in the database
   * Used for validation and data integrity checks
   */
  ensureRecentCount: number;
}

/**
 * Time window strategy interface for determining data collection windows.
 * Different data sources may have different time window requirements based on
 * their data availability, API limitations, and market hours.
 */
export interface ITimeWindowStrategy {
  /**
   * Calculate the collection window for a given period and current time.
   *
   * @param period - The time period for K-line data
   * @param currentTime - The current timestamp (defaults to now)
   * @returns Collection window configuration
   */
  calculateCollectionWindow(
    period: Period,
    currentTime?: Date,
  ): CollectionWindow;

  /**
   * Validate if a collection window is valid for the current time.
   * Some strategies may restrict collection to specific hours (e.g., market hours).
   *
   * @param window - The collection window to validate
   * @param currentTime - The current timestamp (defaults to now)
   * @returns true if the window is valid for collection, false otherwise
   */
  isValidCollectionWindow(
    window: CollectionWindow,
    currentTime?: Date,
  ): boolean;

  /**
   * Get the next scheduled collection time after the current time.
   * Used for scheduling recurring collection tasks.
   *
   * @param period - The time period for K-line data
   * @param currentTime - The current timestamp (defaults to now)
   * @returns The next timestamp when collection should occur
   */
  getNextCollectionTime(period: Period, currentTime?: Date): Date;
}
