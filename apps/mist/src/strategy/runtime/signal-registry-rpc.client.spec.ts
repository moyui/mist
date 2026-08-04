import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createRpcSuccessV1, type RpcRequestV1 } from '@app/transport/rpc';
import { of, throwError } from 'rxjs';
import { SignalRegistryRpcClient } from './signal-registry-rpc.client';

describe('SignalRegistryRpcClient', () => {
  it('uses the shared pattern/envelope and decodes the correlated result', async () => {
    const proxy = {
      send: jest
        .fn()
        .mockImplementation(
          (_pattern, request: RpcRequestV1<{ strategyDefinitionId: number }>) =>
            of(
              createRpcSuccessV1(request.meta.correlationId, {
                strategyDefinitionId: request.data.strategyDefinitionId,
                registryGeneration: 2,
                action: 'upserted',
              }),
            ),
        ),
    };
    const client = new SignalRegistryRpcClient(proxy as never);

    await expect(client.refresh(7)).resolves.toEqual({
      strategyDefinitionId: 7,
      registryGeneration: 2,
      action: 'upserted',
    });
    expect(proxy.send).toHaveBeenCalledWith(
      'signal.registry.refresh.v1',
      expect.objectContaining({ data: { strategyDefinitionId: 7 } }),
    );
  });

  it('maps connection refusal to a committed-but-unknown 503', async () => {
    const failure = Object.assign(new Error('refused'), {
      code: 'ECONNREFUSED',
    });
    const client = new SignalRegistryRpcClient({
      send: jest.fn().mockReturnValue(throwError(() => failure)),
    } as never);

    const error = await client.refresh(7).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toEqual({
      code: 'SIGNAL_SERVICE_UNAVAILABLE',
      message: 'Signal service is unavailable',
      data: {
        strategyDefinitionId: 7,
        persistence: 'committed',
        runtimeRefresh: 'unknown',
      },
    });
  });

  it('maps malformed handler results to a committed-but-unknown 502', async () => {
    const client = new SignalRegistryRpcClient({
      send: jest.fn().mockReturnValue(of({ ok: true })),
    } as never);

    await expect(client.refresh(7)).rejects.toBeInstanceOf(BadGatewayException);
  });
});
