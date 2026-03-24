# API Exception Handling Redesign

**Status**: Approved
**Date**: 2026-03-24
**Author**: Claude Sonnet
**Scope**: `apps/mist` application only

## Problem Statement

The current exception handling system in the Mist API has several issues:

1. **Inconsistent error code mapping**: Using `instanceof` checks to map custom error codes (1001/2001/5000) creates maintenance burden
2. **No DTO validation**: Global `ValidationPipe` is not enabled, leading to manual validation
3. **Lack of field-level error details**: Validation errors don't provide field-specific information
4. **Mixed error handling approaches**: Services throw different exception types inconsistently
5. **Unnecessary complexity**: Custom error codes duplicate HTTP status codes

## Design Goals

1. ✅ Use HTTP status codes directly (400/404/500) instead of custom numeric codes
2. ✅ Enable global `ValidationPipe` with field-level error details
3. ✅ Simplify `AllExceptionsFilter` to remove mapping logic
4. ✅ Maintain backward compatibility with Chan app (which uses Mist's filters)
5. ✅ Follow NestJS best practices
6. ✅ Zero impact on frontend (frontend only uses HTTP status codes)

## Architecture

### Current State

```
Request → Controller → Service → throw Exception
                                      ↓
                            AllExceptionsFilter
                                      ↓
                            instanceof checks → map to code
                                      ↓
                            { success: false, code: 1001, ... }
```

### New Design

```
Request → ValidationPipe (DTO validation) → Controller → Service → throw Exception
                                                                     ↓
                                                           AllExceptionsFilter
                                                                     ↓
                                                  Extract HTTP status & message
                                                                     ↓
                                    { success: false, statusCode: 400, errors: {...}, ... }
```

## Core Components

### 1. Global ValidationPipe

**Location**: `apps/mist/src/main.ts`

```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,              // Remove undefined fields
  forbidNonWhitelisted: true,   // Throw error if extra fields present
  transform: true,               // Auto type conversion
  exceptionFactory: (errors) => {
    const fieldErrors = errors.reduce((acc, err) => {
      acc[err.property] = Object.values(err.constraints || {});
      return acc;
    }, {} as Record<string, string[]>);

    return new BadRequestException({
      message: 'VALIDATION_ERROR',
      errors: fieldErrors,
    });
  },
}));
```

**Benefits**:
- Automatic DTO validation
- Field-level error details
- Consistent error format

### 2. Simplified AllExceptionsFilter

**Location**: `apps/mist/src/filters/all-exceptions.filter.ts`

**Key changes**:
- ❌ Remove `HTTP_ERROR_CODE_MAP` and mapping logic
- ❌ Remove `mapErrorCode()` method
- ❌ Remove `getMessageKey()` method
- ✅ Directly extract message from exception
- ✅ Support field-level validation errors

```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : 500;

    const errorResponse = {
      success: false,
      statusCode: status,
      message: this.extractMessage(exception),
      errors: this.extractErrors(exception),
      timestamp: new Date().toISOString(),
      requestId: this.generateRequestId(),
      path: request.url,
    };

    response.status(status).json(errorResponse);
  }
}
```

### 3. Updated TransformInterceptor

**Location**: `apps/mist/src/interceptors/transform.interceptor.ts`

**Changes**:
- `code` → `statusCode` (consistency with error responses)
- Add `path` field (for debugging)

```typescript
{
  success: true,
  statusCode: 200,
  message: 'SUCCESS',
  data: {...},
  timestamp: '2026-03-24T...',
  requestId: 'http-...',
  path: '/indicator/k'
}
```

### 4. Error Messages

**Location**: `libs/constants/src/errors.ts`

Maintain existing `ERROR_MESSAGES` constant, grouped by HTTP status:

```typescript
export const ERROR_MESSAGES = {
  // 400 Bad Request
  VALIDATION_ERROR: 'Validation failed',
  INVALID_PARAMETER: 'Invalid parameter provided',

  // 404 Not Found
  DATA_NOT_FOUND: 'Requested data not found',

  // 500 Internal Server Error
  INTERNAL_SERVER_ERROR: 'Internal server error occurred',
} as const;
```

## Response Formats

### Validation Error (400)

```json
{
  "success": false,
  "statusCode": 400,
  "message": "VALIDATION_ERROR",
  "errors": {
    "symbol": ["指数代码不能为空"],
    "period": ["周期必须是以下数值之一: 1min,5min,15min,30min,60min,daily"]
  },
  "timestamp": "2026-03-24T10:30:00.000Z",
  "requestId": "err-1711267800000-abc123",
  "path": "/indicator/k"
}
```

### Business Error (404)

```json
{
  "success": false,
  "statusCode": 404,
  "message": "DATA_NOT_FOUND",
  "errors": null,
  "timestamp": "2026-03-24T10:30:00.000Z",
  "requestId": "err-1711267800000-def456",
  "path": "/indicator/k"
}
```

### Server Error (500)

```json
{
  "success": false,
  "statusCode": 500,
  "message": "INTERNAL_SERVER_ERROR",
  "errors": null,
  "timestamp": "2026-03-24T10:30:00.000Z",
  "requestId": "err-1711267800000-ghi789",
  "path": "/indicator/k"
}
```

## Files to Modify

```
Modify:
├── apps/mist/src/main.ts                           # Enable ValidationPipe
├── apps/mist/src/filters/all-exceptions.filter.ts  # Simplify logic
├── apps/mist/src/interceptors/transform.interceptor.ts  # Update format
└── libs/constants/src/errors.ts                   # Optional: group messages

Delete:
├── libs/constants/src/http-errors.ts              # Remove custom error codes
└── libs/constants/src/http-errors.spec.ts         # Remove tests

Update imports:
├── apps/mist/src/filters/all-exceptions.filter.ts  # Remove HTTP_ERROR_CODE_MAP
```

## Migration Plan

### Phase 1: Preparation (1 day)
- [ ] Create feature branch `feature/error-handling-refactor`
- [ ] Backup current exception handling files
- [ ] Write test cases for current behavior

### Phase 2: Enable ValidationPipe (0.5 day)
- [ ] Modify `main.ts` to enable ValidationPipe
- [ ] Run tests to verify validation error format
- [ ] Commit changes

### Phase 3: Refactor AllExceptionsFilter (1 day)
- [ ] Simplify filter logic
- [ ] Update error response format
- [ ] Run tests for all error types
- [ ] Commit changes

### Phase 4: Update TransformInterceptor (0.5 day)
- [ ] Unify response format
- [ ] Add `path` field
- [ ] Commit changes

### Phase 5: Cleanup (0.5 day)
- [ ] Delete `http-errors.ts`
- [ ] Update API documentation
- [ ] Update README
- [ ] Commit changes

### Phase 6: Testing (1 day)
- [ ] Run all unit tests
- [ ] Run all E2E tests
- [ ] Manual testing of all API endpoints
- [ ] Verify frontend integration

**Total**: ~4-5 days

## Risk Assessment

### Low Risk ✅
- Frontend doesn't use `code` field, only HTTP status codes
- Most services already use NestJS built-in exceptions

### Medium Risk ⚠️
- Chan app controller imports Mist's filters (maintain backward compatibility)
- DTO validation error format changes

### High Risk ❌
- None

## Testing Strategy

### Unit Tests
```typescript
describe('AllExceptionsFilter', () => {
  it('should handle validation errors with field details');
  it('should handle 404 errors correctly');
  it('should handle 500 errors correctly');
  it('should generate unique request IDs');
});
```

### E2E Tests
```bash
# Test validation errors
curl -X POST http://localhost:8001/indicator/k \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}'
# Expected: 400 with field-level errors

# Test 404 errors
curl -X POST http://localhost:8001/indicator/k \
  -H "Content-Type: application/json" \
  -d '{"symbol": "INVALID", "period": "daily"}'
# Expected: 404 DATA_NOT_FOUND
```

## Rollback Plan

If issues arise:
1. Revert Git commits
2. Restore `http-errors.ts` file
3. Restore old `AllExceptionsFilter`

## Out of Scope

- **Chan app**: Continue using Mist's filters (backward compatible)
- **Saya app**: Has own error handling (not affected)
- **Schedule app**: No error handling (not affected)
- **MCP-server**: Has own `McpError` system (not affected)

## Success Criteria

- [ ] All API endpoints use HTTP status codes for error classification
- [ ] Validation errors return field-level details
- [ ] All tests pass
- [ ] Frontend integration unaffected
- [ ] Documentation updated
- [ ] Code complexity reduced
