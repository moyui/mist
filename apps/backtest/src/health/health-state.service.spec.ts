import { HealthStateService } from './health-state.service';

describe('HealthStateService (backtest)', () => {
  it('publishes scoped readiness, capacity and bounded observations', () => {
    const health = new HealthStateService();
    health.configure(2, 8);
    health.setCounts(1, 3);
    health.recordCommand('accepted');
    health.recordCommand('queue_full');
    health.recordCommand('not_ready');
    health.recordCommand('run_failed');
    health.recordStartupFailure('queue_full');
    health.recordResultBatch(4, 250);
    health.recordResultBatchFailure(100);
    health.recordRunCompleted(1_250);
    health.recordRunFailed('untrusted-provider-message', 2_500);

    const snapshot = health.snapshot();
    expect(snapshot).toMatchObject({
      status: 'ok',
      service: 'backtest',
      instance: 'backtest',
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
          commandRunFailedCount: 1,
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
    expect(snapshot.timestamp).toEqual(expect.any(String));
  });

  it('transitions readiness only through the explicit startup gate', () => {
    const health = new HealthStateService();
    expect(health.snapshot().backtest.ready).toBe(false);
    health.setReady(true);
    expect(health.snapshot().backtest).toMatchObject({
      ready: true,
      state: 'ready',
    });
  });

  it('accumulates per-reason failure and target issue totals via diagnostics', () => {
    const health = new HealthStateService();
    health.recordRunFailed('BACKTEST_BAR_LIMIT_EXCEEDED', 100);
    health.recordRunFailed('BACKTEST_BAR_LIMIT_EXCEEDED', 200);
    health.recordRunFailed('BACKTEST_EXECUTION_TIMEOUT', 300);
    health.recordTargetIssue('SECURITY_NOT_FOUND');
    health.recordTargetIssue('SECURITY_NOT_FOUND');
    health.recordTargetIssue('NO_HISTORICAL_BARS');

    const diag = health.diagnostics();
    expect(diag.failureTotals.get('BACKTEST_BAR_LIMIT_EXCEEDED')).toBe(2);
    expect(diag.failureTotals.get('BACKTEST_EXECUTION_TIMEOUT')).toBe(1);
    expect(diag.targetIssueTotals.get('SECURITY_NOT_FOUND')).toBe(2);
    expect(diag.targetIssueTotals.get('NO_HISTORICAL_BARS')).toBe(1);
  });
});
