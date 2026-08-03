import { ArgumentsHost, Logger } from '@nestjs/common';
import {
  EXCEPTION_FILTERS_METADATA,
  MODULE_METADATA,
  PIPES_METADATA,
} from '@nestjs/common/constants';
import { APP_FILTER } from '@nestjs/core';
import { lastValueFrom } from 'rxjs';
import {
  createRpcCorrelationId,
  createRpcRejectionV1,
  createRpcRequestV1,
  createRpcSuccessV1,
  assertRpcPattern,
  RpcContractValidationError,
  RpcInvalidRequestException,
} from './rpc-envelope';
import { decodeRpcRequestV1, decodeRpcResultV1 } from './rpc-decoder';
import { RpcExceptionFilter } from './rpc-exception.filter';
import { RpcContract } from './rpc-contract.decorator';
import { RpcTransportModule } from './rpc-transport.module';
import { RpcValidationPipe } from './rpc-validation.pipe';

type Command = { runId: string };
type SuccessData = { accepted: true };
type ErrorCode = 'queue_full' | 'not_found';
type ErrorData = { capacity: number };

const commandDecoder = (value: unknown): Command => {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !('runId' in value) ||
    typeof value.runId !== 'string'
  ) {
    throw new Error('invalid command');
  }
  return { runId: value.runId };
};

const successDecoder = (value: unknown): SuccessData => {
  if (
    typeof value !== 'object' ||
    value === null ||
    Object.keys(value).length !== 1 ||
    !('accepted' in value) ||
    value.accepted !== true
  ) {
    throw new Error('invalid success');
  }
  return { accepted: true };
};

const errorCodeDecoder = (value: unknown): ErrorCode => {
  if (value !== 'queue_full' && value !== 'not_found') {
    throw new Error('invalid error code');
  }
  return value;
};

const errorDataDecoder = (value: unknown): ErrorData => {
  if (
    typeof value !== 'object' ||
    value === null ||
    Object.keys(value).length !== 1 ||
    !('capacity' in value) ||
    typeof value.capacity !== 'number'
  ) {
    throw new Error('invalid error data');
  }
  return { capacity: value.capacity };
};

