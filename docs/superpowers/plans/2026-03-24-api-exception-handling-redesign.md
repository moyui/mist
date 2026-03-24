# API Exception Handling Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Mist app exception handling to use HTTP status codes directly, enable global ValidationPipe with field-level errors, and simplify AllExceptionsFilter

**Architecture:** Replace custom error code mapping (1001/2001/5000) with direct HTTP status codes (400/404/500), enable NestJS ValidationPipe globally for automatic DTO validation with field-level error details, and simplify the exception filter to remove instanceof mapping logic

**Tech Stack:** NestJS 10, class-validator, TypeScript 5, Jest

---

## File Structure

### Files to Modify

**Core Exception Handling:**
- `apps/mist/src/main.ts` - Enable global ValidationPipe, update Swagger docs
- `apps/mist/src/filters/all-exceptions.filter.ts` - Simplify exception handling, remove mapping logic
- `apps/mist/src/interceptors/transform.interceptor.ts` - Change `code` to `statusCode`, add `path` field

**Tests:**
- `apps/mist/src/filters/all-exceptions.filter.spec.ts` - Update 7 test assertions (code → statusCode)
- `apps/mist/src/interceptors/transform.interceptor.spec.ts` - Update assertions

**Constants:**
- `libs/constants/src/errors.ts` - Optional: group ERROR_MESSAGES by HTTP status code

### Files to Delete

- `libs/constants/src/http-errors.ts` - Remove custom error code enum and map
- `libs/constants/src/http-errors.spec.ts` - Remove associated tests

---

## Task 1: Preparation and Branch Setup

**Files:**
- None (git operations)

- [ ] **Step 1: Create feature branch**

```bash
git checkout -b feature/error-handling-refactor
```

- [ ] **Step 2: Verify current test suite passes**

```bash
cd apps/mist
pnpm test
```

Expected: All tests pass

- [ ] **Step 3: Backup current exception handling files**

```bash
mkdir -p /tmp/mist-backup-$(date +%Y%m%d)
cp apps/mist/src/filters/all-exceptions.filter.ts /tmp/mist-backup-$(date +%Y%m%d)/
cp apps/mist/src/interceptors/transform.interceptor.ts /tmp/mist-backup-$(date +%Y%m%d)/
cp libs/constants/src/http-errors.ts /tmp/mist-backup-$(date +%Y%m%d)/
```

- [ ] **Step 4: Commit branch setup**

```bash
git add -A
git commit -m "chore: setup feature branch for error handling refactor"
```

---

## Task 2: Enable Global ValidationPipe

**Files:**
- Modify: `apps/mist/src/main.ts:1-60`

**References:**
- NestJS ValidationPipe docs: https://docs.nestjs.com/techniques/validation
- class-validator decorators already present in DTOs

- [ ] **Step 1: Read current main.ts**

```bash
cat apps/mist/src/main.ts
```

Current content:
```typescript
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TransformInterceptor } from './interceptors/transform.interceptor';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 全局响应拦截器
  app.useGlobalInterceptors(new TransformInterceptor());

  // 全局异常过滤器
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger API Documentation configuration
  const config = new DocumentBuilder()
    .setTitle('Mist API')
    .setDescription(`Stock market analysis and alert system...`)
    .setVersion('2.0')
    .addTag('health', 'Health check endpoints')
    .addTag('indicator', 'Technical Indicators - MACD, RSI, KDJ, K-line data')
    .addTag('chan', 'Chan Theory Analysis - Merge K, Bi, Fenxing, Channel')
    .addTag('security v1', 'Security management endpoints (v1)')
    .addServer('http://localhost:8001', 'Local development')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(process.env.PORT ?? 8001);
}
bootstrap();
```

- [ ] **Step 2: Add ValidationPipe import**

Add after line 4:
```typescript
import { ValidationPipe } from '@nestjs/common';
```

- [ ] **Step 3: Enable global ValidationPipe**

