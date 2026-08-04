import { Inject, Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import {
  BACKTEST_RUN_SUBMIT_PATTERN,
  decodeSubmitBacktestRunErrorCodeV1,
  decodeSubmitBacktestRunSuccessV1,
  type SubmitBacktestRunErrorCode,
} from '@app/backtest';
import {
  createRpcRequestV1,
  decodeRpcResultV1,
  type RpcResultV1,
} from '@app/transport/rpc';
import { firstValueFrom, timeout, TimeoutError } from 'rxjs';
import { BACKTEST_RPC_CLIENT } from './backtest-rpc.constants';

export type BacktestRpcTransportFailureKind =
  | 'timeout'
  | 'unavailable'
  | 'failed';

type SubmitBacktestRunResultV1 = RpcResultV1<null, SubmitBacktestRunErrorCode>;

export class BacktestRpcTransportError extends Error {
  constructor(
    readonly kind: BacktestRpcTransportFailureKind,
    cause?: unknown,
  ) {
    super(`Backtest RPC ${kind}`);
    this.name = BacktestRpcTransportError.name;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

@Injectable()
export class BacktestRpcClient {
  constructor(
    @Inject(BACKTEST_RPC_CLIENT) private readonly client: ClientProxy,
    private readonly config: ConfigService,
  ) {}

  async submit(
    runId: number,
    correlationId?: string,
  ): Promise<SubmitBacktestRunResultV1> {
    const request = createRpcRequestV1({ runId }, correlationId);
    const timeoutMs =
      this.config.get<number>('BACKTEST_COMMAND_TIMEOUT_MS') ?? 3_000;
    let raw: unknown;
    try {
      raw = await firstValueFrom(
        this.client
          .send(BACKTEST_RUN_SUBMIT_PATTERN, request)
          .pipe(timeout(timeoutMs)),
      );
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new BacktestRpcTransportError('timeout', error);
      }
      if (isConnectionFailure(error)) {
        throw new BacktestRpcTransportError('unavailable', error);
      }
      throw new BacktestRpcTransportError('failed', error);
    }

    try {
      return decodeRpcResultV1(
        raw,
        request.meta.correlationId,
        decodeSubmitBacktestRunSuccessV1,
        decodeSubmitBacktestRunErrorCodeV1,
      );
    } catch (error) {
      throw new BacktestRpcTransportError('failed', error);
    }
  }
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
