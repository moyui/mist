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
import { HTTP_ERROR_CODE_MAP, HttpErrorCode } from '@app/constants';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const requestId = this.generateRequestId();
    const statusCode = this.getStatusCode(exception);
    const errorCode = this.mapErrorCode(exception);
    const messageKey = this.getMessageKey(exception);

    // 记录错误日志
    this.logger.error(
      `${requestId} - ${messageKey}: ${exception instanceof Error ? exception.message : String(exception)}`,
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
    if (!exception || typeof exception !== 'object') {
      return false;
    }
    return (exception as any).name === 'QueryFailedError';
  }

  private generateRequestId(): string {
    return `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
