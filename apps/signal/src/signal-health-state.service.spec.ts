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

    expect(state.snapshot()).toMatchObject({
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
        lastPersistenceOutcome: null,
        activeEpisodeCount: 0,
        lastFailureCode: null,
      },
      runtime: {
        consumerRemovalCount: 0,
        gcCount: 0,
        gcPauseSeconds: 0,
        lastCleanupOutcome: null,
        tradingDayRolloverCount: 0,
      },
    });
  });

  it('records bounded process-local worker and evaluation aggregates', () => {
    process.env.REALTIME_STRATEGY_MODE = 'shadow';
    const state = new SignalHealthStateService();
    state.recordWorkerRunning(true);
    state.recordJobStarted();
    state.recordJobSucceeded({
      acceptedAt: '2026-08-04T06:44:01.000Z',
      outcome: 'completed',
      acceptedTriggerTime: '2026-08-04T06:44:00.000Z',
      evaluated: true,
      windowGroupCount: 2,
      rawBarCount: 14,
      derivedBarCount: 1,
      activeEpisodeCount: 1,
      evaluationOutcome: 'evaluated_matched',
      persistenceOutcome: null,
    });

    expect(state.snapshot()).toMatchObject({
      marketData: {
        windowGroupCount: 2,
        rawBarCount: 14,
        derivedBarCount: 1,
      },
      queue: {
        workerRunning: true,
        activeCount: 0,
        processedCount: 1,
        failedCount: 0,
        lastOutcome: 'completed',
      },
      evaluation: {
        state: 'idle',
        lastOutcome: 'evaluated_matched',
        activeEpisodeCount: 1,
      },
    });
  });

  it('does not report expired jobs as accepted market data', () => {
    process.env.REALTIME_STRATEGY_MODE = 'shadow';
    const state = new SignalHealthStateService();
    state.recordJobStarted();
    state.recordJobSucceeded({
      acceptedAt: '2026-08-04T06:44:01.000Z',
      outcome: 'expired_trading_day',
      acceptedTriggerTime: null,
      evaluated: false,
      windowGroupCount: 0,
      rawBarCount: 0,
      derivedBarCount: 0,
      activeEpisodeCount: 0,
      evaluationOutcome: null,
      persistenceOutcome: null,
    });

    expect(state.snapshot()).toMatchObject({
      marketData: { lastTriggerTime: null, lastAcceptedAt: null },
      queue: { processedCount: 1, lastOutcome: 'expired_trading_day' },
      evaluation: { lastEvaluatedAt: null, lastOutcome: null },
    });
  });

  it('counts a failed terminal job without fabricating market acceptance', () => {
    process.env.REALTIME_STRATEGY_MODE = 'shadow';
    const state = new SignalHealthStateService();
    state.recordJobStarted();
    state.recordJobFailed({
      failureCode: 'INVALID_REALTIME_STRATEGY_JOB',
      failedAt: '2026-08-04T06:44:01.000Z',
      acceptedTriggerTime: null,
      evaluationStarted: false,
      windowGroupCount: 0,
      rawBarCount: 0,
      derivedBarCount: 0,
      activeEpisodeCount: 0,
      persistenceOutcome: null,
    });

    expect(state.snapshot()).toMatchObject({
      marketData: { lastTriggerTime: null, lastAcceptedAt: null },
      queue: { processedCount: 1, failedCount: 1, lastOutcome: 'failed' },
      evaluation: { state: 'idle', lastOutcome: null },
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