describe('RPC V1 strict contract', () => {
  it('creates one identity per non-HTTP attempt and accepts an HTTP identity', () => {
    const first = createRpcRequestV1({ runId: 'one' });
    const second = createRpcRequestV1({ runId: 'two' });
    expect(first.meta.correlationId).toMatch(/^rpc-[0-9a-f-]{36}$/);
    expect(second.meta.correlationId).not.toBe(first.meta.correlationId);

    expect(createRpcRequestV1({ runId: 'three' }, 'http-request-1')).toEqual({
      meta: { correlationId: 'http-request-1' },
      data: { runId: 'three' },
    });
    expect(createRpcCorrelationId()).toMatch(/^rpc-[0-9a-f-]{36}$/);
  });

  it('reuses one HTTP correlation for parallel RPC calls without adding a span', () => {
    const correlationId = 'http-parallel-request-1';
    const left = createRpcRequestV1({ runId: 'left' }, correlationId);
    const right = createRpcRequestV1({ runId: 'right' }, correlationId);

    expect(left.meta.correlationId).toBe(correlationId);
    expect(right.meta.correlationId).toBe(correlationId);
    expect(left.meta).toEqual({ correlationId });
    expect(right.meta).toEqual({ correlationId });
  });

  it('enforces domain.resource.action.vN pattern names', () => {
    expect(() => assertRpcPattern('backtest.run.submit.v1')).not.toThrow();
    for (const pattern of [
      'backtest.run.submit',
      'backtest.run.submit.v0',
      'Backtest.run.submit.v1',
      'backtest.run.submit.v1.extra',
      'backtest..submit.v1',
    ]) {
      expect(() => assertRpcPattern(pattern)).toThrow(
        RpcContractValidationError,
      );
    }
  });

  it.each([
    null,
    {},
    { meta: { correlationId: '' }, data: { runId: 'one' } },
    { meta: { correlationId: 'bad id' }, data: { runId: 'one' } },
    { meta: { correlationId: 'rpc-1', extra: true }, data: { runId: 'one' } },
    { meta: { correlationId: 'rpc-1' }, data: { runId: 'one' }, extra: true },
    { meta: { correlationId: 'rpc-1' }, data: { runId: 1 } },
  ])('rejects malformed request envelope %#', (value) => {
    expect(() => decodeRpcRequestV1(value, commandDecoder)).toThrow(
      RpcContractValidationError,
    );
  });

  it('decodes an exact request without adding version fields', () => {
    expect(
      decodeRpcRequestV1(
        { meta: { correlationId: 'rpc-command-1' }, data: { runId: 'one' } },
        commandDecoder,
      ),
    ).toEqual({
      meta: { correlationId: 'rpc-command-1' },
      data: { runId: 'one' },
    });
  });

  it('strictly decodes success and rejection with correlation echo', () => {
    const success = createRpcSuccessV1('rpc-command-1', { accepted: true });
    expect(
      decodeRpcResultV1(
        success,
        'rpc-command-1',
        successDecoder,
        errorCodeDecoder,
      ),
    ).toEqual(success);

    const rejection = createRpcRejectionV1<ErrorCode, ErrorData>(
      'rpc-command-1',
      'queue_full',
      { capacity: 100 },
    );
    expect(
      decodeRpcResultV1(
        rejection,
        'rpc-command-1',
        successDecoder,
        errorCodeDecoder,
        errorDataDecoder,
      ),
    ).toEqual(rejection);
  });

  it.each([
    {},
    { ok: true, meta: { correlationId: 'rpc-command-1' } },
    {
      ok: true,
      meta: { correlationId: 'rpc-command-1' },
      data: { accepted: true },
      error: { code: 'queue_full' },
    },
    {
      ok: false,
      meta: { correlationId: 'rpc-command-1' },
      error: { code: 'queue_full' },
      data: { accepted: true },
    },
    {
      ok: false,
      meta: { correlationId: 'rpc-command-1', extra: true },
      error: { code: 'queue_full' },
    },
    {
      ok: false,
      meta: { correlationId: 'rpc-command-1' },
      error: { code: 'unknown' },
    },
    {
      ok: false,
      meta: { correlationId: 'rpc-command-1' },
      error: { code: 'queue_full', details: {} },
    },
  ])('rejects malformed result branches %#', (value) => {
    expect(() =>
      decodeRpcResultV1(
        value,
        'rpc-command-1',
        successDecoder,
        errorCodeDecoder,
        errorDataDecoder,
      ),
    ).toThrow(RpcContractValidationError);
  });

  it('rejects correlation mismatch and error data when the contract owns none', () => {
    expect(() =>
      decodeRpcResultV1(
        createRpcSuccessV1('rpc-other', { accepted: true }),
        'rpc-command-1',
        successDecoder,
        errorCodeDecoder,
      ),
    ).toThrow('RPC result correlation mismatch');

    expect(() =>
      decodeRpcResultV1(
        {
          ok: false,
          meta: { correlationId: 'rpc-command-1' },
          error: { code: 'queue_full', data: { capacity: 100 } },
        },
        'rpc-command-1',
        successDecoder,
        errorCodeDecoder,
      ),
    ).toThrow('Unexpected RPC error data');
  });
});

