# HTTP统一响应格式设计文档

**创建日期**: 2026-03-19
**项目**: Mist - 智能股票市场分析与预警系统
**状态**: 设计阶段

---

## 目标

为mist应用创建统一的HTTP接口响应格式，与MCP接口保持部分字段统一，提升API的一致性和可维护性。

---

## 响应格式定义

### 成功响应

```typescript
{
  success: true,
  code: 200,
  message: "SUCCESS",
  data: T,                    // 业务数据
  timestamp: string,          // ISO 8601格式
  requestId: string           // UUID
}
```

### 失败响应

```typescript
{
  success: false,
  code: number,               // 错误码（1001-5999）
  message: string,            // 错误码key（如"INVALID_PARAMETER"）
  timestamp: string,
  requestId: string
}
```

### 错误码范围

| 范围 | 类型 | 说明 |
|------|------|------|
| 200 | 成功 | 操作成功 |
| 1xxx | 客户端错误 | 参数错误、数据验证失败 |
| 2xxx | 业务错误 | 数据不存在、状态冲突 |
| 5xxx | 服务器错误 | 数据库异常、外部服务失败 |

---

## 架构设计

### 核心组件

1. **响应拦截器** (`TransformInterceptor`)
   - 自动包装所有成功响应为统一格式
   - 生成唯一requestId
   - 添加时间戳

2. **全局异常过滤器** (`AllExceptionsFilter`)
   - 捕获所有异常
   - 映射到统一错误码
   - 记录错误日志

3. **错误码定义** (`http-errors.ts`)
   - 在`libs/constants`中定义
   - 枚举 + 数字映射
   - 复用MCP错误码语义

4. **公共DTO** (`ApiResponse<T>`)
   - 统一响应的TypeScript类型
   - 泛型支持

### 数据流

```
Controller → Service → 返回数据
                ↓
    [响应拦截器] 自动包装
                ↓
    { success, code, message, data, timestamp, requestId }

异常发生 → [全局过滤器] → 映射错误码 → 统一格式返回
```

---

## 文件结构

```
mist/
├── libs/constants/src/
│   ├── http-errors.ts                  # HTTP错误码定义和映射
│   └── index.ts                        # 导出
├── apps/mist/src/common/
│   ├── interceptors/
│   │   └── transform.interceptor.ts    # 响应拦截器
│   ├── filters/
│   │   └── all-exceptions.filter.ts    # 全局异常过滤器
│   ├── dtos/
│   │   └── response.dto.ts             # 统一响应DTO
│   └── interfaces/
│       └── response.interface.ts       # 响应接口定义
└── apps/mist/src/main.ts               # 注册拦截器和过滤器
```

---

## 实现细节

### 1. 响应拦截器

**文件**: `apps/mist/src/common/interceptors/transform.interceptor.ts`

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

### 2. 全局异常过滤器

**文件**: `apps/mist/src/common/filters/all-exceptions.filter.ts`

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
import { Response, Request } from 'express';

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
      exception.stack,
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
    if (exception instanceof BadRequestException) return 1001;
    if (exception instanceof NotFoundException) return 2001;
    if (exception instanceof UnauthorizedException) return 1005;
    if (exception instanceof ForbiddenException) return 1006;
    if (exception instanceof ConflictException) return 2004;

    // TypeORM数据库异常
    if (this.isQueryFailedError(exception)) return 5001;

    // 默认服务器错误
    return 5000;
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

### 3. 错误码定义

**文件**: `libs/constants/src/http-errors.ts`

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
 * Reverse lookup: numeric code to error code enum
 */
export const HTTP_CODE_TO_ENUM: Record<number, HttpErrorCode> =
  Object.fromEntries(
    Object.entries(HTTP_ERROR_CODE_MAP).map(([key, value]) => [value, key])
  );

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
```

**更新导出**: `libs/constants/src/index.ts`

```typescript
export * from './errors';
export * from './mcp-errors';
export * from './http-errors';
```

### 4. 响应接口定义

**文件**: `apps/mist/src/common/interfaces/response.interface.ts`

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

### 5. 注册到main.ts

**文件**: `apps/mist/src/main.ts`

```typescript
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 全局响应拦截器
  app.useGlobalInterceptors(new TransformInterceptor());

  // 全局异常过滤器
  app.useGlobalFilters(new AllExceptionsFilter());

  // 全局验证管道（已有）
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT || 8001);
}
bootstrap();
```

---

## 渐进式迁移策略

### 阶段1：基础设施搭建（不影响现有功能）

1. 创建文件结构
   - `common/interceptors/`
   - `common/filters/`
   - `common/dtos/`
   - `common/interfaces/`

2. 实现核心组件
   - `TransformInterceptor`
   - `AllExceptionsFilter`
   - `ApiResponse` 接口

3. 定义错误码
   - `libs/constants/src/http-errors.ts`

4. **暂时不注册到main.ts**，先单元测试

### 阶段2：单个Controller测试迁移

选择 `data.controller.ts` 作为测试：

1. 创建特性分支 `feature/unified-response-format`
2. 注册拦截器和过滤器到main.ts
3. 运行相关测试
4. 手动验证响应格式
5. 如有问题，立即回滚

### 阶段3：批量迁移

按以下顺序迁移：

1. `data.controller.ts` （最简单）
2. `indicator.controller.ts` （中等复杂度）
3. `chan.controller.ts` （最复杂）

每个Controller迁移后：
- 运行单元测试
- 运行集成测试
- 更新测试断言以匹配新格式

### 阶段4：前端适配

前端需要适配新的响应格式：

```typescript
// 旧格式
const data = await response.json();

