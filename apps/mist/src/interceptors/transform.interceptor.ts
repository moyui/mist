import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/response.interface';
import { formatISO } from 'date-fns';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const requestId = this.generateRequestId();

    return next.handle().pipe(
      map((data) => ({
        success: true,
        statusCode: 200,
        message: 'SUCCESS',
        data,
        timestamp: formatISO(new Date()),
        requestId,
        path: this.getPath(context),
      })),
    );
  }

  private generateRequestId(): string {
    return `http-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getPath(context: ExecutionContext): string {
    try {
      return context.switchToHttp().getRequest().url || '/';
    } catch {
      return '/';
    }
  }
}