describe('RpcExceptionFilter', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it.each([
    [new RpcInvalidRequestException(), 'RPC_INVALID_REQUEST'],
    [new Error('SQL secret constraint'), 'RPC_INTERNAL_ERROR'],
    ['unsafe primitive', 'RPC_INTERNAL_ERROR'],
  ] as const)(
    'emits a fixed safe error channel for %s',
    async (exception, code) => {
      const filter = new RpcExceptionFilter();
      const host = rpcHost(
        { meta: { correlationId: 'rpc-command-1' }, secret: 'wire secret' },
        'backtest.run.submit.v1',
      );

      await expect(
        lastValueFrom(filter.catch(exception, host)),
      ).rejects.toEqual({
        status: 'error',
        message: code,
      });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][0]).toContain('rpc-command-1');
      expect(JSON.stringify(errorSpy.mock.calls[0])).not.toContain(
        'wire secret',
      );
    },
  );

  it('does not log an invalid raw correlation value', async () => {
    const filter = new RpcExceptionFilter();
    const host = rpcHost(
      { meta: { correlationId: 'secret invalid correlation' } },
      'backtest.run.submit.v1',
    );

    await expect(
      lastValueFrom(filter.catch(new RpcInvalidRequestException(), host)),
    ).rejects.toEqual({
      status: 'error',
      message: 'RPC_INVALID_REQUEST',
    });
    expect(errorSpy.mock.calls[0][0]).toContain('correlationId=unavailable');
    expect(JSON.stringify(errorSpy.mock.calls[0])).not.toContain(
      'secret invalid correlation',
    );
  });

  it('does not log an invalid raw pattern value', async () => {
    const filter = new RpcExceptionFilter();
    const host = rpcHost(
      { meta: { correlationId: 'rpc-command-1' } },
      'secret invalid pattern',
    );

    await expect(
      lastValueFrom(filter.catch(new RpcInvalidRequestException(), host)),
    ).rejects.toEqual({
      status: 'error',
      message: 'RPC_INVALID_REQUEST',
    });
    expect(errorSpy.mock.calls[0][0]).toContain('pattern=unknown');
    expect(JSON.stringify(errorSpy.mock.calls[0])).not.toContain(
      'secret invalid pattern',
    );
  });

  it('does not log raw wire data echoed by a domain decoder', async () => {
    const rawSecret = 'RAW_WIRE_SECRET';
    const pipe = new RpcValidationPipe(() => {
      throw new Error(`decoder echoed ${rawSecret}`);
    });
    let exception: unknown;

    try {
      pipe.transform({
        meta: { correlationId: 'rpc-command-1' },
        data: { secret: rawSecret },
      });
    } catch (error) {
      exception = error;
    }

    expect(exception).toBeInstanceOf(RpcInvalidRequestException);
    const filter = new RpcExceptionFilter();
    const host = rpcHost(
      {
        meta: { correlationId: 'rpc-command-1' },
        data: { secret: rawSecret },
      },
      'backtest.run.submit.v1',
    );

    await expect(lastValueFrom(filter.catch(exception, host))).rejects.toEqual({
      status: 'error',
      message: 'RPC_INVALID_REQUEST',
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorSpy.mock.calls[0])).not.toContain(rawSecret);
  });
});

describe('RPC Nest composition', () => {
  it('installs the shared pipe/filter explicitly on a handler', () => {
    class Controller {
      @RpcContract(commandDecoder)
      handle(): void {}
    }

    const handler = Controller.prototype.handle;
    const pipes = Reflect.getMetadata(PIPES_METADATA, handler) as unknown[];
    const filters = Reflect.getMetadata(
      EXCEPTION_FILTERS_METADATA,
      handler,
    ) as unknown[];

    expect(pipes.some((pipe) => pipe instanceof RpcValidationPipe)).toBe(true);
    expect(filters).toContain(RpcExceptionFilter);
  });

  it('does not register an RPC exception filter as a global APP_FILTER', () => {
    const providers = (Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      RpcTransportModule,
    ) ?? []) as Array<unknown | { provide?: unknown }>;

    expect(
      providers.some(
        (provider) =>
          typeof provider === 'object' &&
          provider !== null &&
          'provide' in provider &&
          provider.provide === APP_FILTER,
      ),
    ).toBe(false);
  });

  it('converts envelope or domain decoder failures to invalid-request errors', () => {
    const pipe = new RpcValidationPipe(commandDecoder);
    expect(() => pipe.transform({ meta: {}, data: {} })).toThrow(
      RpcInvalidRequestException,
    );
  });
});

function rpcHost(data: unknown, pattern: string): ArgumentsHost {
  return {
    switchToRpc: () => ({
      getData: () => data,
      getContext: () => ({ getPattern: () => pattern }),
    }),
  } as ArgumentsHost;
}
