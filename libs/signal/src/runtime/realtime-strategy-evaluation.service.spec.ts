import {
  compileStoredStrategyRule,
  type StrategyBar,
  type StrategyRealtimeMarketDataPort,
} from '@app/strategy';
import {
  RealtimeStrategyEvaluationService,
  type RealtimeStrategyExecutionPlan,
} from './realtime-strategy-evaluation.service';
import { ChanBspEpisodeCursor } from './chan-bsp/chan-bsp.episode';
import type { ChanBspEvent, ChanBspPlan } from './chan-bsp/chan-bsp.types';

function makeBar(timestamp: string, close = 10, period = 30): StrategyBar {
  return {
    securityId: 9,
    source: 'tdx',
    period,
    timestamp: new Date(timestamp),
    open: close - 0.2,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: '100',
    amount: '200',
    type: 'complete',
  };
}

function makeWindow(
  count: number,
  startTime = '2026-08-01T01:30:00.000Z',
): StrategyBar[] {
  return Array.from({ length: count }, (_, index) =>
    makeBar(
      new Date(
        new Date(startTime).getTime() + index * 30 * 60_000,
      ).toISOString(),
      10 + index * 0.1,
    ),
  );
}

function ruleDslPlan(
  overrides: Partial<RealtimeStrategyExecutionPlan> = {},
): RealtimeStrategyExecutionPlan {
  return {
    definitionId: 3,
    versionId: 7,
    source: 'tdx',
    period: 30,
    kind: 'rule_dsl',
    plan: compileStoredStrategyRule(
      { field: 'k.close', operator: 'gt', value: 10 },
      'entry',
    ),
    ruleSnapshot: { field: 'k.close', operator: 'gt', value: 10 },
    ...overrides,
  } as RealtimeStrategyExecutionPlan;
}

function chanBspPlan(overrides: Partial<ChanBspPlan> = {}): ChanBspPlan {
  return {
    units: 'duan',
    points: { first: true, second: true, third: true },
    direction: 'both',
    requiredBarCount: 100,
    ...overrides,
  };
}

function chanBspExecutionPlan(
  plan: ChanBspPlan,
  overrides: Partial<RealtimeStrategyExecutionPlan> = {},
): RealtimeStrategyExecutionPlan {
  return {
    definitionId: 4,
    versionId: 8,
    source: 'tdx',
    period: 30,
    kind: 'chan_bsp',
    plan,
    ruleSnapshot: { units: 'duan' },
    ...overrides,
  } as RealtimeStrategyExecutionPlan;
}

function chanBspEvent(overrides: Partial<ChanBspEvent> = {}): ChanBspEvent {
  return {
    type: 'third_buy',
    units: 'duan',
    time: new Date('2026-08-04T06:00:00.000Z'),
    price: 12.5,
    zhongshuIndex: 0,
    zg: 10,
    zd: 9,
    unitIndex: 3,
    ...overrides,
  };
}

function marketDataWithWindow(
  bars: StrategyBar[],
): StrategyRealtimeMarketDataPort {
  return {
    loadRealtimeWindow: jest.fn().mockResolvedValue({ bars }),
    resolveRealtimeObservation: jest.fn(),
  } as unknown as StrategyRealtimeMarketDataPort;
}

