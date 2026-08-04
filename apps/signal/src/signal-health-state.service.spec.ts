import { SignalHealthStateService } from './signal-health-state.service';

describe('SignalHealthStateService', () => {
  const originalMode = process.env.REALTIME_STRATEGY_MODE;

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.REALTIME_STRATEGY_MODE;
    } else {
      process.env.REALTIME_STRATEGY_MODE = originalMode;
    }
  });

  it('reports a typed raw off-mode snapshot after registry initialization', () => {
    process.env.REALTIME_STRATEGY_MODE = 'off';
    const state = new SignalHealthStateService();
    state.recordRegistrySuccess(1, 0, 0, '2026-08-04T01:02:03.000Z');

    expect(state.snapshot()).toEqual({
      status: 'ok',
      instance: 'signal',
      realtimeMode: 'off',
      registry: {
        ready: true,
        generation: 1,
        definitionCount: 0,
        executionPlanCount: 0,
        lastRefreshAt: '2026-08-04T01:02:03.000Z',
        lastRefreshOutcome: 'success',
        lastFailureCode: null,
      },
      marketData: {
        state: 'off',
        lastTriggerTime: null,
        lastAcceptedAt: null,
        windowGroupCount: 0,
        rawBarCount: 0,
        derivedBarCount: 0,
        lastFailureCode: null,
      },
      queue: {
        state: 'off',
        workerRunning: false,
        concurrency: 1,
        activeCount: 0,
        processedCount: 0,
        failedCount: 0,
        lastProcessedAt: null,
        lastOutcome: null,
        lastFailureCode: null,
      },
      evaluation: {
        state: 'off',
        lastEvaluatedAt: null,
        lastOutcome: null,
        activeEpisodeCount: 0,
        lastFailureCode: null,
      },
    });
  });

  it('keeps the last successful registry generation after refresh failure', () => {
    process.env.REALTIME_STRATEGY_MODE = 'off';
    const state = new SignalHealthStateService();
    state.recordRegistrySuccess(2, 3, 3, '2026-08-04T01:02:03.000Z');
    state.recordRegistryFailure(
      'REGISTRY_REFRESH_FAILED',
      '2026-08-04T01:03:03.000Z',
    );

    expect(state.snapshot().registry).toMatchObject({
      ready: true,
      generation: 2,
      definitionCount: 3,
      lastRefreshOutcome: 'failed',
      lastFailureCode: 'REGISTRY_REFRESH_FAILED',
    });
  });
});
