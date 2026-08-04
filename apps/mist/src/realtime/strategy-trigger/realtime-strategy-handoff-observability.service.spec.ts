import { RealtimeStrategyHandoffObservabilityService } from './realtime-strategy-handoff-observability.service';

describe('RealtimeStrategyHandoffObservabilityService', () => {
  it('separates live enqueue failures from startup compensation', () => {
    const service = new RealtimeStrategyHandoffObservabilityService();
    service.recordLiveSuccess();
    service.recordLiveFailure();
    service.recordStartup('completed', 4);

    expect(service.snapshot(true)).toEqual({
      enabled: true,
      sharedRedisFailureDomain: true,
      liveEnqueue: {
        successTotal: 1,
        failureTotal: 1,
        lastOutcome: 'failed',
      },
      startupCompensation: { outcome: 'completed', submitted: 4 },
    });
  });
});
