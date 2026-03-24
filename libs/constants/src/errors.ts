/**
 * Centralized error messages for the Mist application
 * All error messages should be defined here to ensure consistency
 * and make localization easier in the future.
 *
 * All messages are in English for consistency across the codebase.
 */

export const ERROR_MESSAGES = {
  // === 400 Bad Request ===
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
  INVALID_PERIOD: 'Invalid period specified',
  INVALID_DATE_RANGE: 'Invalid date range provided',
  INVALID_DATA_FORMAT: 'Invalid data format provided',
  INVALID_API_KEY: 'Invalid API key provided',

  // === 404 Not Found ===
  INDEX_NOT_FOUND: 'Index information not found',
  DATA_NOT_FOUND: 'Requested data not found',

  // === 401 Unauthorized ===
  UNAUTHORIZED: 'Unauthorized access',

  // === 429 Rate Limit ===
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please try again later.',

  // === 500 Internal Server Error ===
  INDICATOR_NOT_INITIALIZED:
    'IndicatorService not initialized. Please try again later.',
  DATA_SERVICE_NOT_INITIALIZED:
    'DataService not initialized. Please try again later.',
  DATABASE_CONNECTION_FAILED: 'Failed to connect to database',
  DATABASE_QUERY_FAILED: 'Database query failed',
  INTERNAL_SERVER_ERROR: 'Internal server error occurred',
  INSUFFICIENT_DATA: 'Insufficient data for calculation',

  // === 503 Service Unavailable ===
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',

  // === 500 Internal Server Error - External Service Failures ===
  INDEX_PERIOD_REQUEST_FAILED: 'Failed to request index period data',
  INDEX_DAILY_REQUEST_FAILED: 'Failed to request index daily data',
  TRADING_DAY_CHECK_FAILED: 'Failed to check if date is a trading day',
  LOCAL_SERVICE_REQUEST_FAILED: 'Failed to request local service',
} as const;

export type ErrorMessage = keyof typeof ERROR_MESSAGES;
