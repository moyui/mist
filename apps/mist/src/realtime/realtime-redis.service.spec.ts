import { ConfigService } from '@nestjs/config';
import { RealtimeRedisService } from './realtime-redis.service';

/**
 * Minimal fake ioredis client shape for lifecycle tests. We spy on the ioredis
 * constructor via jest.mock; this interface makes the recursive `on` return
 * type explicit so TS doesn't infer `any`.
 */
interface FakeClient {
  url: string;
  opts: unknown;
  on: jest.Mock;
  disconnect: jest.Mock;
  emit: (event: string, ...args: unknown[]) => void;
}

function makeFakeClient(url = '', opts: unknown = {}): FakeClient {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const client: FakeClient = {
    url,
    opts,
    on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
      handlers[event] = cb;
      return client;
    }),
    disconnect: jest.fn(),
    emit: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
  };
  return client;
}

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest
      .fn()
      .mockImplementation((url: string, opts: unknown) =>
        makeFakeClient(url, opts),
      ),
  };
});

// The ioredis constructor mock; typed loosely because jest.requireMock does
// not preserve the class signature.
const MockedRedis = jest.requireMock('ioredis').default as jest.Mock;

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const defaults: Record<string, unknown> = {
    MIST_REALTIME_REDIS_URL: '',
    REALTIME_PRODUCTIZATION_MODE: 'off',
  };
  return { get: (key: string) => ({ ...defaults, ...overrides })[key] } as any;
}

describe('RealtimeRedisService', () => {
  beforeEach(() => {
    MockedRedis.mockClear();
  });

  it('is unavailable when mode=off regardless of URL', () => {
    const service = new RealtimeRedisService(
      makeConfig({
        MIST_REALTIME_REDIS_URL: 'redis://localhost:6379',
        REALTIME_PRODUCTIZATION_MODE: 'off',
      }),
    );
    expect(service.isAvailable()).toBe(false);
    expect(service.client).toBeNull();
  });

  it('is unavailable when mode=shadow but URL is empty', () => {
    const service = new RealtimeRedisService(
      makeConfig({ REALTIME_PRODUCTIZATION_MODE: 'shadow' }),
    );
    expect(service.isAvailable()).toBe(false);
  });

  it('is available when mode=shadow and a URL is set', () => {
    const service = new RealtimeRedisService(
      makeConfig({
        MIST_REALTIME_REDIS_URL: 'redis://localhost:6379',
        REALTIME_PRODUCTIZATION_MODE: 'shadow',
      }),
    );
    expect(service.isAvailable()).toBe(true);
  });

  it('does NOT create a Redis client on init when mode=off', async () => {
    const service = new RealtimeRedisService(
      makeConfig({ REALTIME_PRODUCTIZATION_MODE: 'off' }),
    );
    await service.onModuleInit();
    expect(MockedRedis).not.toHaveBeenCalled();
    expect(service.client).toBeNull();
  });

  it('creates a Redis client with enableOfflineQueue=false and bounded retry on init when available', async () => {
    const service = new RealtimeRedisService(
      makeConfig({
        MIST_REALTIME_REDIS_URL: 'redis://localhost:6379',
        REALTIME_PRODUCTIZATION_MODE: 'shadow',
      }),
    );

    await service.onModuleInit();

    expect(MockedRedis).toHaveBeenCalledTimes(1);
    const callArgs = MockedRedis.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    const opts = callArgs[1];
    expect(opts).toMatchObject({
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    expect(service.client).not.toBeNull();
  });

  it('disconnects the owned client on destroy', async () => {
    const service = new RealtimeRedisService(
      makeConfig({
        MIST_REALTIME_REDIS_URL: 'redis://localhost:6379',
        REALTIME_PRODUCTIZATION_MODE: 'shadow',
      }),
    );
    await service.onModuleInit();
    const client = service.client;
    await service.onModuleDestroy();

    expect(client?.disconnect).toHaveBeenCalled();
    expect(service.client).toBeNull();
  });

  it('uses an injected client without managing its lifecycle', async () => {
    const fake = makeFakeClient();
    const service = new RealtimeRedisService(
      makeConfig({
        MIST_REALTIME_REDIS_URL: 'redis://localhost:6379',
        REALTIME_PRODUCTIZATION_MODE: 'on',
      }),
      fake as any,
    );

    await service.onModuleInit();
    // Must NOT have called the real constructor.
    expect(MockedRedis).not.toHaveBeenCalled();
    expect(service.client).toBe(fake as any);

    await service.onModuleDestroy();
    // Must NOT disconnect the injected client.
    expect(fake.disconnect).not.toHaveBeenCalled();
  });
});
