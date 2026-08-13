import { NotificationMetricsBootstrap } from './notification-metrics-bootstrap';

describe('NotificationMetricsBootstrap', () => {
  it('samples both alert queues into the depth snapshot (L5)', async () => {
    const counters = {} as never;
    const strategyQueue = {
      snapshotCounts: jest
        .fn()
        .mockResolvedValue({ waiting: 3, active: 1, delayed: 0 }),
    };
    const ooAlertQueue = {
      snapshotCounts: jest
        .fn()
        .mockResolvedValue({ waiting: 0, active: 2, delayed: 5 }),
    };
    const sweep = { getRecoveredTotal: jest.fn().mockReturnValue(0) };
    const bootstrap = new NotificationMetricsBootstrap(
      counters,
      strategyQueue as never,
      ooAlertQueue as never,
      sweep as never,
    );

    bootstrap.onModuleInit();
    // onModuleInit kicks an async sample; wait for both promises to settle.
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Trigger one more synchronous sample via the private method for determinism.
    await (
      bootstrap as unknown as {
        sampleQueueDepth: () => Promise<void>;
      }
    ).sampleQueueDepth();
    bootstrap.onModuleDestroy();

    expect(strategyQueue.snapshotCounts).toHaveBeenCalled();
    expect(ooAlertQueue.snapshotCounts).toHaveBeenCalled();
    const depth = (bootstrap as unknown as { queueDepth: unknown }).queueDepth;
    expect(depth).toEqual({
      strategy: { waiting: 3, active: 1, delayed: 0 },
      ooAlert: { waiting: 0, active: 2, delayed: 5 },
    });
  });
});
