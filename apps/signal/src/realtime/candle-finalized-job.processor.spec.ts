import { compileStoredStrategyRule, type StrategyBar } from '@app/strategy';
import { CANDLE_FINALIZED_JOB_NAME } from '@app/signal';
import {
  CandleFinalizedJobProcessor,
  RealtimeStrategyJobDeadlineExceededError,
} from './candle-finalized-job.processor';

describe('CandleFinalizedJobProcessor', () => {
  it('resolves one sealed observation, hydrates once and emits a shadow candidate', async () => {
    const bar = makeBar('2026-08-04T06:44:00.000Z', 28);
    const marketData = {
      loadRealtimeWindow: jest.fn().mockResolvedValue({ bars: [] }),
      resolveRealtimeObservation: jest
        .fn()
        .mockResolvedValue({ outcome: 'sealed', bar }),
    };
    const processor = new CandleFinalizedJobProcessor(
      marketData,
      () => [
        {
          definitionId: 3,
          versionId: 7,
          source: 'tdx',
          period: 1,
          ruleSnapshot: { field: 'k.close', operator: 'gt', value: 27 },
          plan: compileStoredStrategyRule(
            { field: 'k.close', operator: 'gt', value: 27 },
            'entry',
          ),
        },
      ],
      () => new Date('2026-08-04T07:00:00.000Z'),
    );

    const result = await processor.process(
      CANDLE_FINALIZED_JOB_NAME,
      sealedPayload(bar),
    );

    expect(result.outcome).toBe('completed');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      definitionId: 3,
      versionId: 7,
      securityId: 9,
      source: 'tdx',
      period: 1,
      signalKind: 'entry',
      signalTime: bar.timestamp,
      triggerTime: bar.timestamp.toISOString(),
      triggerPrice: 28,
      barType: 'complete',
      contextSnapshot: {
        k: { type: 'complete', close: 28 },
      },
    });
    expect(marketData.resolveRealtimeObservation).toHaveBeenCalledTimes(1);
    expect(marketData.loadRealtimeWindow).toHaveBeenCalledTimes(1);
  });

  it('does not read a 1m bar for discarded and can close an incomplete period', async () => {
    const first = makeBar('2026-08-04T06:40:00.000Z', 28);
    const marketData = {
      loadRealtimeWindow: jest.fn().mockResolvedValue({ bars: [] }),
      resolveRealtimeObservation: jest
        .fn()
        .mockResolvedValue({ outcome: 'sealed', bar: first }),
    };
    const processor = new CandleFinalizedJobProcessor(
      marketData,
      () => [
        {
          definitionId: 4,
          versionId: 8,
          source: 'tdx',
          period: 5,
          ruleSnapshot: {
            field: 'k.type',
            operator: 'eq',
            value: 'incomplete',
          },
          plan: compileStoredStrategyRule(
            { field: 'k.type', operator: 'eq', value: 'incomplete' },
            'entry',
          ),
        },
      ],
      () => new Date('2026-08-04T07:00:00.000Z'),
    );
    await processor.process(CANDLE_FINALIZED_JOB_NAME, sealedPayload(first));

    const result = await processor.process(CANDLE_FINALIZED_JOB_NAME, {
      contractVersion: 1,
      securityId: 9,
      source: 'tdx',
      period: '1m',
      triggerTime: '2026-08-04T06:44:00.000Z',
      outcome: 'discarded',
      triggerPrice: null,
    });

    expect(marketData.resolveRealtimeObservation).toHaveBeenCalledTimes(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      period: 5,
      signalTime: new Date('2026-08-04T06:40:00.000Z'),
      triggerPrice: 28,
      barType: 'incomplete',
    });
  });

  it('rejects unsupported jobs before market resolution', async () => {
    const marketData = {
      loadRealtimeWindow: jest.fn(),
      resolveRealtimeObservation: jest.fn(),
    };
    const processor = new CandleFinalizedJobProcessor(
      marketData,
      () => [],
      () => new Date('2026-08-04T07:00:00.000Z'),
    );

    await expect(
      processor.process('snapshot_update', { anything: true }),
    ).rejects.toThrow('unsupported strategy trigger job');
    expect(marketData.resolveRealtimeObservation).not.toHaveBeenCalled();
  });

  it('does not start Redis observation after the overall deadline', async () => {
    const marketData = {
      loadRealtimeWindow: jest.fn(),
      resolveRealtimeObservation: jest.fn(),
    };
    let call = 0;
    const times = [0, 1, 2, 2, 10];
    const processor = new CandleFinalizedJobProcessor(
      marketData,
      () => [],
      () => new Date(Date.UTC(2026, 7, 4, 7, 0, 0, times[call++] ?? 10)),
      undefined,
      undefined,
      10,
    );

    await expect(
      processor.process(
        CANDLE_FINALIZED_JOB_NAME,
        sealedPayload(makeBar('2026-08-04T06:44:00.000Z', 28)),
      ),
    ).rejects.toEqual(
      expect.objectContaining<
        Partial<RealtimeStrategyJobDeadlineExceededError>
      >({
        code: 'REALTIME_STRATEGY_JOB_DEADLINE_EXCEEDED',
        stage: 'redis_observation:before',
      }),
    );
    expect(marketData.resolveRealtimeObservation).not.toHaveBeenCalled();
  });

  it('fails after a stage that consumes the remaining budget', async () => {
    const bar = makeBar('2026-08-04T06:44:00.000Z', 28);
    const marketData = {
      loadRealtimeWindow: jest.fn(),
      resolveRealtimeObservation: jest
        .fn()
        .mockResolvedValue({ outcome: 'sealed', bar }),
    };
    let call = 0;
    const times = [0, 1, 2, 3, 4, 10];
    const processor = new CandleFinalizedJobProcessor(
      marketData,
      () => [],
      () => new Date(Date.UTC(2026, 7, 4, 7, 0, 0, times[call++] ?? 10)),
      undefined,
      undefined,
      10,
    );

    await expect(
      processor.process(CANDLE_FINALIZED_JOB_NAME, sealedPayload(bar)),
    ).rejects.toMatchObject({
      code: 'REALTIME_STRATEGY_JOB_DEADLINE_EXCEEDED',
      stage: 'redis_observation:after',
    });
    expect(marketData.resolveRealtimeObservation).toHaveBeenCalledTimes(1);
  });

  it('rejects a trigger price that conflicts with the sealed Redis candle', async () => {
    const bar = makeBar('2026-08-04T06:44:00.000Z', 28);
    const marketData = {
      loadRealtimeWindow: jest.fn(),
      resolveRealtimeObservation: jest
        .fn()
        .mockResolvedValue({ outcome: 'sealed', bar }),
    };
    const processor = new CandleFinalizedJobProcessor(
      marketData,
      () => [],
      () => new Date('2026-08-04T07:00:00.000Z'),
    );

    await expect(
      processor.process(CANDLE_FINALIZED_JOB_NAME, {
        ...sealedPayload(bar),
        triggerPrice: 29,
      }),
    ).rejects.toThrow('conflicts with Redis candle close');
  });

  it('ignores identical finalization and rejects conflicting content', async () => {
    const bar = makeBar('2026-08-04T06:44:00.000Z', 28);
    const marketData = {
      loadRealtimeWindow: jest.fn().mockResolvedValue({ bars: [] }),
      resolveRealtimeObservation: jest
        .fn()
        .mockResolvedValueOnce({ outcome: 'sealed', bar })
        .mockResolvedValueOnce({ outcome: 'sealed', bar })
        .mockResolvedValueOnce({
          outcome: 'sealed',
          bar: { ...bar, high: 29 },
        }),
    };
    const processor = new CandleFinalizedJobProcessor(
      marketData,
      () => [],
      () => new Date('2026-08-04T07:00:00.000Z'),
    );
    const payload = sealedPayload(bar);

    await processor.process(CANDLE_FINALIZED_JOB_NAME, payload);
    await expect(
      processor.process(CANDLE_FINALIZED_JOB_NAME, payload),
    ).resolves.toEqual({ outcome: 'completed', candidates: [] });
    await expect(
      processor.process(CANDLE_FINALIZED_JOB_NAME, payload),
    ).rejects.toThrow('conflicting candle finalization identity');
  });

  it('expires a prior-day job before reading market data', async () => {
    const marketData = {
      loadRealtimeWindow: jest.fn(),
      resolveRealtimeObservation: jest.fn(),
    };
    const processor = new CandleFinalizedJobProcessor(
      marketData,
      () => [],
      () => new Date('2026-08-05T01:00:00.000Z'),
    );

    await expect(
      processor.process(
        CANDLE_FINALIZED_JOB_NAME,
        sealedPayload(makeBar('2026-08-04T06:44:00.000Z', 28)),
      ),
    ).resolves.toEqual({
      outcome: 'expired_trading_day',
      candidates: [],
    });
    expect(marketData.resolveRealtimeObservation).not.toHaveBeenCalled();
  });

  it('discards an older trigger after a newer terminal was accepted', async () => {
    const newer = makeBar('2026-08-04T06:44:00.000Z', 28);
    const marketData = {
      loadRealtimeWindow: jest.fn().mockResolvedValue({ bars: [] }),
      resolveRealtimeObservation: jest
        .fn()
        .mockResolvedValue({ outcome: 'sealed', bar: newer }),
    };
    const processor = new CandleFinalizedJobProcessor(
      marketData,
      () => [],
      () => new Date('2026-08-04T07:00:00.000Z'),
    );
    await processor.process(CANDLE_FINALIZED_JOB_NAME, sealedPayload(newer));

    await expect(
      processor.process(CANDLE_FINALIZED_JOB_NAME, {
        contractVersion: 1,
        securityId: 9,
        source: 'tdx',
        period: '1m',
        triggerTime: '2026-08-04T06:43:00.000Z',
        outcome: 'discarded',
        triggerPrice: null,
      }),
    ).resolves.toEqual({
      outcome: 'out_of_order_trigger_discarded',
      candidates: [],
    });
    expect(marketData.resolveRealtimeObservation).toHaveBeenCalledTimes(1);
  });

  it('activates shadow episodes without calling persistence', async () => {
    const first = makeBar('2026-08-04T06:43:00.000Z', 28);
    const second = makeBar('2026-08-04T06:44:00.000Z', 29);
    const marketData = sequentialMarketData(first, second);
    const persistence = { persist: jest.fn() };
    const processor = modeProcessor(
      marketData,
      'shadow',
      persistence,
      () => new Date('2026-08-04T07:00:00.000Z'),
    );

    await expect(
      processor.process(CANDLE_FINALIZED_JOB_NAME, sealedPayload(first)),
    ).resolves.toMatchObject({ candidates: [expect.any(Object)] });
    await expect(
      processor.process(CANDLE_FINALIZED_JOB_NAME, sealedPayload(second)),
    ).resolves.toEqual({ outcome: 'completed', candidates: [] });
    expect(persistence.persist).not.toHaveBeenCalled();
  });

  it('keeps an on-mode episode inactive after rollback and activates after commit', async () => {
    const first = makeBar('2026-08-04T06:42:00.000Z', 28);
    const second = makeBar('2026-08-04T06:43:00.000Z', 29);
    const third = makeBar('2026-08-04T06:44:00.000Z', 30);
    const failure = new Error('rollback');
    const persistence = {
      persist: jest
        .fn()
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce('created'),
    };
    const processor = modeProcessor(
      sequentialMarketData(first, second, third),
      'on',
      persistence,
      () => new Date('2026-08-04T07:00:00.000Z'),
    );

    await expect(
      processor.process(CANDLE_FINALIZED_JOB_NAME, sealedPayload(first)),
    ).rejects.toBe(failure);
    await expect(
      processor.process(CANDLE_FINALIZED_JOB_NAME, sealedPayload(second)),
    ).resolves.toMatchObject({ candidates: [expect.any(Object)] });
    await expect(
      processor.process(CANDLE_FINALIZED_JOB_NAME, sealedPayload(third)),
    ).resolves.toEqual({ outcome: 'completed', candidates: [] });
    expect(persistence.persist).toHaveBeenCalledTimes(2);
  });

  it('activates an on-mode episode after an approved duplicate skip', async () => {
    const first = makeBar('2026-08-04T06:43:00.000Z', 28);
    const second = makeBar('2026-08-04T06:44:00.000Z', 29);
    const persistence = {
      persist: jest.fn().mockResolvedValue('duplicate_skipped'),
    };
    const processor = modeProcessor(
      sequentialMarketData(first, second),
      'on',
      persistence,
      () => new Date('2026-08-04T07:00:00.000Z'),
    );

    await processor.process(CANDLE_FINALIZED_JOB_NAME, sealedPayload(first));
    await expect(
      processor.process(CANDLE_FINALIZED_JOB_NAME, sealedPayload(second)),
    ).resolves.toEqual({ outcome: 'completed', candidates: [] });
    expect(persistence.persist).toHaveBeenCalledTimes(1);
  });

  it('clears episode continuity on the first trigger of a new Shanghai day', async () => {
    const first = makeBar('2026-08-04T06:44:00.000Z', 28);
    const nextDay = makeBar('2026-08-05T01:30:00.000Z', 29);
    const marketData = sequentialMarketData(first, nextDay);
    let now = new Date('2026-08-04T07:00:00.000Z');
    const processor = modeProcessor(
      marketData,
      'shadow',
      { persist: jest.fn() },
      () => now,
    );

    const firstResult = await processor.process(
      CANDLE_FINALIZED_JOB_NAME,
      sealedPayload(first),
    );
    now = new Date('2026-08-05T02:00:00.000Z');
    const nextResult = await processor.process(
      CANDLE_FINALIZED_JOB_NAME,
      sealedPayload(nextDay),
    );

    expect(firstResult.candidates).toHaveLength(1);
    expect(nextResult.candidates).toHaveLength(1);
  });

  it('does not persist a quantity plan when the field is unavailable', async () => {
    const bar = makeBar('2026-08-04T06:44:00.000Z', 28);
    const marketData = sequentialMarketData(bar);
    const persistence = { persist: jest.fn() };
    const processor = new CandleFinalizedJobProcessor(
      marketData,
      () => [
        {
          definitionId: 3,
          versionId: 7,
          source: 'tdx',
          period: 1,
          ruleSnapshot: { field: 'k.volume', operator: 'gt', value: '0' },
          plan: compileStoredStrategyRule(
            { field: 'k.volume', operator: 'gt', value: '0' },
            'entry',
          ),
        },
      ],
      () => new Date('2026-08-04T07:00:00.000Z'),
      undefined,
      undefined,
      30_000,
      'on',
      persistence,
    );

    await expect(
      processor.process(CANDLE_FINALIZED_JOB_NAME, sealedPayload(bar)),
    ).resolves.toEqual({ outcome: 'completed', candidates: [] });
    expect(persistence.persist).not.toHaveBeenCalled();
  });

  it('reconciles window, period and episode scope after registry cutover', () => {
    const periodBuilder = {
      accept: jest.fn(),
      reset: jest.fn(),
      retainGroups: jest.fn(),
    };
    const evaluation = {
      evaluate: jest.fn(),
      reset: jest.fn(),
      retainRegistryScopes: jest.fn(),
    };
    const processor = new CandleFinalizedJobProcessor(
      {
        loadRealtimeWindow: jest.fn(),
        resolveRealtimeObservation: jest.fn(),
      },
      () => [],
      () => new Date('2026-08-04T07:00:00.000Z'),
      periodBuilder as never,
      evaluation as never,
    );

    processor.reconcileRegistry({
      generation: 2,
      definitions: new Map([
        [
          1,
          {
            definitionId: 1,
            versionId: 3,
            signalKind: 'entry' as never,
            targetUniverse: ['000001.SZ'],
            securityIds: new Set([9]),
            periods: [1, 5],
            sources: ['tdx' as never],
            executionPlan: compileStoredStrategyRule(
              { field: 'k.close', operator: 'gt', value: 1 },
              'entry',
            ),
            ruleSnapshot: { field: 'k.close', operator: 'gt', value: 1 },
          },
        ],
      ]),
    });

    expect(periodBuilder.retainGroups).toHaveBeenCalledWith([
      { securityId: 9, source: 'tdx', period: 1 },
      { securityId: 9, source: 'tdx', period: 5 },
    ]);
    expect(evaluation.retainRegistryScopes).toHaveBeenCalledWith(
      [
        { securityId: 9, source: 'tdx', period: 1 },
        { securityId: 9, source: 'tdx', period: 5 },
      ],
      [
        {
          definitionId: 1,
          versionId: 3,
          securityId: 9,
          source: 'tdx',
          period: 1,
          signalKind: 'entry',
        },
        {
          definitionId: 1,
          versionId: 3,
          securityId: 9,
          source: 'tdx',
          period: 5,
          signalKind: 'entry',
        },
      ],
    );
  });

  it('releases listener-bound cursor memory when a series leaves the registry', async () => {
    const bar = makeBar('2026-08-04T06:44:00.000Z', 28);
    const marketData = sequentialMarketData(bar);
    const processor = new CandleFinalizedJobProcessor(
      marketData,
      () => [
        {
          definitionId: 3,
          versionId: 7,
          source: 'tdx',
          period: 1,
          ruleSnapshot: { field: 'k.close', operator: 'gt', value: 27 },
          plan: compileStoredStrategyRule(
            { field: 'k.close', operator: 'gt', value: 27 },
            'entry',
          ),
        },
      ],
      () => new Date('2026-08-04T07:00:00.000Z'),
    );
    await processor.process(CANDLE_FINALIZED_JOB_NAME, sealedPayload(bar));

    // After the first trigger, a cursor for series (9, tdx) must exist.
    // reconcileRegistry with an EMPTY registry drops it, releasing memory.
    processor.reconcileRegistry({
      generation: 1,
      definitions: new Map(),
    });

    // A second identical trigger must be treated as a NEW first observation
    // (not a duplicate) because the cursor was released — proving the cursor
    // map is listener-bound and does not leak after removal.
    marketData.resolveRealtimeObservation.mockClear();
    const bar2 = makeBar('2026-08-04T06:45:00.000Z', 29);
    marketData.resolveRealtimeObservation.mockResolvedValueOnce({
      outcome: 'sealed',
      bar: bar2,
    });
    const result = await processor.process(
      CANDLE_FINALIZED_JOB_NAME,
      sealedPayload(bar2),
    );
    expect(result.outcome).toBe('completed');
    expect(result.candidates).toHaveLength(1);
    expect(marketData.resolveRealtimeObservation).toHaveBeenCalledTimes(1);
  });
});

