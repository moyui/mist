import { BacktestHealthStateService } from './backtest-health-state.service';

describe('BacktestHealthStateService', () => {
  it('publishes scoped readiness, capacity and bounded observations', () => {
    const health = new BacktestHealthStateService();
    health.configure(2, 8);
    health.setCounts(1, 3);
    health.recordCommand('accepted');
    health.recordCommand('queue_full');
    health.recordCommand('not_ready');
    health.recordStartupFailure('queue_full');
    health.recordResultBatch(4, 250);
    health.recordResultBatchFailure(100);
    health.recordRunCompleted(1_250);
    health.recordRunFailed('untrusted-provider-message', 2_500);

    expect(health.snapshot()).toEqual({
      status: 'ok',
      service: 'backtest',
      backtest: {
        ready: false,
        state: 'starting',
        activeCount: 1,
        waitingCount: 3,
        concurrency: 2,
        queueCapacity: 8,
        observations: {
          commandAcceptedCount: 1,
          commandQueueFullCount: 1,
          commandNotReadyCount: 1,
          startupQueueFullCount: 1,
          startupUnavailableCount: 0,
          runCompletedCount: 1,
          runFailedCount: 1,
          resultBatchCount: 1,
          resultRowCount: 4,
          resultBatchFailureCount: 1,
          lastRunDurationSeconds: 2.5,
          lastResultBatchDurationSeconds: 0.1,
          oldestActiveAgeSeconds: null,
          oldestWaitingAgeSeconds: null,
          lastFailureClass: 'BACKTEST_EXECUTION_FAILED',
        },
      },
    });
  });

  it('transitions readiness only through the explicit startup gate', () => {
    const health = new BacktestHealthStateService();
    expect(health.snapshot().backtest.ready).toBe(false);
    health.setReady(true);
    expect(health.snapshot().backtest).toMatchObject({
      ready: true,
      state: 'ready',
    });
  });
});
