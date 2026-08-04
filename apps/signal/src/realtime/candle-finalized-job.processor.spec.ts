import { compileStoredStrategyRule, type StrategyBar } from '@app/strategy';
import { CANDLE_FINALIZED_JOB_NAME } from '@app/signal';
import { CandleFinalizedJobProcessor } from './candle-finalized-job.processor';

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