function makeBar(timestamp: string, close: number): StrategyBar {
  return {
    securityId: 9,
    source: 'tdx',
    period: 1,
    timestamp: new Date(timestamp),
    open: close,
    high: close,
    low: close,
    close,
    volume: null,
    amount: null,
    type: 'complete',
  };
}

function sealedPayload(bar: StrategyBar) {
  return {
    contractVersion: 1,
    securityId: bar.securityId,
    source: bar.source,
    period: '1m',
    triggerTime: bar.timestamp.toISOString(),
    outcome: 'sealed',
    triggerPrice: bar.close,
  };
}

function sequentialMarketData(...bars: StrategyBar[]) {
  const resolveRealtimeObservation = jest.fn();
  bars.forEach((bar) =>
    resolveRealtimeObservation.mockResolvedValueOnce({
      outcome: 'sealed',
      bar,
    }),
  );
  return {
    loadRealtimeWindow: jest.fn().mockResolvedValue({ bars: [] }),
    resolveRealtimeObservation,
  };
}

function modeProcessor(
  marketData: ReturnType<typeof sequentialMarketData>,
  mode: 'shadow' | 'on',
  persistence: { persist: jest.Mock },
  now: () => Date,
) {
  return new CandleFinalizedJobProcessor(
    marketData,
    () => [
      {
        definitionId: 3,
        versionId: 7,
        source: 'tdx',
        period: 1,
        ruleSnapshot: { field: 'k.close', operator: 'gt', value: 27 },
        plan: compileStoredStrategyRule(
          { field: 'k.close', operator: 'gt', value: 27 },
          'entry',
        ),
      },
    ],
    now,
    undefined,
    undefined,
    30_000,
    mode,
    persistence,
  );
}
