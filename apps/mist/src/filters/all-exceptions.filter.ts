import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Request } from 'express';
import { QueryFailedError } from 'typeorm';
import { ERROR_MESSAGES } from '@app/constants';
import { formatISO } from 'date-fns';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.getStatusCode(exception);
    const message = this.extractMessage(exception);
    const errors = this.extractErrors(exception);

    const errorResponse = {
      success: false,
      statusCode: status,
      message,
      errors,
      timestamp: formatISO(new Date()),
      requestId: this.generateRequestId(),
      path: request.url,
    };

    // Log error details
    this.logger.error(
      `${request.method} ${request.url} - Status: ${status} - Error: ${message}`,
      exception instanceof Error ? exception.stack : '',
    );

    response.status(status).json(errorResponse);
  }

  private getStatusCode(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    if (this.isQueryFailedError(exception)) {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private extractMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && response) {
        if ('errors' in response && typeof response.errors === 'object') {
          return (response as any).message || 'VALIDATION_ERROR';
        }
        if ('message' in response) {
          return (response as any).message;
        }
      }
      return exception.message;
    }
    if (this.isQueryFailedError(exception)) {
      return ERROR_MESSAGES.DATABASE_QUERY_FAILED;
    }
    return ERROR_MESSAGES.INTERNAL_SERVER_ERROR;
  }

  private extractErrors(exception: unknown): Record<string, string[]> | null {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && response && 'errors' in response) {
        return response.errors as Record<string, string[]>;
      }
    }
    return null;
  }

  private isQueryFailedError(error: unknown): error is QueryFailedError {
    return error instanceof Error && error.name === 'QueryFailedError';
  }

  private generateRequestId(): string {
    return `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