// 新格式
const { success, code, data, message } = await response.json();
if (!success) {
  // 处理错误
  console.error(`Error ${code}: ${message}`);
  return;
}
// 使用data
```

### 回滚策略

- 每个阶段都在独立分支
- 出问题立即回滚到上一版本
- 保持所有测试通过
- 通过feature flag控制启用/禁用

---

## 错误码映射表

| 异常类型 | HTTP状态码 | 业务错误码 | 说明 |
|---------|-----------|-----------|------|
| `BadRequestException` | 400 | 1001 | 参数验证失败 |
| `UnauthorizedException` | 401 | 1005 | 未授权 |
| `ForbiddenException` | 403 | 1006 | 禁止访问 |
| `NotFoundException` | 404 | 2001 | 资源不存在 |
| `ConflictException` | 409 | 2004 | 状态冲突 |
| `QueryFailedError` | 500 | 5001 | 数据库错误 |
| 其他异常 | 500 | 5000 | 服务器错误 |

---

## 测试策略

### 单元测试

1. **拦截器测试**
   - 验证响应格式正确
   - 验证requestId生成
   - 验证时间戳格式

2. **过滤器测试**
   - 验证各种异常类型映射
   - 验证错误码正确
   - 验证日志记录

### 集成测试

1. 端到端测试现有API
2. 验证响应格式符合定义
3. 验证错误处理正确

### 手动测试

1. 使用Postman/curl测试各个endpoint
2. 验证成功响应格式
3. 验证各种错误场景

---

## 示例

### 成功响应示例

```http
POST /indicator/macd
Content-Type: application/json

{
  "symbol": "000001",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "daily": true
}
```

```json
{
  "success": true,
  "code": 200,
  "message": "SUCCESS",
  "data": [
    {
      "macd": 12.34,
      "signal": 10.56,
      "histogram": 1.78,
      "symbol": "000001",
      "time": "2024-01-02T00:00:00.000Z",
      "close": 3200.5
    }
  ],
  "timestamp": "2026-03-19T10:30:00.000Z",
  "requestId": "http-1710819800000-abc123xyz"
}
```

### 失败响应示例

```http
POST /indicator/macd
Content-Type: application/json

{
  "symbol": "",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31"
}
```

```json
{
  "success": false,
  "code": 1001,
  "message": "INVALID_PARAMETER",
  "timestamp": "2026-03-19T10:30:00.000Z",
  "requestId": "err-1710819800000-def456uvw"
}
```

---

## 与MCP接口对比

| 字段 | HTTP接口 | MCP接口 | 说明 |
|------|---------|---------|------|
| success | ✓ | ✓ | 完全一致 |
| code | 数字(200/1001/2001) | 字符串(SUCCESS) | HTTP用数字，MCP用字符串 |
| message | 错误码key | 详细描述或建议 | HTTP前端翻译，MCP给AI用 |
| data | ✓ | ✓ | 业务数据 |
| suggestions | ✗ | ✓ | MCP特有，AI恢复建议 |
| timestamp | ✓ | ✗ | HTTP特有，用于追踪 |
| requestId | ✓ | ✗ | HTTP特有，用于日志追踪 |

---

## 未来扩展

### 分页支持（暂不实现）

当需要分页时，data字段结构：

```typescript
{
  success: true,
  code: 200,
  message: "SUCCESS",
  data: {
    items: [...],
    pagination: {
      page: 1,
      pageSize: 100,
      total: 500,
      totalPages: 5
    }
  },
  timestamp: "...",
  requestId: "..."
}
```

### 国际化支持

前端根据message key进行翻译：

```typescript
// 前端
const errorMessages = {
  INVALID_PARAMETER: '参数错误',
  DATA_NOT_FOUND: '数据不存在',
  // ...
};

const displayMessage = errorMessages[response.message] || response.message;
```

---

## 注意事项

1. **向后兼容**：旧格式客户端需要适配新格式
2. **测试更新**：所有测试需要更新断言
3. **文档更新**：API文档需要更新响应示例
4. **监控**：部署后监控错误率，确保无回归
5. **性能**：拦截器和过滤器不应影响性能

---

## 参考资料

- NestJS Interceptors: https://docs.nestjs.com/interceptors
- NestJS Exception Filters: https://docs.nestjs.com/exception-filters
- 现有MCP错误码定义: `libs/constants/src/mcp-errors.ts`
- 现有错误消息常量: `libs/constants/src/errors.ts`
