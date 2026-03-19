import {
  HttpErrorCode,
  HTTP_ERROR_CODE_MAP,
  HTTP_CODE_TO_ENUM,
  HttpApiError,
} from './http-errors';

describe('HttpErrorCode', () => {
  it('should have all required error codes', () => {
    // Success
    expect(HttpErrorCode.SUCCESS).toBe('SUCCESS');

    // Client Errors (1xxx)
    expect(HttpErrorCode.INVALID_PARAMETER).toBe('INVALID_PARAMETER');
    expect(HttpErrorCode.INVALID_DATE_RANGE).toBe('INVALID_DATE_RANGE');
    expect(HttpErrorCode.INVALID_PERIOD).toBe('INVALID_PERIOD');
    expect(HttpErrorCode.INVALID_DATA_FORMAT).toBe('INVALID_DATA_FORMAT');
    expect(HttpErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
    expect(HttpErrorCode.FORBIDDEN).toBe('FORBIDDEN');

    // Business Errors (2xxx)
    expect(HttpErrorCode.DATA_NOT_FOUND).toBe('DATA_NOT_FOUND');
    expect(HttpErrorCode.INDEX_NOT_FOUND).toBe('INDEX_NOT_FOUND');
    expect(HttpErrorCode.INSUFFICIENT_DATA).toBe('INSUFFICIENT_DATA');
    expect(HttpErrorCode.CONFLICT).toBe('CONFLICT');

    // Server Errors (5xxx)
    expect(HttpErrorCode.INTERNAL_SERVER_ERROR).toBe('INTERNAL_SERVER_ERROR');
    expect(HttpErrorCode.DATABASE_ERROR).toBe('DATABASE_ERROR');
    expect(HttpErrorCode.EXTERNAL_SERVICE_ERROR).toBe('EXTERNAL_SERVICE_ERROR');
  });

  it('should have 14 error codes total', () => {
    const values = Object.values(HttpErrorCode);
    expect(values).toHaveLength(14);
  });
});

describe('HTTP_ERROR_CODE_MAP', () => {
  it('should map SUCCESS to 200', () => {
    expect(HTTP_ERROR_CODE_MAP[HttpErrorCode.SUCCESS]).toBe(200);
  });

  it('should map client errors to 1xxx range', () => {
    expect(HTTP_ERROR_CODE_MAP[HttpErrorCode.INVALID_PARAMETER]).toBe(1001);
    expect(HTTP_ERROR_CODE_MAP[HttpErrorCode.INVALID_DATE_RANGE]).toBe(1002);
    expect(HTTP_ERROR_CODE_MAP[HttpErrorCode.INVALID_PERIOD]).toBe(1003);
    expect(HTTP_ERROR_CODE_MAP[HttpErrorCode.INVALID_DATA_FORMAT]).toBe(1004);
    expect(HTTP_ERROR_CODE_MAP[HttpErrorCode.UNAUTHORIZED]).toBe(1005);
    expect(HTTP_ERROR_CODE_MAP[HttpErrorCode.FORBIDDEN]).toBe(1006);
  });

  it('should map business errors to 2xxx range', () => {
    expect(HTTP_ERROR_CODE_MAP[HttpErrorCode.DATA_NOT_FOUND]).toBe(2001);
    expect(HTTP_ERROR_CODE_MAP[HttpErrorCode.INDEX_NOT_FOUND]).toBe(2002);
    expect(HTTP_ERROR_CODE_MAP[HttpErrorCode.INSUFFICIENT_DATA]).toBe(2003);
    expect(HTTP_ERROR_CODE_MAP[HttpErrorCode.CONFLICT]).toBe(2004);
  });

  it('should map server errors to 5xxx range', () => {
    expect(HTTP_ERROR_CODE_MAP[HttpErrorCode.INTERNAL_SERVER_ERROR]).toBe(5000);
    expect(HTTP_ERROR_CODE_MAP[HttpErrorCode.DATABASE_ERROR]).toBe(5001);
    expect(HTTP_ERROR_CODE_MAP[HttpErrorCode.EXTERNAL_SERVICE_ERROR]).toBe(
      5002,
    );
  });

  it('should have 14 mappings total', () => {
    expect(Object.keys(HTTP_ERROR_CODE_MAP)).toHaveLength(14);
  });
});

describe('HTTP_CODE_TO_ENUM', () => {
  it('should reverse map numeric codes to enum values', () => {
    expect(HTTP_CODE_TO_ENUM[200]).toBe(HttpErrorCode.SUCCESS);
    expect(HTTP_CODE_TO_ENUM[1001]).toBe(HttpErrorCode.INVALID_PARAMETER);
    expect(HTTP_CODE_TO_ENUM[2001]).toBe(HttpErrorCode.DATA_NOT_FOUND);
    expect(HTTP_CODE_TO_ENUM[5000]).toBe(HttpErrorCode.INTERNAL_SERVER_ERROR);
  });

  it('should have 14 reverse mappings', () => {
    expect(Object.keys(HTTP_CODE_TO_ENUM)).toHaveLength(14);
  });

  it('should be complete inverse of HTTP_ERROR_CODE_MAP', () => {
    // Verify that every value in HTTP_ERROR_CODE_MAP has a reverse mapping
    Object.entries(HTTP_ERROR_CODE_MAP).forEach(([enumKey, numericCode]) => {
      expect(HTTP_CODE_TO_ENUM[numericCode]).toBe(enumKey);
    });
  });
});

describe('HttpApiError', () => {
  it('should create error with message and code', () => {
    const error = new HttpApiError(
      'Test error',
      HttpErrorCode.INVALID_PARAMETER,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Test error');
    expect(error.errorCode).toBe(HttpErrorCode.INVALID_PARAMETER);
    expect(error.name).toBe('HttpApiError');
  });

  it('should have correct stack trace', () => {
    const error = new HttpApiError(
      'Test error',
      HttpErrorCode.INTERNAL_SERVER_ERROR,
    );

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('HttpApiError');
  });
});
