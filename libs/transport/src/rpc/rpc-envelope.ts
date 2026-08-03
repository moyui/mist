import { randomUUID } from 'node:crypto';

export const RPC_CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
export const RPC_PATTERN_NAME_PATTERN =
  /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2}\.v[1-9][0-9]*$/;

export interface RpcMetaV1 {
  correlationId: string;
}

export interface RpcRequestV1<TData> {
  meta: RpcMetaV1;
  data: TData;
}

export type RpcResultV1<TData, TErrorCode, TErrorData = never> =
  | {
      ok: true;
      meta: RpcMetaV1;
      data: TData;
    }
  | {
      ok: false;
      meta: RpcMetaV1;
      error: {
        code: TErrorCode;
        data?: TErrorData;
      };
    };

export interface RpcTransportErrorV1 {
  status: 'error';
  message: 'RPC_INVALID_REQUEST' | 'RPC_INTERNAL_ERROR';
}

export function createRpcCorrelationId(): string {
  return `rpc-${randomUUID()}`;
}

export function createRpcRequestV1<TData>(
  data: TData,
  correlationId = createRpcCorrelationId(),
): RpcRequestV1<TData> {
  assertRpcCorrelationId(correlationId);
  return { meta: { correlationId }, data };
}

export function createRpcSuccessV1<TData>(
  correlationId: string,
  data: TData,
): RpcResultV1<TData, never> {
  assertRpcCorrelationId(correlationId);
  return { ok: true, meta: { correlationId }, data };
}

export function createRpcRejectionV1<TErrorCode, TErrorData = never>(
  correlationId: string,
  code: TErrorCode,
  ...data: [TErrorData] extends [never] ? [] : [data?: TErrorData]
): RpcResultV1<never, TErrorCode, TErrorData> {
  assertRpcCorrelationId(correlationId);
  return {
    ok: false,
    meta: { correlationId },
    error: {
      code,
      ...(data.length === 0 || data[0] === undefined ? {} : { data: data[0] }),
    },
  };
}

export function assertRpcCorrelationId(
  correlationId: unknown,
): asserts correlationId is string {
  if (
    typeof correlationId !== 'string' ||
    !RPC_CORRELATION_ID_PATTERN.test(correlationId)
  ) {
    throw new RpcContractValidationError('Invalid RPC correlation identity');
  }
}

export function assertRpcPattern(pattern: unknown): asserts pattern is string {
  if (typeof pattern !== 'string' || !RPC_PATTERN_NAME_PATTERN.test(pattern)) {
    throw new RpcContractValidationError('Invalid RPC pattern name');
  }
}

export class RpcContractValidationError extends Error {
  readonly cause?: unknown;

  constructor(message = 'Invalid RPC contract', cause?: unknown) {
    super(message);
    this.name = RpcContractValidationError.name;
    this.cause = cause;
  }
}

export class RpcInvalidRequestException extends Error {
  readonly cause?: unknown;

  constructor(cause?: unknown) {
    super('RPC request validation failed');
    this.name = RpcInvalidRequestException.name;
    this.cause = cause;
  }
}