Add after line 11 (after app.useGlobalFilters):
```typescript
  // 全局验证管道
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,              // 移除未定义的字段
    forbidNonWhitelisted: true,   // 如果有额外字段则抛错
    transform: true,               // 自动类型转换
    exceptionFactory: (errors) => {
      // 自定义验证错误格式（字段级错误）
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

- [ ] **Step 4: Run tests to verify no regressions**

```bash
cd apps/mist
pnpm test
```

Expected: All tests pass (DTO validation not yet tested)

- [ ] **Step 5: Test ValidationPipe manually**

```bash
cd apps/mist
pnpm run start:dev:mist
```

In another terminal:
```bash
curl -X POST http://localhost:8001/indicator/k \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "",
    "period": "invalid",
    "startDate": "not-a-number",
    "endDate": "not-a-number"
  }'
```

Expected: 400 status with field-level errors:
```json
{
  "success": false,
  "statusCode": 400,
  "message": "VALIDATION_ERROR",
  "errors": {
    "symbol": ["指数代码不能为空"],
    "period": ["周期必须是以下数值之一: ..."],
    "startDate": ["开始日期必须是13位时间戳数字"],
    "endDate": ["结束日期必须是13位时间戳数字"]
  },
  "timestamp": "...",
  "requestId": "...",
  "path": "/indicator/k"
}
```

- [ ] **Step 6: Stop dev server**

```bash
# Ctrl+C in the terminal running the server
```

- [ ] **Step 7: Commit ValidationPipe changes**

```bash
git add apps/mist/src/main.ts
git commit -m "feat: enable global ValidationPipe with field-level errors

- Add global ValidationPipe to main.ts
- Configure whitelist, forbidNonWhitelisted, transform
- Custom exceptionFactory for field-level validation errors
- Validation errors now include detailed field messages

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Refactor AllExceptionsFilter

**Files:**
- Modify: `apps/mist/src/filters/all-exceptions.filter.ts:1-95`

**References:**
- Current implementation at `apps/mist/src/filters/all-exceptions.filter.ts`
- ERROR_MESSAGES constant at `libs/constants/src/errors.ts`

- [ ] **Step 1: Read current filter implementation**

```bash
cat apps/mist/src/filters/all-exceptions.filter.ts
```

- [ ] **Step 2: Write failing test for new format**

Create test file `apps/mist/src/filters/all-exceptions.filter.spec.ts` (update existing):

```typescript
import { AllExceptionsFilter } from './all-exceptions.filter';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/core';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockHost: ArgumentsHost;
  let mockResponse: any;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as any;
  });

  describe('validation errors with field details', () => {
    it('should return 400 with field-level errors', () => {
      const exception = new BadRequestException({
        message: 'VALIDATION_ERROR',
        errors: { symbol: ['不能为空'], period: ['无效周期'] }
      });

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          statusCode: 400,
          message: 'VALIDATION_ERROR',
          errors: { symbol: ['不能为空'], period: ['无效周期'] }
        })
      );
    });
  });

  describe('HTTP status code extraction', () => {
    it('should return 404 for NotFoundException', () => {
      const exception = new NotFoundException('Data not found');

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          message: 'Data not found'
        })
      );
    });

    it('should return 500 for unexpected errors', () => {
      const exception = new Error('Unexpected error');

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          message: 'INTERNAL_SERVER_ERROR'
        })
      );
    });
  });

  describe('request path inclusion', () => {
    it('should include request path in response', () => {
      const exception = new NotFoundException('Data not found');

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/test'
        })
      );
    });
  });

  describe('request ID generation', () => {
    it('should generate unique request IDs', () => {
      const exception = new NotFoundException();
      mockHost.switchToHttp = jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      });

      filter.catch(exception, mockHost);

      const call = mockResponse.json.mock.calls[0][0];
      expect(call.requestId).toMatch(/^err-\d+-[a-z0-9]+$/);
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/mist
pnpm test filters/all-exceptions.filter.spec.ts
```

Expected: FAIL - old filter doesn't match new format

- [ ] **Step 4: Rewrite AllExceptionsFilter**

Replace entire content of `apps/mist/src/filters/all-exceptions.filter.ts`:

