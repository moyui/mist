import { SignalRealtimeStartupService } from './signal-realtime-startup.service';

describe('SignalRealtimeStartupService', () => {
  it('registers BullMQ only after the initial registry succeeds', async () => {
    const order: string[] = [];
    const service = new SignalRealtimeStartupService(
      {
        initialize: jest.fn().mockImplementation(async () => {
          order.push('registry');
        }),
      } as never,
      {
        register: jest.fn().mockImplementation(() => order.push('worker')),
      } as never,
    );

    await service.onApplicationBootstrap();

    expect(order).toEqual(['registry', 'worker']);
  });

  it('does not register a worker after initial registry failure', async () => {
    const registrar = { register: jest.fn() };
    const service = new SignalRealtimeStartupService(
      {
        initialize: jest.fn().mockRejectedValue(new Error('db failed')),
      } as never,
      registrar as never,
    );

    await expect(service.onApplicationBootstrap()).rejects.toThrow('db failed');
    expect(registrar.register).not.toHaveBeenCalled();
  });
});
