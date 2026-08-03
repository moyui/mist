import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import {
  RPC_CORRELATION_ID_PATTERN,
  RPC_PATTERN_NAME_PATTERN,
  RpcInvalidRequestException,
  RpcTransportErrorV1,
} from './rpc-envelope';

@Catch()
@Injectable()
export class RpcExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(RpcExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): Observable<never> {
    const rpc = host.switchToRpc();
    const data = rpc.getData<unknown>();
    const context = rpc.getContext<unknown>();
    const message =
      exception instanceof RpcInvalidRequestException
        ? 'RPC_INVALID_REQUEST'
        : 'RPC_INTERNAL_ERROR';
    const safeContext = [
      `application=${process.env.npm_package_name ?? 'mist'}`,
      `pattern=${readPattern(context)}`,
      `correlationId=${readCorrelationId(data)}`,
      `code=${message}`,
    ].join(' ');
    this.logger.error(
      safeContext,
      exception instanceof RpcInvalidRequestException
        ? exception.stack
        : exceptionTrace(exception),
    );

    const wireError: RpcTransportErrorV1 = { status: 'error', message };
    return throwError(() => wireError);
  }
}

function readPattern(context: unknown): string {
  if (
    typeof context === 'object' &&
    context !== null &&
    'getPattern' in context &&
    typeof context.getPattern === 'function'
  ) {
    const pattern = context.getPattern();
    return typeof pattern === 'string' && RPC_PATTERN_NAME_PATTERN.test(pattern)
      ? pattern
      : 'unknown';
  }
  return 'unknown';
}

function readCorrelationId(data: unknown): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'meta' in data &&
    typeof data.meta === 'object' &&
    data.meta !== null &&
    'correlationId' in data.meta &&
    typeof data.meta.correlationId === 'string' &&
    RPC_CORRELATION_ID_PATTERN.test(data.meta.correlationId)
  ) {
    return data.meta.correlationId;
  }
  return 'unavailable';
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
