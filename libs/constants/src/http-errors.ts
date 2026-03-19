/**
 * HTTP API Error Codes
 *
 * Error code ranges:
 * - 1xxx: Client errors (parameter validation, format errors)
 * - 2xxx: Business errors (data not found, insufficient data)
 * - 5xxx: Server errors (database, external services)
 */
export enum HttpErrorCode {
  // === Success ===
  SUCCESS = 'SUCCESS',

  // === Client Errors (1xxx) ===
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
  INVALID_PERIOD = 'INVALID_PERIOD',
  INVALID_DATA_FORMAT = 'INVALID_DATA_FORMAT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',

  // === Business Errors (2xxx) ===
  DATA_NOT_FOUND = 'DATA_NOT_FOUND',
  INDEX_NOT_FOUND = 'INDEX_NOT_FOUND',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  CONFLICT = 'CONFLICT',

  // === Server Errors (5xxx) ===
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
}

/**
 * Maps error code enum to numeric code
 */
export const HTTP_ERROR_CODE_MAP: Record<HttpErrorCode, number> = {
  // Success
  [HttpErrorCode.SUCCESS]: 200,

  // Client Errors (1xxx)
  [HttpErrorCode.INVALID_PARAMETER]: 1001,
  [HttpErrorCode.INVALID_DATE_RANGE]: 1002,
  [HttpErrorCode.INVALID_PERIOD]: 1003,
  [HttpErrorCode.INVALID_DATA_FORMAT]: 1004,
  [HttpErrorCode.UNAUTHORIZED]: 1005,
  [HttpErrorCode.FORBIDDEN]: 1006,

  // Business Errors (2xxx)
  [HttpErrorCode.DATA_NOT_FOUND]: 2001,
  [HttpErrorCode.INDEX_NOT_FOUND]: 2002,
  [HttpErrorCode.INSUFFICIENT_DATA]: 2003,
  [HttpErrorCode.CONFLICT]: 2004,

  // Server Errors (5xxx)
  [HttpErrorCode.INTERNAL_SERVER_ERROR]: 5000,
  [HttpErrorCode.DATABASE_ERROR]: 5001,
  [HttpErrorCode.EXTERNAL_SERVICE_ERROR]: 5002,
};

/**
 * Custom HTTP Error class (optional, for convenience)
 */
export class HttpApiError extends Error {
  constructor(
    message: string,
    public errorCode: HttpErrorCode,
  ) {
    super(message);
    this.name = 'HttpApiError';
  }
}

/**
 * Reverse lookup: numeric code to error code enum
 */
export const HTTP_CODE_TO_ENUM: Record<number, HttpErrorCode> =
  Object.fromEntries(
    Object.entries(HTTP_ERROR_CODE_MAP).map(([key, value]) => [
      value,
      key as HttpErrorCode,
    ]),
  );
