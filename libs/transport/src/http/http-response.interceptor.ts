import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable, map } from 'rxjs';
import { ApiErrorDto } from './api-error.dto';
import { ApiResponseDto } from './api-response.dto';
import { HttpBusinessRejection } from './http-business-rejection';
import { HttpRequestContextService } from './http-request-context.service';
import { HTTP_RESPONSE_MESSAGE } from './http-response-message.decorator';

@Injectable()
export class HttpResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponseDto<T> | ApiErrorDto>
{
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContext: HttpRequestContextService,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponseDto<T> | ApiErrorDto> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      map((data) => {
        const requestId = this.ensureRequestId(response);
        if (data instanceof HttpBusinessRejection) {
          response.status(200);
          return {
            success: false,
            statusCode: 200,
            code: data.code,
            message: data.message,
            ...(data.data === undefined ? {} : { data: data.data }),
            timestamp: new Date().toISOString(),
            requestId,
            path: requestPath(request),
          };
        }

        if (response.statusCode === 204) return undefined as never;

        return {
          success: true,
          statusCode: response.statusCode,
          message:
            this.reflector.getAllAndOverride<string>(HTTP_RESPONSE_MESSAGE, [
              context.getHandler(),
              context.getClass(),
            ]) ?? 'SUCCESS',
          data: data === undefined ? null : data,
          timestamp: new Date().toISOString(),
          requestId,
          path: requestPath(request),
        } as ApiResponseDto<T>;
      }),
    );
  }

  private ensureRequestId(response: Response): string {
    const requestId =
      this.requestContext.getRequestId() ??
      this.requestContext.createHttpRequestId();
    if (!response.hasHeader('X-Request-Id')) {
      response.setHeader('X-Request-Id', requestId);
    }
    return requestId;
  }
}

export function requestPath(request: Pick<Request, 'path' | 'url'>): string {
  if (request.path) return request.path;
  return request.url?.split('?')[0] || '/';
}