```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ERROR_MESSAGES } from '@app/constants';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.getStatusCode(exception);
    const exceptionResponse = exception instanceof HttpException
      ? exception.getResponse()
      : null;

    // 构建错误响应
    const errorResponse = {
      success: false,
      statusCode: status,
      message: this.extractMessage(exception, exceptionResponse),
      errors: this.extractErrors(exceptionResponse),
      timestamp: new Date().toISOString(),
      requestId: this.generateRequestId(),
      path: request.url,
    };

    // 记录错误日志
    this.logError(exception, errorResponse.requestId);

    response.status(status).json(errorResponse);
  }

  private getStatusCode(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    // TypeORM database errors
    if (this.isQueryFailedError(exception)) {
      return 500;
    }
    return 500;
  }

  private extractMessage(exception: unknown, exceptionResponse: any): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();

      // 如果响应是字符串
      if (typeof response === 'string') return response;

      // 如果响应是对象且包含 message 字段
      if (typeof response === 'object' && response) {
        // 对于 ValidationPipe 创建的异常（包含 errors 字段）
        if ('errors' in response && typeof response.errors === 'object') {
          return response.message || 'VALIDATION_ERROR';
        }
        // 对于其他异常
        if ('message' in response) {
          const msg = response.message;
          // 如果 message 是数组（NestJS 默认验证错误），返回通用消息
          if (Array.isArray(msg)) {
            return 'VALIDATION_ERROR';
          }
          // 如果是字符串，直接返回
          if (typeof msg === 'string') {
            return msg;
          }
        }
      }
      // 默认返回异常消息
      return exception.message;
    }
    return ERROR_MESSAGES.INTERNAL_SERVER_ERROR;
  }

  private extractErrors(exceptionResponse: any): Record<string, string[]> | null {
    if (!exceptionResponse || typeof exceptionResponse !== 'object') {
      return null;
    }

    // 提取字段级验证错误（由 ValidationPipe 的 exceptionFactory 创建）
    if ('errors' in exceptionResponse && typeof exceptionResponse.errors === 'object') {
      return exceptionResponse.errors;
    }

    return null;
  }

  private isQueryFailedError(exception: unknown): boolean {
    if (!exception || typeof exception !== 'object') {
      return false;
    }
    return (exception as any).name === 'QueryFailedError';
  }

  private logError(exception: unknown, requestId: string): void {
    const message = exception instanceof Error ? exception.message : String(exception);
    const stack = exception instanceof Error ? exception.stack : undefined;

    this.logger.error(
      `${requestId} - ${message}`,
      stack,
    );
  }

  private generateRequestId(): string {
    return `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

- [ ] **Step 5: Remove HTTP_ERROR_CODE_MAP import if present**

Check if import exists:
```bash
grep -n "HTTP_ERROR_CODE_MAP\|HttpErrorCode" apps/mist/src/filters/all-exceptions.filter.ts
```

If found, remove the import line

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd apps/mist
pnpm test filters/all-exceptions.filter.spec.ts
```

Expected: PASS - all new tests pass

- [ ] **Step 7: Run full test suite**

```bash
cd apps/mist
pnpm test
```

Expected: Some tests may fail (need to update other test files)

- [ ] **Step 8: Commit filter refactor**

```bash
git add apps/mist/src/filters/all-exceptions.filter.ts
git add apps/mist/src/filters/all-exceptions.filter.spec.ts
git commit -m "refactor: simplify AllExceptionsFilter to use HTTP status codes

- Remove HTTP_ERROR_CODE_MAP and custom error code mapping
- Extract message and errors directly from exceptions
- Add request.path to error responses
- Handle TypeORM QueryFailedError for database errors
- Support field-level validation errors from ValidationPipe

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Update TransformInterceptor

**Files:**
- Modify: `apps/mist/src/interceptors/transform.interceptor.ts:1-37`

- [ ] **Step 1: Read current interceptor**

```bash
cat apps/mist/src/interceptors/transform.interceptor.ts
```

- [ ] **Step 2: Write failing test for new format**

