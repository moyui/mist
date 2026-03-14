/**
 * Centralized error messages for the Mist application
 * All error messages should be defined here to ensure consistency
 * and make localization easier in the future.
 *
 * All messages are in English for consistency across the codebase.
 */

export const ERROR_MESSAGES = {
  // === Service Initialization Errors ===
  INDICATOR_NOT_INITIALIZED:
    'IndicatorService not initialized. Please try again later.',
  DATA_SERVICE_NOT_INITIALIZED:
    'DataService not initialized. Please try again later.',

  // === Data Access Errors ===
  INDEX_NOT_FOUND: 'Index information not found',
  INDEX_PERIOD_REQUEST_FAILED: 'Failed to request index period data',
  INDEX_DAILY_REQUEST_FAILED: 'Failed to request index daily data',

  // === Validation Errors - Channel (Bi) ===
  BI_DATA_REQUIRED: 'Invalid input: bi data is required',
  BI_MUST_BE_ARRAY: 'Invalid input: bi must be an array',
  BI_ARRAY_EMPTY: 'Invalid input: bi array cannot be empty',
  BI_MISSING_HIGH_LOW:
    'Invalid bi at index {{index}}: missing highest or lowest value',
  BI_INVALID_NUMBER_TYPE:
    'Invalid bi at index {{index}}: highest and lowest must be numbers',
  BI_HIGH_MUST_EXCEED_LOW:
    'Invalid bi at index {{index}}: highest must be greater than lowest',
  BI_MISSING_FENXING:
    'Bi at index {{index}} is incomplete: missing fenxing information',
  BI_INVALID_DIRECTION:
    'Invalid bi at index {{index}}: invalid direction value',

  // === Validation Errors - General ===
  INVALID_PERIOD: 'Invalid period specified',
  INVALID_DATE_RANGE: 'Invalid date range provided',
  INSUFFICIENT_DATA: 'Insufficient data for calculation',
  INVALID_DATA_FORMAT: 'Invalid data format provided',

  // === API Errors ===
  UNAUTHORIZED: 'Unauthorized access',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please try again later.',
  INVALID_API_KEY: 'Invalid API key provided',

  // === Database Errors ===
  DATABASE_CONNECTION_FAILED: 'Failed to connect to database',
  DATABASE_QUERY_FAILED: 'Database query failed',

  // === General Errors ===
  INTERNAL_SERVER_ERROR: 'Internal server error occurred',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
} as const;

export type ErrorMessage = keyof typeof ERROR_MESSAGES;
