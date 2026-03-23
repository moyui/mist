/**
 * Unified period enum for all time-based data operations
 * All period values are stored as minutes for easy time calculations
 */
export enum Period {
  // Minute-level periods
  ONE_MIN = 1,
  FIVE_MIN = 5,
  FIFTEEN_MIN = 15,
  THIRTY_MIN = 30,
  SIXTY_MIN = 60,

  // Day-level and longer periods
  DAY = 1440, // 1 day = 24 * 60 minutes
  WEEK = 10080, // 1 week = 7 * 24 * 60 minutes
  MONTH = 43200, // 1 month = 30 * 24 * 60 minutes
  QUARTER = 129600, // 1 quarter = 90 * 24 * 60 minutes
  YEAR = 525600, // 1 year = 365 * 24 * 60 minutes
}