describe('RealtimeStrategyEvaluationService dispatch', () => {
  it('evaluates a rule_dsl plan through the existing DSL path', async () => {
    const window = makeWindow(20);
    const service = new RealtimeStrategyEvaluationService(
      marketDataWithWindow(window),
    );
    const bar = makeBar('2026-08-04T06:30:00.000Z', 20, 30);

    const candidates = await service.evaluate(bar, [ruleDslPlan()]);

    // k.close(20) > 10 matches
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      definitionId: 3,
      signalKind: 'entry',
      triggerPrice: 20,
    });
  });

  it('dispatches a chan_bsp plan through the detector and emits fresh events', async () => {
    const window = makeWindow(120);
    const detector = {
      evaluate: jest.fn().mockReturnValue([chanBspEvent()]),
    };
    const cursors = new ChanBspEpisodeCursor();
    const service = new RealtimeStrategyEvaluationService(
      marketDataWithWindow(window),
      undefined,
      undefined,
      detector as never,
      cursors,
    );
    const bar = makeBar('2026-08-04T06:30:00.000Z', 20, 30);

    const candidates = await service.evaluate(bar, [
      chanBspExecutionPlan(chanBspPlan()),
    ]);

    expect(detector.evaluate).toHaveBeenCalledTimes(1);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      definitionId: 4,
      signalKind: 'entry', // third_buy → entry
      signalTime: new Date('2026-08-04T06:00:00.000Z'),
      triggerTime: '2026-08-04T06:00:00.000Z',
      triggerPrice: 12.5,
      barType: 'complete',
    });
    expect(candidates[0].contextSnapshot).toEqual({
      chanBsp: {
        type: 'third_buy',
        units: 'duan',
        level: 30,
        zhongshuIndex: 0,
        zg: 10,
        zd: 9,
      },
    });
  });

  it('maps a sell event to exit signal kind', async () => {
    const detector = {
      evaluate: jest
        .fn()
        .mockReturnValue([chanBspEvent({ type: 'first_sell' })]),
    };
    const service = new RealtimeStrategyEvaluationService(
      marketDataWithWindow(makeWindow(120)),
      undefined,
      undefined,
      detector as never,
      new ChanBspEpisodeCursor(),
    );

    const candidates = await service.evaluate(
      makeBar('2026-08-04T06:30:00.000Z', 20, 30),
      [chanBspExecutionPlan(chanBspPlan())],
    );

    expect(candidates[0].signalKind).toBe('exit');
  });

  it('does not re-emit events at or below the cursor (incremental)', async () => {
    const detector = {
      evaluate: jest
        .fn()
        .mockReturnValueOnce([chanBspEvent()])
        .mockReturnValue([chanBspEvent()]),
    };
    const cursors = new ChanBspEpisodeCursor();
    const service = new RealtimeStrategyEvaluationService(
      marketDataWithWindow(makeWindow(120)),
      undefined,
      undefined,
      detector as never,
      cursors,
    );
    const bar = makeBar('2026-08-04T06:30:00.000Z', 20, 30);
    const plan = [chanBspExecutionPlan(chanBspPlan())];

    const first = await service.evaluate(bar, plan);
    const second = await service.evaluate(bar, plan);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it('produces no candidate when the detector confirms nothing', async () => {
    const detector = { evaluate: jest.fn().mockReturnValue([]) };
    const service = new RealtimeStrategyEvaluationService(
      marketDataWithWindow(makeWindow(120)),
      undefined,
      undefined,
      detector as never,
      new ChanBspEpisodeCursor(),
    );

    const candidates = await service.evaluate(
      makeBar('2026-08-04T06:30:00.000Z', 20, 30),
      [chanBspExecutionPlan(chanBspPlan())],
    );

    expect(candidates).toEqual([]);
    // 结构不足不是 unavailable：不抛错、无 candidate
  });

  it('resets chan_bsp cursors on reset', async () => {
    const detector = {
      evaluate: jest
        .fn()
        .mockReturnValueOnce([chanBspEvent()])
        .mockReturnValue([chanBspEvent()]),
    };
    const cursors = new ChanBspEpisodeCursor();
    const service = new RealtimeStrategyEvaluationService(
      marketDataWithWindow(makeWindow(120)),
      undefined,
      undefined,
      detector as never,
      cursors,
    );
    const bar = makeBar('2026-08-04T06:30:00.000Z', 20, 30);
    const plan = [chanBspExecutionPlan(chanBspPlan())];

    await service.evaluate(bar, plan);
    expect(await service.evaluate(bar, plan)).toHaveLength(0);

    service.reset();
    expect(await service.evaluate(bar, plan)).toHaveLength(1);
  });

  it('uses the chan_bsp plan budget in the shared window requirement', async () => {
    const window = makeWindow(500, '2026-07-20T01:30:00.000Z');
    const marketData = marketDataWithWindow(window);
    const service = new RealtimeStrategyEvaluationService(marketData);
    const bar = makeBar('2026-08-04T06:30:00.000Z', 20, 30);

    await service.evaluate(bar, [
      chanBspExecutionPlan(chanBspPlan({ requiredBarCount: 500 })),
    ]);

    expect(marketData.loadRealtimeWindow).toHaveBeenCalledWith(
      expect.objectContaining({ requiredBars: 500 }),
    );
  });
});
