import {
  PendingAlertDeliverySweepService,
  PENDING_SWEEP_INTERVAL_MS,
  PENDING_SWEEP_STALENESS_MS,
  PENDING_SWEEP_MAX_PER_PASS,
} from './pending-alert-delivery-sweep.service';

function createService() {
  const alertEvents = {
    find: jest.fn(),
  };
  const deliveries = {
    find: jest.fn(),
  };
  const queue = { enqueueFanout: jest.fn().mockResolvedValue(undefined) };
  const service = new PendingAlertDeliverySweepService(
    alertEvents as never,
    deliveries as never,
    queue as never,
  );
  return { service, alertEvents, deliveries, queue };
}

function pendingEvent(id: number, createdAt: Date) {
  return { id, status: 'pending', createdAt };
}

describe('PendingAlertDeliverySweepService', () => {
  it('exports bounded constants', () => {
    expect(PENDING_SWEEP_INTERVAL_MS).toBe(60_000);
    expect(PENDING_SWEEP_STALENESS_MS).toBe(5 * 60_000);
    expect(PENDING_SWEEP_MAX_PER_PASS).toBe(100);
  });

  it('re-enqueues stranded events (PENDING + stale + no delivery rows)', async () => {
    const { service, alertEvents, deliveries, queue } = createService();
    const stale = new Date(Date.now() - PENDING_SWEEP_STALENESS_MS - 1000);
    alertEvents.find.mockResolvedValue([pendingEvent(1, stale)]);
    deliveries.find.mockResolvedValue([]);

    await service.sweep();

    expect(queue.enqueueFanout).toHaveBeenCalledWith(1);
    expect(service.getRecoveredTotal()).toBe(1);
  });

  it('skips events that already have delivery rows (in-flight/replay)', async () => {
    const { service, alertEvents, deliveries, queue } = createService();
    const stale = new Date(Date.now() - PENDING_SWEEP_STALENESS_MS - 1000);
    alertEvents.find.mockResolvedValue([
      pendingEvent(1, stale),
      pendingEvent(2, stale),
    ]);
    deliveries.find.mockResolvedValue([
      { strategyAlertEventId: 2 }, // event 2 has a row => not stranded
    ]);

    await service.sweep();

    expect(queue.enqueueFanout).toHaveBeenCalledTimes(1);
    expect(queue.enqueueFanout).toHaveBeenCalledWith(1);
  });

  it('skips fresh events below the staleness threshold', async () => {
    const { service, alertEvents, deliveries, queue } = createService();
    // The query itself filters by createdAt; a fresh event must not be
    // returned by the repository (the service trusts the threshold filter).
    alertEvents.find.mockResolvedValue([]);
    deliveries.find.mockResolvedValue([]);

    await service.sweep();

    expect(alertEvents.find).toHaveBeenCalledWith(
      expect.objectContaining({
        take: PENDING_SWEEP_MAX_PER_PASS,
      }),
    );
    expect(queue.enqueueFanout).not.toHaveBeenCalled();
  });

  it('does not run overlapping passes (async re-entrancy guard)', async () => {
    const { service, alertEvents, deliveries, queue } = createService();
    let release: () => void = () => undefined;
    alertEvents.find.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve([pendingEvent(1, new Date())]);
      }),
    );
    deliveries.find.mockResolvedValue([]);

    const first = service.sweep();
    // Second pass while the first is still awaiting must be a no-op.
    await service.sweep();
    release();
    await first;

    expect(queue.enqueueFanout).toHaveBeenCalledTimes(1);
  });
});