Update `apps/mist/src/interceptors/transform.interceptor.spec.ts`:

```typescript
import { TransformInterceptor } from './transform.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/core';
import { of } from 'rxjs';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
    mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({ url: '/test' }),
      }),
    } as any;
  });

  it('should add statusCode instead of code', () => {
    const mockCallHandler = {
      handle: jest.fn().mockReturnValue(of({ data: 'test' })),
    };

    interceptor.intercept(mockContext, mockCallHandler as any).subscribe((result) => {
      expect(result).toHaveProperty('statusCode', 200);
      expect(result).not.toHaveProperty('code');
    });
  });

  it('should include request path', () => {
    const mockCallHandler = {
      handle: jest.fn().mockReturnValue(of({ data: 'test' })),
    };

    interceptor.intercept(mockContext, mockCallHandler as any).subscribe((result) => {
      expect(result).toHaveProperty('path', '/test');
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/mist
pnpm test interceptors/transform.interceptor.spec.ts
```

Expected: FAIL - old interceptor uses `code` instead of `statusCode`

- [ ] **Step 4: Update TransformInterceptor**

Replace entire content of `apps/mist/src/interceptors/transform.interceptor.ts`:

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/response.interface';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const requestId = this.generateRequestId();
    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      map((data) => ({
        success: true,
        statusCode: 200,
        message: 'SUCCESS',
        data,
        timestamp: new Date().toISOString(),
        requestId,
        path: request.url,
      })),
    );
  }

  private generateRequestId(): string {
    return `http-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/mist
pnpm test interceptors/transform.interceptor.spec.ts
```

Expected: PASS

- [ ] **Step 6: Run full test suite**

```bash
cd apps/mist
pnpm test
```

Expected: All tests pass

- [ ] **Step 7: Commit interceptor changes**

```bash
git add apps/mist/src/interceptors/transform.interceptor.ts
git add apps/mist/src/interceptors/transform.interceptor.spec.ts
git commit -m "refactor: update TransformInterceptor to use statusCode

- Change 'code' field to 'statusCode' for consistency with error responses
- Add 'path' field to all successful responses for debugging

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Update Swagger Documentation

**Files:**
- Modify: `apps/mist/src/main.ts:17-42`

- [ ] **Step 1: Read current Swagger config**

```bash
sed -n '17,50p' apps/mist/src/main.ts
```

- [ ] **Step 2: Update API response format documentation**

Find and update the Swagger description section (around line 19-42):

```typescript
  const config = new DocumentBuilder()
    .setTitle('Mist API')
    .setDescription(
      `Stock market analysis and alert system - Technical indicators and Chan Theory analysis

## Unified Response Format

All HTTP endpoints return responses in a unified format.

**Success Response:**
\`\`\`json
{
  "success": true,
  "statusCode": 200,
  "message": "SUCCESS",
  "data": { /* actual response data */ },
  "timestamp": "2026-03-24T10:30:00.000Z",
  "requestId": "http-1710819800000-abc123xyz",
  "path": "/indicator/k"
}
\`\`\`

**Error Response:**
\`\`\`json
{
  "success": false,
  "statusCode": 400,
  "message": "VALIDATION_ERROR",
  "errors": {
    "symbol": ["指数代码不能为空"],
    "period": ["周期必须是以下数值之一: ..."]
  },
  "timestamp": "2026-03-24T10:30:00.000Z",
  "requestId": "err-1710819800000-def456uvw",
  "path": "/indicator/k"
}
\`\`\`

**HTTP Status Codes:**
- 200: Success
- 400: Bad Request (validation errors, invalid parameters)
- 404: Not Found (data not found)
- 500: Internal Server Error (database errors, unexpected errors)

## Multi-Data Source Support

This API supports multiple data sources for K-line data:

- **ef** - East Money (default)
- **tdx** - TongDaXin
- **mqmt** - MaQiMaTe

Most endpoints accept an optional \`source\` parameter to specify which data source to use.
If not provided, the default source for the application will be used.

## API Endpoints

- **Health**: \`GET /app/hello\` - Health check
- **Indicators**: \`POST /indicator/*\` - Technical indicators and K-line data (MACD, RSI, KDJ, K-line)
- **Chan Theory**: \`POST /chan/*\` - Chan Theory analysis (Merge K, Bi, Fenxing, Channel)
- **Security**: \`GET|POST|PUT /security/v1/*\` - Security management (v1 versioned)`,
    )
    .setVersion('2.0')
    .addTag('health', 'Health check endpoints')
    .addTag('indicator', 'Technical Indicators - MACD, RSI, KDJ, K-line data')
    .addTag('chan', 'Chan Theory Analysis - Merge K, Bi, Fenxing, Channel')
    .addTag('security v1', 'Security management endpoints (v1)')
    .addServer('http://localhost:8001', 'Local development')
    .build();
```

- [ ] **Step 3: Test Swagger UI**

```bash
cd apps/mist
pnpm run start:dev:mist
```

Open browser: http://localhost:8001/api-docs

Expected: API documentation shows new response format with `statusCode` instead of `code`

- [ ] **Step 4: Stop dev server**

```bash
# Ctrl+C in the terminal
```

- [ ] **Step 5: Commit Swagger documentation changes**

```bash
git add apps/mist/src/main.ts
git commit -m "docs: update Swagger documentation with new response format

- Update response format examples to use 'statusCode' instead of 'code'
- Add 'path' field to response examples
- Document field-level validation errors
- Document HTTP status codes (400/404/500)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Group ERROR_MESSAGES by HTTP Status

**Files:**
- Modify: `libs/constants/src/errors.ts:9-60`

- [ ] **Step 1: Read current ERROR_MESSAGES**

```bash
cat libs/constants/src/errors.ts
```

- [ ] **Step 2: Reorganize ERROR_MESSAGES by HTTP status code**

Replace the `ERROR_MESSAGES` constant:

```typescript
export const ERROR_MESSAGES = {
  // === 400 Bad Request ===
  VALIDATION_ERROR: 'Validation failed',
  INVALID_PARAMETER: 'Invalid parameter provided',
  INVALID_DATE_RANGE: 'Invalid date range',
  INVALID_PERIOD: 'Invalid period specified',
  INVALID_DATA_FORMAT: 'Invalid data format provided',

  // === 401 Unauthorized ===
  UNAUTHORIZED: 'Unauthorized access',

  // === 403 Forbidden ===
  FORBIDDEN: 'Forbidden',

  // === 404 Not Found ===
  DATA_NOT_FOUND: 'Requested data not found',
  INDEX_NOT_FOUND: 'Index not found',

  // === 409 Conflict ===
  CONFLICT: 'Resource conflict',

  // === 500 Internal Server Error ===
  INTERNAL_SERVER_ERROR: 'Internal server error occurred',
  DATABASE_ERROR: 'Database operation failed',
  EXTERNAL_SERVICE_ERROR: 'External service error',

  // === Service Initialization Errors ===
  INDICATOR_NOT_INITIALIZED: 'IndicatorService not initialized. Please try again later.',
  DATA_SERVICE_NOT_INITIALIZED: 'DataService not initialized. Please try again later.',

  // === Data Access Errors ===
  INDEX_PERIOD_REQUEST_FAILED: 'Failed to request index period data',
  INDEX_DAILY_REQUEST_FAILED: 'Failed to request index daily data',

  // === Validation Errors - Channel (Bi) ===
  BI_DATA_REQUIRED: 'Invalid input: bi data is required',
  BI_MUST_BE_ARRAY: 'Invalid input: bi must be an array',
  BI_ARRAY_EMPTY: 'Invalid input: bi array cannot be empty',
  BI_MISSING_HIGH_LOW: 'Invalid bi at index {{index}}: missing highest or lowest value',
  BI_INVALID_NUMBER_TYPE: 'Invalid bi at index {{index}}: highest and lowest must be numbers',
  BI_HIGH_MUST_EXCEED_LOW: 'Invalid bi at index {{index}}: highest must be greater than lowest',
  BI_MISSING_FENXING: 'Bi at index {{index}} is incomplete: missing fenxing information',
  BI_INVALID_DIRECTION: 'Invalid bi at index {{index}}: invalid direction value',

  // === General Validation Errors ===
  INSUFFICIENT_DATA: 'Insufficient data for calculation',

  // === API Errors ===
  RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please try again later.',
  INVALID_API_KEY: 'Invalid API key provided',

  // === Database Errors ===
  DATABASE_CONNECTION_FAILED: 'Failed to connect to database',
  DATABASE_QUERY_FAILED: 'Database query failed',

  // === External API Errors ===
  TRADING_DAY_CHECK_FAILED: 'Failed to check if date is a trading day',
  LOCAL_SERVICE_REQUEST_FAILED: 'Failed to request local service',

  // === General Errors ===
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
} as const;
```

- [ ] **Step 3: Run tests to verify no regressions**

```bash
cd libs/constants
pnpm test
```

Expected: All tests pass

- [ ] **Step 4: Commit ERROR_MESSAGES reorganization**

```bash
git add libs/constants/src/errors.ts
git commit -m "refactor: group ERROR_MESSAGES by HTTP status codes

- Organize error messages by HTTP status code (400/401/403/404/409/500)
- Add comments to indicate status code groupings
- Improve maintainability and clarity

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Remove Custom Error Codes

**Files:**
- Delete: `libs/constants/src/http-errors.ts`
- Delete: `libs/constants/src/http-errors.spec.ts`

- [ ] **Step 1: Verify no code references HTTP_ERROR_CODE_MAP**

```bash
grep -r "HTTP_ERROR_CODE_MAP\|HttpErrorCode" apps/mist/src --include="*.ts" | grep -v ".spec.ts"
```

Expected: No results (already removed in Task 3)

- [ ] **Step 2: Delete http-errors.ts**

```bash
rm libs/constants/src/http-errors.ts
```

- [ ] **Step 3: Delete http-errors.spec.ts**

```bash
rm libs/constants/src/http-errors.spec.ts
```

- [ ] **Step 4: Remove exports from constants index**

Check `libs/constants/src/index.ts`:
```bash
cat libs/constants/src/index.ts
```

Remove lines that export `HttpErrorCode`, `HTTP_ERROR_CODE_MAP`, or `HttpApiError` if present

- [ ] **Step 5: Run tests to verify no issues**

```bash
cd libs/constants
pnpm test
```

Expected: All tests pass

- [ ] **Step 6: Commit deletion of custom error codes**

```bash
git add libs/constants/src/http-errors.ts
git add libs/constants/src/http-errors.spec.ts
git add libs/constants/src/index.ts
git commit -m "refactor: remove custom error code system

- Delete HttpErrorCode enum and HTTP_ERROR_CODE_MAP
- Delete http-errors.ts and http-errors.spec.ts
- Remove exports from constants index
- Use HTTP status codes directly instead

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Final Testing and Validation

**Files:**
- None (testing)

- [ ] **Step 1: Run complete test suite**

```bash
cd apps/mist
pnpm test
```

Expected: All tests pass

- [ ] **Step 2: Run E2E tests**

```bash
cd apps/mist
pnpm run test:e2e
```

Expected: All E2E tests pass

- [ ] **Step 3: Start dev server for manual testing**

```bash
cd apps/mist
pnpm run start:dev:mist
```

- [ ] **Step 4: Test validation error endpoint**

```bash
curl -X POST http://localhost:8001/indicator/k \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "",
    "period": "invalid",
    "startDate": "invalid",
    "endDate": "invalid"
  }' | jq
```

Expected:
```json
{
  "success": false,
  "statusCode": 400,
  "message": "VALIDATION_ERROR",
  "errors": {
    "symbol": ["指数代码不能为空"],
    "period": ["周期必须是以下数值之一: ..."],
    "startDate": ["开始日期必须是13位时间戳数字"],
    "endDate": ["结束日期必须是13位时间戳数字"]
  },
  "timestamp": "...",
  "requestId": "err-...",
  "path": "/indicator/k"
}
```

- [ ] **Step 5: Test 404 error endpoint**

```bash
curl -X POST http://localhost:8001/indicator/k \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "INVALID_SYMBOL_999",
    "period": "daily",
    "startDate": 1609459200000,
    "endDate": 1609545600000
  }' | jq
```

Expected:
```json
{
  "success": false,
  "statusCode": 404,
  "message": "DATA_NOT_FOUND",
  "errors": null,
  "timestamp": "...",
  "requestId": "err-...",
  "path": "/indicator/k"
}
```

- [ ] **Step 6: Test success response format**

```bash
curl -X POST http://localhost:8001/indicator/k \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "000001",
    "period": "daily",
    "startDate": 1609459200000,
    "endDate": 1609545600000
  }' | jq | head -20
```

Expected:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "SUCCESS",
  "data": [...],
  "timestamp": "...",
  "requestId": "http-...",
  "path": "/indicator/k"
}
```

- [ ] **Step 7: Test Chan app integration (port 8008)**

```bash
# In another terminal
cd apps/chan
pnpm run start:dev:chan
```

```bash
curl -X POST http://localhost:8008/chan/bi \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "000001",
    "period": "daily"
  }' | jq | head -20
