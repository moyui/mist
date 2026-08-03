import {
  assertRpcCorrelationId,
  RpcContractValidationError,
  RpcRequestV1,
  RpcResultV1,
} from './rpc-envelope';

export type RpcDomainDecoder<T> = (value: unknown) => T;

export function decodeRpcRequestV1<TData>(
  value: unknown,
  dataDecoder: RpcDomainDecoder<TData>,
): RpcRequestV1<TData> {
  const request = exactRecord(value, ['meta', 'data'], 'RPC request');
  const meta = decodeMeta(request.meta);
  return {
    meta,
    data: runDomainDecoder(dataDecoder, request.data, 'RPC request data'),
  };
}

export function decodeRpcResultV1<TData, TErrorCode, TErrorData = never>(
  value: unknown,
  expectedCorrelationId: string,
  successDataDecoder: RpcDomainDecoder<TData>,
  errorCodeDecoder: RpcDomainDecoder<TErrorCode>,
  errorDataDecoder?: RpcDomainDecoder<TErrorData>,
): RpcResultV1<TData, TErrorCode, TErrorData> {
  assertRpcCorrelationId(expectedCorrelationId);
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    throw new RpcContractValidationError('Invalid RPC result branch');
  }

  if (value.ok) {
    const result = exactRecord(value, ['ok', 'meta', 'data'], 'RPC success');
    const meta = decodeMeta(result.meta);
    assertCorrelationEcho(meta.correlationId, expectedCorrelationId);
    return {
      ok: true,
      meta,
      data: runDomainDecoder(
        successDataDecoder,
        result.data,
        'RPC success data',
      ),
    };
  }

  const result = exactRecord(value, ['ok', 'meta', 'error'], 'RPC rejection');
  const meta = decodeMeta(result.meta);
  assertCorrelationEcho(meta.correlationId, expectedCorrelationId);
  const error = recordWithAllowedKeys(
    result.error,
    ['code'],
    ['data'],
    'RPC rejection error',
  );
  const code = runDomainDecoder(errorCodeDecoder, error.code, 'RPC error code');
  if ('data' in error && !errorDataDecoder) {
    throw new RpcContractValidationError('Unexpected RPC error data');
  }

  return {
    ok: false,
    meta,
    error: {
      code,
      ...('data' in error
        ? {
            data: runDomainDecoder(
              errorDataDecoder as RpcDomainDecoder<TErrorData>,
              error.data,
              'RPC error data',
            ),
          }
        : {}),
    },
  };
}

function decodeMeta(value: unknown): { correlationId: string } {
  const meta = exactRecord(value, ['correlationId'], 'RPC meta');
  assertRpcCorrelationId(meta.correlationId);
  return { correlationId: meta.correlationId };
}

function assertCorrelationEcho(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new RpcContractValidationError('RPC result correlation mismatch');
  }
}

function runDomainDecoder<T>(
  decoder: RpcDomainDecoder<T>,
  value: unknown,
  label: string,
): T {
  try {
    return decoder(value);
  } catch (error) {
    throw new RpcContractValidationError(`${label} is invalid`, error);
  }
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  return recordWithAllowedKeys(value, keys, [], label);
}

function recordWithAllowedKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new RpcContractValidationError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) ||
    actual.some((key) => !allowed.has(key))
  ) {
    throw new RpcContractValidationError(`${label} fields are invalid`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
