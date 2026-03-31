# HTTP统一响应格式实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为mist应用创建统一的HTTP接口响应格式，包括响应拦截器、异常过滤器和错误码映射

**Architecture:** 通过NestJS全局拦截器自动包装成功响应，全局异常过滤器捕获并转换所有异常为统一格式，在libs/constants中定义错误码枚举和数字映射

**Tech Stack:** NestJS, TypeScript, RxJS, Express

---

## File Structure

```
mist/
├── libs/constants/src/
│   ├── http-errors.ts                    # 新建：HTTP错误码枚举和映射
│   └── index.ts                          # 修改：导出http-errors
├── apps/mist/src/common/
│   ├── interfaces/
│   │   └── response.interface.ts         # 新建：响应接口定义
│   ├── interceptors/
│   │   ├── transform.interceptor.ts      # 新建：响应拦截器
│   │   └── transform.interceptor.spec.ts # 新建：拦截器测试
│   ├── filters/
│   │   ├── all-exceptions.filter.ts      # 新建：全局异常过滤器
│   │   └── all-exceptions.filter.spec.ts # 新建：过滤器测试
│   └── dto/
│       └── api-response.dto.ts           # 新建：Swagger响应DTO
└── apps/mist/src/main.ts                 # 修改：注册拦截器和过滤器
```

---

## Phase 1: 基础设施搭建

### Task 1: 创建响应接口定义

**Files:**
- Create: `apps/mist/src/common/interfaces/response.interface.ts`

- [ ] **Step 1: 创建响应接口文件**

```typescript
export interface ApiResponse<T = any> {
  success: boolean;
  code: number;
  message: string;
  data?: T;
  timestamp: string;
  requestId: string;
}

export interface ApiError {
  success: false;
  code: number;
  message: string;
  timestamp: string;
  requestId: string;
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/mist/src/common/interfaces/response.interface.ts
git commit -m "feat: add unified API response interfaces

Define ApiResponse<T> and ApiError interfaces for consistent
HTTP response format across all endpoints."
```

---

### Task 2: 创建HTTP错误码定义

**Files:**
- Create: `libs/constants/src/http-errors.ts`
- Modify: `libs/constants/src/index.ts`

- [ ] **Step 1: 创建错误码枚举和映射**

```typescript
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
    Object.entries(HTTP_ERROR_CODE_MAP).map(([key, value]) => [value, key])
  );
```

- [ ] **Step 2: 更新index.ts导出**

在 `libs/constants/src/index.ts` 添加：

```typescript
export * from './http-errors';
```

- [ ] **Step 3: 运行构建验证**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm run build
```

Expected: 构建成功，无TypeScript错误

- [ ] **Step 4: 提交**

```bash
git add libs/constants/src/http-errors.ts libs/constants/src/index.ts
git commit -m "feat: add HTTP error code definitions

- Add HttpErrorCode enum with 1xxx/2xxx/5xxx ranges
- Add HTTP_ERROR_CODE_MAP for numeric code mapping
- Add HttpApiError class for convenience"
```

---

### Task 3: 创建响应拦截器

**Files:**
- Create: `apps/mist/src/common/interceptors/transform.interceptor.ts`
- Create: `apps/mist/src/common/interceptors/transform.interceptor.spec.ts`

- [ ] **Step 1: 创建拦截器测试文件**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { TransformInterceptor } from './transform.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<any>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransformInterceptor],
    }).compile();

    interceptor = module.get<TransformInterceptor>(TransformInterceptor);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should wrap data in ApiResponse format', (done) => {
    const context = {} as ExecutionContext;
    const data = { message: 'test data' };
    const next: CallHandler = {
      handle: () => of(data),
    };

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('code', 200);
      expect(result).toHaveProperty('message', 'SUCCESS');
      expect(result).toHaveProperty('data', data);
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('requestId');
      done();
    });
  });

  it('should generate unique requestId for each request', (done) => {
    const context = {} as ExecutionContext;
    const next: CallHandler = {
      handle: () => of({}),
    };

    const results: any[] = [];

    interceptor.intercept(context, next).subscribe((result) => {
      results.push(result);

      if (results.length === 2) {
        expect(results[0].requestId).not.toBe(results[1].requestId);
        done();
      }
    });

    interceptor.intercept(context, next).subscribe();
  });

  it('should generate valid ISO timestamp', (done) => {
    const context = {} as ExecutionContext;
    const next: CallHandler = {
      handle: () => of({}),
    };

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      done();
    });
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /Users/xiyugao/code/mist/mist/apps/mist
pnpm test -- transform.interceptor.spec.ts
```

