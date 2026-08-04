import { SignalRuntimeObservabilityService } from './signal-runtime-observability.service';

describe('SignalRuntimeObservabilityService', () => {
  it('keeps process memory and cleanup evidence low-cardinality', () => {
    const service = new SignalRuntimeObservabilityService();
    service.recordConsumerRemoval(2);
    service.recordConsumerRemoval(0);
    service.recordTradingDayRollover();

    expect(service.snapshot()).toMatchObject({
      heapUsedBytes: expect.any(Number),
      heapTotalBytes: expect.any(Number),
      rssBytes: expect.any(Number),
      heapHighWaterBytes: expect.any(Number),
      gcCount: 0,
      gcPauseSeconds: 0,
      consumerRemovalCount: 2,
      tradingDayRolloverCount: 1,
      lastCleanupOutcome: 'trading_day_rolled_over',
    });
  });
});
