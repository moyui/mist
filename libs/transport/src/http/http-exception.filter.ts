import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiErrorDto } from './api-error.dto';
import {
  defaultHttpCode,
  defaultHttpMessage,
  isPublicHttpCode,
} from './http-code';
import { HttpRequestContextService } from './http-request-context.service';
import { requestPath } from './http-response.interceptor';

type StructuredHttpException = Record<string, unknown>;

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly requestContext: HttpRequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const status = this.statusOf(exception);
    const raw = this.responseOf(exception);
    const structuredException = this.hasErrorStatus(exception);
    const explicitCode =
      structuredException && isPublicHttpCode(raw?.code) ? raw.code : undefined;
    const validation =
      status === 400 &&
      explicitCode === 'VALIDATION_ERROR' &&
      isValidationErrors(raw?.errors);
    const code = validation
      ? 'VALIDATION_ERROR'
      : (explicitCode ?? defaultHttpCode(status));
    const allowStructuredDetails = explicitCode !== undefined;
    const requestId =
      this.requestContext.getRequestId() ??
      this.requestContext.createHttpRequestId();

    const body: ApiErrorDto<string, unknown> = {
      success: false,
      statusCode: status,
      code,
      message: validation
        ? 'Request validation failed'
        : this.messageOf(status, exception, raw, allowStructuredDetails),
      ...(allowStructuredDetails && raw && 'data' in raw
        ? { data: raw.data }
        : {}),
      ...(validation ? { errors: raw.errors as Record<string, string[]> } : {}),
      timestamp: new Date().toISOString(),
      requestId,
      path: requestPath(request),
    };

    response.setHeader('X-Request-Id', requestId);
    this.log(exception, request, status, code, requestId);
    response.status(status).json(body);
  }

  private statusOf(exception: unknown): number {
    if (!this.hasErrorStatus(exception)) return 500;
    const status = exception.getStatus();
    return status;
  }

  private hasErrorStatus(exception: unknown): exception is HttpException {
    if (!(exception instanceof HttpException)) return false;
    const status = exception.getStatus();
    return Number.isInteger(status) && status >= 400 && status <= 599;
  }

  private responseOf(exception: unknown): StructuredHttpException | undefined {
    if (!(exception instanceof HttpException)) return undefined;
    const value = exception.getResponse();
    return isRecord(value) ? value : undefined;
  }

  private messageOf(
    status: number,
    exception: unknown,
    raw: StructuredHttpException | undefined,
    allowStructuredDetails: boolean,
  ): string {
    if (status >= 500) {
      return allowStructuredDetails && typeof raw?.message === 'string'
        ? raw.message
        : defaultHttpMessage(status);
    }

    if (typeof raw?.message === 'string') return raw.message;
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') return response;
    }
    return defaultHttpMessage(status);
  }

  private log(
    exception: unknown,
    request: Request,
    status: number,
    code: string,
    requestId: string,
  ): void {
    const summary = `${request.method ?? 'UNKNOWN'} ${requestPath(request)} status=${status} code=${code} requestId=${requestId}`;
    if (status < 500) {
      this.logger.warn(summary);
      return;
    }
    this.logger.error(summary, exceptionTrace(exception));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidationErrors(value: unknown): value is Record<string, string[]> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (messages) =>
        Array.isArray(messages) &&
        messages.length > 0 &&
        messages.every((message) => typeof message === 'string'),
    )
  );
}

function exceptionTrace(exception: unknown): string | undefined {
  if (!(exception instanceof Error)) return undefined;
  const traces: string[] = [];
  const visited = new Set<Error>();
  let current: Error | undefined = exception;

  while (current && !visited.has(current) && traces.length < 8) {
    visited.add(current);
    traces.push(current.stack ?? `${current.name}: ${current.message}`);
    const cause: unknown = (current as Error & { cause?: unknown }).cause;
    current = cause instanceof Error ? cause : undefined;
  }

  return traces.join('\nCaused by: ');
}