Expected: FAIL - 文件不存在

- [ ] **Step 3: 创建拦截器实现**

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/response.interface';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const requestId = this.generateRequestId();

    return next.handle().pipe(
      map(data => ({
        success: true,
        code: 200,
        message: 'SUCCESS',
        data,
        timestamp: new Date().toISOString(),
        requestId,
      }))
    );
  }

  private generateRequestId(): string {
    return `http-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd /Users/xiyugao/code/mist/mist/apps/mist
pnpm test -- transform.interceptor.spec.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/mist/src/common/interceptors/
git commit -m "feat: add response transform interceptor

- Auto-wrap all successful responses in unified format
- Generate unique requestId for each request
- Add ISO 8601 timestamp

Tests:
- Verify response format structure
- Verify requestId uniqueness
- Verify timestamp format"
```

---

### Task 4: 创建全局异常过滤器

**Files:**
- Create: `apps/mist/src/common/filters/all-exceptions.filter.ts`
- Create: `apps/mist/src/common/filters/all-exceptions.filter.spec.ts`

- [ ] **Step 1: 创建过滤器测试文件**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { HttpException, BadRequestException, NotFoundException, UnauthorizedException, ForbiddenException, ConflictException } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/core';
import { Response } from 'express';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockResponse: jest.Mocked<Response>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AllExceptionsFilter],
    }).compile();

    filter = module.get<AllExceptionsFilter>(AllExceptionsFilter);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as any;
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should handle BadRequestException with code 1001', () => {
    const exception = new BadRequestException('Invalid parameter');
    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as any;

    filter.catch(exception, host);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 1001,
      })
    );
  });

  it('should handle NotFoundException with code 2001', () => {
    const exception = new NotFoundException('Resource not found');
    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as any;

    filter.catch(exception, host);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 2001,
      })
    );
  });

  it('should handle UnauthorizedException with code 1005', () => {
    const exception = new UnauthorizedException('Unauthorized');
    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as any;

    filter.catch(exception, host);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 1005,
      })
    );
  });

  it('should handle ForbiddenException with code 1006', () => {
    const exception = new ForbiddenException('Forbidden');
    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as any;

    filter.catch(exception, host);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 1006,
      })
    );
  });

  it('should handle ConflictException with code 2004', () => {
    const exception = new ConflictException('Conflict');
    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as any;

    filter.catch(exception, host);

    expect(mockResponse.status).toHaveBeenCalledWith(409);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 2004,
      })
    );
  });

  it('should handle QueryFailedError with code 5001', () => {
    const exception = { name: 'QueryFailedError', message: 'Database error' };
    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as any;

    filter.catch(exception, host);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 5001,
      })
    );
  });

  it('should handle unknown exceptions with code 5000', () => {
    const exception = new Error('Unknown error');
    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as any;

    filter.catch(exception, host);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 5000,
      })
    );
  });

  it('should include timestamp and requestId', () => {
    const exception = new BadRequestException('Test');
    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({ url: '/test' }),
      }),
    } as any;

    filter.catch(exception, host);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: expect.any(String),
        requestId: expect.stringMatching(/^err-/),
      })
    );
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd /Users/xiyugao/code/mist/mist/apps/mist
pnpm test -- all-exceptions.filter.spec.ts
```

Expected: FAIL - 文件不存在

- [ ] **Step 3: 创建过滤器实现**

```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Response } from 'express';
import { HTTP_ERROR_CODE_MAP, HttpErrorCode } from '@libs/constants';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = this.generateRequestId();
    const statusCode = this.getStatusCode(exception);
    const errorCode = this.mapErrorCode(exception);
    const messageKey = this.getMessageKey(exception);

    // 记录错误日志
    this.logger.error(
      `${requestId} - ${messageKey}: ${exception.message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    // 返回统一错误格式
    response.status(statusCode).json({
      success: false,
      code: errorCode,
      message: messageKey,
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  private getStatusCode(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return 500;
  }

  private mapErrorCode(exception: unknown): number {
    // NestJS内置异常映射
    if (exception instanceof BadRequestException)
      return HTTP_ERROR_CODE_MAP[HttpErrorCode.INVALID_PARAMETER];
    if (exception instanceof NotFoundException)
      return HTTP_ERROR_CODE_MAP[HttpErrorCode.DATA_NOT_FOUND];
    if (exception instanceof UnauthorizedException)
      return HTTP_ERROR_CODE_MAP[HttpErrorCode.UNAUTHORIZED];
    if (exception instanceof ForbiddenException)
      return HTTP_ERROR_CODE_MAP[HttpErrorCode.FORBIDDEN];
    if (exception instanceof ConflictException)
      return HTTP_ERROR_CODE_MAP[HttpErrorCode.CONFLICT];

    // TypeORM数据库异常
    if (this.isQueryFailedError(exception))
      return HTTP_ERROR_CODE_MAP[HttpErrorCode.DATABASE_ERROR];

    // 默认服务器错误
    return HTTP_ERROR_CODE_MAP[HttpErrorCode.INTERNAL_SERVER_ERROR];
  }

  private getMessageKey(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') return response;
      if (typeof response === 'object') {
        return (response as any).message || 'INTERNAL_SERVER_ERROR';
      }
    }
    return 'INTERNAL_SERVER_ERROR';
  }

  private isQueryFailedError(exception: unknown): boolean {
    return (
      exception &&
      typeof exception === 'object' &&
      'name' in exception &&
      (exception as any).name === 'QueryFailedError'
    );
  }

  private generateRequestId(): string {
    return `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd /Users/xiyugao/code/mist/mist/apps/mist
pnpm test -- all-exceptions.filter.spec.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add apps/mist/src/common/filters/
git commit -m "feat: add global exception filter

- Catch all exceptions and convert to unified format
- Map NestJS exceptions to error codes (1xxx/2xxx/5xxx)
- Log errors with requestId for tracing
- Return consistent error response structure

Tests:
- Verify BadRequestException → 1001
- Verify NotFoundException → 2001
- Verify unknown exceptions → 5000
- Verify timestamp and requestId included"
```

---

### Task 5: 创建Swagger响应DTO

**Files:**
- Create: `apps/mist/src/common/dto/api-response.dto.ts`

- [ ] **Step 1: 创建Swagger DTO**

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto<T> {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 200 })
  code: number;

  @ApiProperty({ example: 'SUCCESS' })
  message: string;

  @ApiProperty({ required: false })
  data?: T;

  @ApiProperty({ example: '2026-03-19T10:30:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: 'http-1710819800000-abc123xyz' })
  requestId: string;
}

export class ApiErrorDto {
  @ApiProperty({ example: false })
  success: false;

  @ApiProperty({ example: 1001 })
  code: number;

  @ApiProperty({ example: 'INVALID_PARAMETER' })
  message: string;

  @ApiProperty({ example: '2026-03-19T10:30:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: 'err-1710819800000-def456uvw' })
  requestId: string;
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/mist/src/common/dto/api-response.dto.ts
git commit -m "feat: add Swagger DTOs for unified response format

Define ApiResponseDto and ApiErrorDto for API documentation."
```

---

## Phase 2: 单控制器试点测试

### Task 6: 单控制器试点测试（data.controller）

**目的**: 在全局注册前，先在单个controller上测试拦截器和过滤器

**Files:**
- Modify: `apps/mist/src/data/data.controller.ts`

- [ ] **Step 1: 在data.controller上添加拦截器和过滤器装饰器**

```typescript
import { UseInterceptors, UseFilters } from '@nestjs/common';
import { TransformInterceptor } from '../common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';

@Controller('data')
@UseInterceptors(TransformInterceptor)
@UseFilters(AllExceptionsFilter)
export class DataController {
  // ... 现有代码
}
```

- [ ] **Step 2: 运行data.controller测试**

```bash
cd /Users/xiyugao/code/mist/mist/apps/mist
pnpm test -- data.controller.spec.ts
```

Expected: 测试通过（响应格式已改变，断言需要更新）

- [ ] **Step 3: 手动测试单个endpoint**

```bash
curl http://localhost:8001/data/index
```

Expected: 返回统一格式的响应

- [ ] **Step 4: 如果测试通过，提交试点代码**

```bash
git add apps/mist/src/data/data.controller.ts
git commit -m "test: pilot unified response format on data.controller

- Apply TransformInterceptor and AllExceptionsFilter to data.controller
- Test unified format on single controller before global rollout"
```

- [ ] **Step 5: 如果有问题，回滚试点**

```bash
git revert HEAD
```

---

## Phase 3: 全局注册

### Task 7: 注册拦截器和过滤器

**Files:**
- Modify: `apps/mist/src/main.ts`

- [ ] **Step 1: 读取现有main.ts**

```bash
cat /Users/xiyugao/code/mist/mist/apps/mist/src/main.ts
```

- [ ] **Step 2: 添加导入语句**

在文件顶部添加：

```typescript
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
```

- [ ] **Step 3: 在bootstrap函数中注册**

在 `app = await NestFactory.create(AppModule)` 之后添加：

```typescript
  // 全局响应拦截器
  app.useGlobalInterceptors(new TransformInterceptor());

  // 全局异常过滤器
  app.useGlobalFilters(new AllExceptionsFilter());
```

- [ ] **Step 4: 验证应用启动**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm run start:dev:mist
```

Expected: 应用成功启动，无错误日志

- [ ] **Step 5: 手动测试响应格式**

```bash
curl -X POST http://localhost:8001/indicator/k \
  -H "Content-Type: application/json" \
  -d '{"symbol":"000001","startDate":"2024-01-01","endDate":"2024-01-05","daily":true}'
```

Expected: 响应包含 success, code, message, data, timestamp, requestId

- [ ] **Step 6: 提交**

```bash
git add apps/mist/src/main.ts
git commit -m "feat: register global interceptor and filter

- Register TransformInterceptor for unified response format
- Register AllExceptionsFilter for error handling
- All endpoints now return consistent API responses"
```

---

## Phase 4: 集成测试

### Task 8: 创建E2E集成测试

**Files:**
- Create: `apps/mist/test/unified-response.e2e-spec.ts`

- [ ] **Step 1: 创建E2E测试文件**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Unified Response Format (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/indicator/k (POST) should return unified success format', async () => {
    const response = await request(app.getHttpServer())
      .post('/indicator/k')
      .send({
        symbol: '000001',
        startDate: '2024-01-01',
        endDate: '2024-01-05',
        daily: true,
      })
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('code', 200);
    expect(response.body).toHaveProperty('message', 'SUCCESS');
    expect(response.body).toHaveProperty('data');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('requestId');
    expect(response.body.data).toBeInstanceOf(Array);
  });

  it('/indicator/k (POST) with invalid params should return unified error format', async () => {
    const response = await request(app.getHttpServer())
      .post('/indicator/k')
      .send({
        symbol: '',  // Invalid: empty symbol
        startDate: '2024-01-01',
        endDate: '2024-01-05',
      })
      .expect(400);

    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('code');
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('requestId');
  });

  it('/chan/merge-k (POST) should return unified format', async () => {
    const response = await request(app.getHttpServer())
      .post('/chan/merge-k')
      .send({
        k: [
          { id: 1, time: '2024-01-01', highest: 3200, lowest: 3100, open: 3150, close: 3180, symbol: '000001', amount: 1000 },
          { id: 2, time: '2024-01-02', highest: 3250, lowest: 3150, open: 3200, close: 3230, symbol: '000001', amount: 1000 },
        ],
      })
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('code', 200);
    expect(response.body).toHaveProperty('data');
  });

  it('should generate unique requestId for each request', async () => {
    const response1 = await request(app.getHttpServer())
      .post('/indicator/k')
      .send({ symbol: '000001', startDate: '2024-01-01', endDate: '2024-01-02', daily: true })
      .expect(200);

    const response2 = await request(app.getHttpServer())
      .post('/indicator/k')
      .send({ symbol: '000001', startDate: '2024-01-01', endDate: '2024-01-02', daily: true })
      .expect(200);

    expect(response1.body.requestId).not.toBe(response2.body.requestId);
  });
});
```

- [ ] **Step 2: 运行E2E测试**

```bash
cd /Users/xiyugao/code/mist/mist/apps/mist
pnpm test:e2e -- unified-response.e2e-spec.ts
```

Expected: 所有测试通过

- [ ] **Step 3: 提交**

```bash
git add apps/mist/test/unified-response.e2e-spec.ts
git commit -m "test: add E2E tests for unified response format

- Test success response format on /indicator/k
- Test error response format with invalid params
- Test unique requestId generation
- Verify all required fields present"
```

---

## Phase 5: 测试更新

### Task 9: 更新data.controller测试

**Files:**
- Modify: `apps/mist/src/data/data.controller.spec.ts`

- [ ] **Step 1: 读取现有测试**

```bash
cat /Users/xiyugao/code/mist/mist/apps/mist/src/data/data.controller.spec.ts
```

- [ ] **Step 2: 更新测试断言**

将所有直接检查data的断言改为检查包装后的响应：

例如，如果原有：
```typescript
expect(response.body).toEqual(expectedData);
```

改为：
```typescript
expect(response.body.success).toBe(true);
expect(response.body.code).toBe(200);
expect(response.body.data).toEqual(expectedData);
expect(response.body.timestamp).toBeDefined();
expect(response.body.requestId).toBeDefined();
```

- [ ] **Step 3: 运行测试**

```bash
cd /Users/xiyugao/code/mist/mist/apps/mist
pnpm test -- data.controller.spec.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/mist/src/data/data.controller.spec.ts
git commit -m "test: update data controller tests for unified response format

- Update assertions to check wrapped response structure
- Verify success, code, data, timestamp, requestId"
```

---

### Task 8: 更新indicator.controller测试

**Files:**
- Modify: `apps/mist/src/indicator/indicator.controller.spec.ts`

- [ ] **Step 1: 读取现有测试**

```bash
cat /Users/xiyugao/code/mist/mist/apps/mist/src/indicator/indicator.controller.spec.ts
```

- [ ] **Step 2: 更新测试断言**

类似Task 7，更新所有响应断言

- [ ] **Step 3: 运行测试**

```bash
cd /Users/xiyugao/code/mist/mist/apps/mist
pnpm test -- indicator.controller.spec.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/mist/src/indicator/indicator.controller.spec.ts
git commit -m "test: update indicator controller tests for unified response format"
```

---

### Task 9: 更新chan.controller测试

**Files:**
- Modify: `apps/mist/src/chan/chan.controller.spec.ts`

- [ ] **Step 1: 读取现有测试**

```bash
cat /Users/xiyugao/code/mist/mist/apps/mist/src/chan/chan.controller.spec.ts
```

- [ ] **Step 2: 更新测试断言**

类似Task 7，更新所有响应断言

- [ ] **Step 3: 运行测试**

```bash
cd /Users/xiyugao/code/mist/mist/apps/mist
pnpm test -- chan.controller.spec.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/mist/src/chan/chan.controller.spec.ts
git commit -m "test: update chan controller tests for unified response format"
```

---

## Phase 4: 验证和文档

### Task 10: 运行完整测试套件

**Files:**
- None (run commands only)

- [ ] **Step 1: 运行所有单元测试**

```bash
cd /Users/xiyugao/code/mist/mist/apps/mist
pnpm test
```

Expected: 全部通过

- [ ] **Step 2: 运行所有E2E测试**

```bash
cd /Users/xiyugao/code/mist/mist/apps/mist
pnpm test:e2e
```

Expected: 全部通过（如果存在E2E测试）

- [ ] **Step 3: 运行构建**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm run build
```

Expected: 构建成功

- [ ] **Step 4: 代码格式化**

```bash
cd /Users/xiyugao/code/mist/mist
pnpm run format
```

Expected: 格式化完成

---

### Task 11: 更新API文档

**Files:**
- Modify: `apps/mist/CLAUDE.md`

- [ ] **Step 1: 在CLAUDE.md中添加响应格式说明**

在 "API Endpoints" 部分添加：

```markdown
### Unified Response Format

All HTTP endpoints return responses in a unified format:

**Success Response:**
```json
{
  "success": true,
  "code": 200,
  "message": "SUCCESS",
  "data": { /* actual response data */ },
  "timestamp": "2026-03-19T10:30:00.000Z",
  "requestId": "http-1710819800000-abc123xyz"
}
```

**Error Response:**
```json
{
  "success": false,
  "code": 1001,
  "message": "INVALID_PARAMETER",
  "timestamp": "2026-03-19T10:30:00.000Z",
  "requestId": "err-1710819800000-def456uvw"
}
```

**Error Code Ranges:**
- `200`: Success
- `1xxx`: Client errors (parameter validation, format errors)
- `2xxx`: Business errors (data not found, insufficient data)
- `5xxx`: Server errors (database, external services)
```

- [ ] **Step 2: 提交**

```bash
git add apps/mist/CLAUDE.md
git commit -m "docs: document unified HTTP response format

- Add response format examples
- Document error code ranges
- Update API documentation"
```

---

### Task 13: 创建迁移指南

**Files:**
- Create: `mist/docs/plans/2026-03-19-http-response-format-migration-guide.md`

- [ ] **Step 1: 创建迁移指南文档**

```markdown
# HTTP响应格式迁移指南

## 前端适配指南

### 响应格式变更

**旧格式:**
```typescript
const data = await response.json();
```

**新格式:**
```typescript
const { success, code, data, message } = await response.json();

if (!success) {
  // 处理错误
  console.error(`Error ${code}: ${message}`);
  return;
}

// 使用data
```

### 错误码映射

| Code | 说明 | 前端处理建议 |
|------|------|------------|
| 200 | 成功 | 正常处理数据 |
| 1001 | 参数错误 | 提示用户检查输入 |
| 1002 | 日期范围错误 | 提示用户选择有效日期范围 |
| 2001 | 数据不存在 | 提示用户数据未找到 |
| 5000 | 服务器错误 | 提示用户稍后重试 |

### 国际化支持

前端可根据message字段进行翻译：

```typescript
const errorMessages = {
  INVALID_PARAMETER: '参数错误',
  DATA_NOT_FOUND: '数据不存在',
  INTERNAL_SERVER_ERROR: '服务器内部错误',
};

const displayMessage = errorMessages[message] || message;
```

### 示例代码

```typescript
async function fetchIndicatorData(params) {
  const response = await fetch('/api/indicator/macd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const result = await response.json();

  if (!result.success) {
    // 显示错误提示
    showError(result.message);
    return null;
  }

  // 使用返回的数据
  return result.data;
}
```

## 测试建议

1. 测试所有API调用
2. 验证错误处理
3. 检查loading状态
4. 验证数据显示
```

- [ ] **Step 2: 提交**

```bash
git add docs/plans/2026-03-19-http-response-format-migration-guide.md
git commit -m "docs: add frontend migration guide for HTTP response format

- Provide code examples for frontend adaptation
- Document error code mappings
- Include internationalization guidance"
```

---

## Success Criteria

完成后验证：

- ✅ 所有HTTP接口返回统一格式
- ✅ 错误码正确映射（1xxx/2xxx/5xxx）
- ✅ 所有测试通过
- ✅ 应用正常启动和运行
- ✅ 文档已更新
- ✅ 迁移指南已创建

---

## Rollback Plan

如果出现问题：

1. 回滚到实施前的commit：
   ```bash
   git revert <commit-hash>
   ```

2. 或者回滚到特定分支：
   ```bash
   git checkout <previous-branch>
   ```

3. 重新部署旧版本

---

## Notes

- 所有组件遵循TDD原则（先写测试，再实现）
- 每个任务独立可测试
- 频繁提交，每完成一个文件就提交
- 保持代码简洁，避免过度设计