```

Expected: Chan app endpoints work correctly with new filter

- [ ] **Step 8: Stop dev servers**

```bash
# Ctrl+C in both terminals
```

- [ ] **Step 9: Verify Swagger documentation**

Open browser: http://localhost:8001/api-docs

Check that response format examples are correct

- [ ] **Step 10: Commit final testing validation**

```bash
git add -A
git commit -m "test: validate complete error handling refactor

- All unit tests pass
- All E2E tests pass
- Manual API testing validates new format
- Chan app integration verified
- Swagger documentation updated

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Merge to Master

**Files:**
- None (git operations)

- [ ] **Step 1: Switch to master branch**

```bash
git checkout master
```

- [ ] **Step 2: Pull latest changes**

```bash
git pull origin master
```

- [ ] **Step 3: Merge feature branch**

```bash
git merge feature/error-handling-refactor
```

- [ ] **Step 4: Resolve any conflicts if present**

If conflicts occur:
```bash
# Edit conflicted files
git add <resolved-files>
git commit
```

- [ ] **Step 5: Run final test suite**

```bash
cd apps/mist
pnpm test
```

Expected: All tests pass

- [ ] **Step 6: Push to origin**

```bash
git push origin master
```

- [ ] **Step 7: Delete feature branch**

```bash
git branch -d feature/error-handling-refactor
```

