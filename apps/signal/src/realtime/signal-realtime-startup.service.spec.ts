import { SignalRealtimeStartupService } from './signal-realtime-startup.service';

describe('SignalRealtimeStartupService', () => {
  it('registers BullMQ only after the initial registry succeeds', async () => {
    const order: string[] = [];
    const registry = {
      initialize: jest.fn().mockImplementation(async () => {
        order.push('registry');
      }),
      capture: jest
        .fn()
        .mockReturnValue({ generation: 1, definitions: new Map() }),
      subscribe: jest.fn().mockReturnValue(jest.fn()),
    };
    const processor = { reconcileRegistry: jest.fn() };
    const health = { recordWorkerRunning: jest.fn() };
    const service = new SignalRealtimeStartupService(
      registry as never,
      {
        register: jest.fn().mockImplementation(() => order.push('worker')),
      } as never,
      processor as never,
      health as never,
    );

    await service.onApplicationBootstrap();

    expect(order).toEqual(['registry', 'worker']);
    expect(processor.reconcileRegistry).toHaveBeenCalledWith(
      registry.capture(),
    );
    expect(registry.subscribe).toHaveBeenCalledTimes(1);
    expect(health.recordWorkerRunning).toHaveBeenCalledWith(true);
  });

  it('does not register a worker after initial registry failure', async () => {
    const registrar = { register: jest.fn() };
    const service = new SignalRealtimeStartupService(
      {
        initialize: jest.fn().mockRejectedValue(new Error('db failed')),
      } as never,
      registrar as never,
      { reconcileRegistry: jest.fn() } as never,
      { recordWorkerRunning: jest.fn() } as never,
    );

    await expect(service.onApplicationBootstrap()).rejects.toThrow('db failed');
    expect(registrar.register).not.toHaveBeenCalled();
  });
});
