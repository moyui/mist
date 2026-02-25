/**
 * Centralized error messages for the Mist application
 * All error messages should be defined here to ensure consistency
 * and make localization easier in the future.
 */

export const ERROR_MESSAGES = {
  // Service initialization errors
  INDICATOR_NOT_INITIALIZED:
    'IndicatorService not initialized. Please try again later.',
  DATA_SERVICE_NOT_INITIALIZED:
    'DataService not initialized. Please try again later.',

  // Data errors
  INDEX_NOT_FOUND: 'Index information not found',
  INSUFFICIENT_DATA: 'Insufficient data for calculation',
  INVALID_DATA_FORMAT: 'Invalid data format provided',

  // API errors
  UNAUTHORIZED: 'Unauthorized access',
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please try again later.',
  INVALID_API_KEY: 'Invalid API key provided',

  // Database errors
  DATABASE_CONNECTION_FAILED: 'Failed to connect to database',
  DATABASE_QUERY_FAILED: 'Database query failed',

  // Validation errors
  INVALID_PERIOD: 'Invalid period specified',
  INVALID_DATE_RANGE: 'Invalid date range provided',
  MISSING_REQUIRED_PARAMETER: 'Missing required parameter',

  // General errors
  INTERNAL_SERVER_ERROR: 'Internal server error occurred',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
} as const;

export type ErrorMessage = keyof typeof ERROR_MESSAGES;

/**
 * Get a formatted error message
 * @param key - The error message key
 * @param params - Optional parameters to interpolate into the message
 * @returns The formatted error message
 */
export function getErrorMessage(
  key: ErrorMessage,
  params?: Record<string, string | number>,
): string {
  const message = ERROR_MESSAGES[key];
  if (!params) {
    return message;
  }

  // Simple parameter interpolation
  return Object.entries(params).reduce(
    (acc, [paramKey, value]) => acc.replace(`{{${paramKey}}}`, String(value)),
    message,
  );
}