---

## Success Criteria

- [ ] All API endpoints use HTTP status codes (400/404/500) for error classification
- [ ] Validation errors return field-level details in `errors` object
- [ ] All unit tests pass
- [ ] All E2E tests pass
- [ ] Chan app integration unaffected
- [ ] Swagger documentation updated
- [ ] Code complexity reduced (no instanceof mapping)
- [ ] Custom error codes removed (HTTP_ERROR_CODE_MAP deleted)

---

## Rollback Procedure

If critical issues are discovered:

1. **Revert the merge commit:**
   ```bash
   git revert <merge-commit-hash>
   git push origin master
   ```

2. **Restore deleted files if needed:**
   ```bash
   git checkout <commit-before-deletion>~1 -- libs/constants/src/http-errors.ts
   git checkout <commit-before-deletion>~1 -- libs/constants/src/http-errors.spec.ts
   git commit -m "rollback: restore custom error codes"
   ```

3. **Verify rollback:**
   ```bash
   pnpm test
   # Run manual API tests
   ```

---

## Notes

- **TDD Approach**: Each task follows Test-Driven Development - write failing test first, then implement
- **Frequent Commits**: Each task commits independently for easy rollback
- **Incremental Changes**: Changes are staged to minimize risk
- **Backward Compatibility**: Chan app automatically benefits from changes via ChanModule import
- **Frontend Impact**: None - frontend only uses HTTP status codes, not `code` field
