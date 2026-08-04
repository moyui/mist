import {
  BadGatewayException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { createRpcRequestV1, decodeRpcResultV1 } from '@app/transport/rpc';
import {
  decodeSignalRegistryRefreshV1,
  SIGNAL_REGISTRY_REFRESH_PATTERN,
  type SignalRegistryRefreshV1,
} from '@app/signal';
import { firstValueFrom, timeout, TimeoutError } from 'rxjs';
import {
  SIGNAL_REGISTRY_REFRESH_TIMEOUT_MS,
  SIGNAL_REGISTRY_RPC_CLIENT,
} from './signal-registry-rpc.constants';

export interface StrategyRuntimeRefreshUnknownData {
  readonly strategyDefinitionId: number;
  readonly persistence: 'committed';
  readonly runtimeRefresh: 'unknown';
}

@Injectable()
export class SignalRegistryRpcClient {
  constructor(
    @Inject(SIGNAL_REGISTRY_RPC_CLIENT)
    private readonly client: ClientProxy,
  ) {}

  async refresh(
    strategyDefinitionId: number,
  ): Promise<SignalRegistryRefreshV1> {
    const request = createRpcRequestV1({ strategyDefinitionId });
    let raw: unknown;
    try {
      raw = await firstValueFrom(
        this.client
          .send(SIGNAL_REGISTRY_REFRESH_PATTERN, request)
          .pipe(timeout(SIGNAL_REGISTRY_REFRESH_TIMEOUT_MS)),
      );
    } catch (error) {
      throw mapTransportFailure(strategyDefinitionId, error);
    }

    try {
      const result = decodeRpcResultV1(
        raw,
        request.meta.correlationId,
        decodeSignalRegistryRefreshV1,
        rejectUnexpectedErrorCode,
      );
      if (!result.ok) throw new TypeError('Unexpected registry rejection');
      return result.data;
    } catch (error) {
      throw refreshException(
        BadGatewayException,
        'STRATEGY_RUNTIME_REFRESH_FAILED',
        'Strategy runtime refresh failed',
        strategyDefinitionId,
        error,
      );
    }
  }
}

function mapTransportFailure(
  strategyDefinitionId: number,
  error: unknown,
): Error {
  if (error instanceof TimeoutError) {
    return refreshException(
      GatewayTimeoutException,
      'STRATEGY_RUNTIME_REFRESH_TIMEOUT',
      'Strategy runtime refresh timed out',
      strategyDefinitionId,
      error,
    );
  }
  if (isConnectionFailure(error)) {
    return refreshException(
      ServiceUnavailableException,
      'SIGNAL_SERVICE_UNAVAILABLE',
      'Signal service is unavailable',
      strategyDefinitionId,
      error,
    );
  }
  return refreshException(
    BadGatewayException,
    'STRATEGY_RUNTIME_REFRESH_FAILED',
    'Strategy runtime refresh failed',
    strategyDefinitionId,
    error,
  );
}

function refreshException(
  ExceptionType:
    | typeof BadGatewayException
    | typeof GatewayTimeoutException
    | typeof ServiceUnavailableException,
  code: string,
  message: string,
  strategyDefinitionId: number,
  cause: unknown,
): Error {
  const data: StrategyRuntimeRefreshUnknownData = {
    strategyDefinitionId,
    persistence: 'committed',
    runtimeRefresh: 'unknown',
  };
  return new ExceptionType({ code, message, data }, { cause });
}

function isConnectionFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: unknown }).code;
  return (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENETUNREACH'
  );
}

function rejectUnexpectedErrorCode(value: unknown): never {
  throw new TypeError(
    `Unexpected registry refresh error code: ${String(value)}`,
  );
}
