import type { StrategyBar } from '../market-data/strategy-bar';
import { QuantityForwardFillProjector } from '../projection/quantity-forward-fill.projector';
import { compileStoredStrategyRule } from '../rules/strategy-rule.compiler';
import {
  buildStrategyEvaluationContext,
  StrategyAnalysisObservationCache,
} from './strategy-context.builder';
import { serializeStrategyContextSnapshot } from './strategy-context-snapshot.serializer';
import { evaluateStrategyPlan } from './strategy-rule.evaluator';

describe('shared strategy evaluation', () => {
  it('returns insufficient_history instead of evaluated false', () => {
    const plan = compileStoredStrategyRule(
      { field: 'indicator.kdj.k', operator: 'gt', value: 50 },
      'entry',
    );

    expect(evaluateStrategyPlan(plan, project(buildBars(12)))).toEqual({
      status: 'unavailable',
      reason: 'insufficient_history',
    });
  });

  it('returns field_unavailable only when the plan consumes missing quantity', () => {
    const quantityPlan = compileStoredStrategyRule(
      { field: 'k.volume', operator: 'gt', value: '0' },
      'entry',
    );
    const pricePlan = compileStoredStrategyRule(
      { field: 'k.close', operator: 'gt', value: 1 },
      'entry',
    );
    const projected = project(buildBars(1, { volume: null, amount: null }));

    expect(evaluateStrategyPlan(quantityPlan, projected)).toEqual({
      status: 'unavailable',
      reason: 'field_unavailable',
    });
    expect(evaluateStrategyPlan(pricePlan, projected)).toMatchObject({
      status: 'evaluated',
      matched: true,
    });
  });

  it.each([
    ['gt', 9, true],
    ['gte', 10, true],
    ['lt', 9, false],
    ['lte', 10, true],
    ['eq', 10, true],
    ['ne', 10, false],
  ] as const)(
    'evaluates finite-number operator %s',
    (operator, value, matched) => {
      const plan = compileStoredStrategyRule(
        { field: 'k.close', operator, value },
        'entry',
      );

      expect(evaluateStrategyPlan(plan, project(buildBars(1)))).toMatchObject({
        status: 'evaluated',
        matched,
      });
    },
  );

  it('uses prior <= threshold and current > threshold for crossesAbove', () => {
    const plan = compileStoredStrategyRule(
      { field: 'k.close', operator: 'crossesAbove', value: 10 },
      'entry',
    );
    const bars = buildBars(2);
    bars[0] = { ...bars[0], close: 10 };
    bars[1] = { ...bars[1], close: 11 };

    expect(evaluateStrategyPlan(plan, project(bars))).toMatchObject({
      status: 'evaluated',
      matched: true,
    });
  });

  it('uses prior >= threshold and current < threshold for decimal crossesBelow', () => {
    const plan = compileStoredStrategyRule(
      { field: 'k.volume', operator: 'crossesBelow', value: '100' },
      'exit',
    );
    const bars = buildBars(2);
    bars[0] = { ...bars[0], volume: '100' };
    bars[1] = { ...bars[1], volume: '99.99999999' };

    expect(evaluateStrategyPlan(plan, project(bars))).toMatchObject({
      status: 'evaluated',
      matched: true,
    });
  });

  it('compares decimal quantities above Number.MAX_SAFE_INTEGER exactly', () => {
    const plan = compileStoredStrategyRule(
      {
        field: 'k.amount',
        operator: 'gt',
        value: '9007199254740992.00000001',
      },
      'entry',
    );
    const bars = buildBars(1, {
      amount: '9007199254740992.00000002',
    });

    expect(evaluateStrategyPlan(plan, project(bars))).toMatchObject({
      status: 'evaluated',
      matched: true,
    });
  });

  it('keeps incomplete bars consumable unless k.type filters them', () => {
    const pricePlan = compileStoredStrategyRule(
      { field: 'k.close', operator: 'gt', value: 1 },
      'entry',
    );
    const completePlan = compileStoredStrategyRule(
      { field: 'k.type', operator: 'eq', value: 'complete' },
      'entry',
    );
    const projected = project(buildBars(1, { type: 'incomplete' }));

    expect(evaluateStrategyPlan(pricePlan, projected)).toMatchObject({
      status: 'evaluated',
      matched: true,
    });
    expect(evaluateStrategyPlan(completePlan, projected)).toMatchObject({
      status: 'evaluated',
      matched: false,
    });
  });

  it('evaluates all/any groups from one pre-materialized context', () => {
    const plan = compileStoredStrategyRule(
      {
        all: [
          { field: 'k.close', operator: 'gt', value: 9 },
          {
            any: [
              { field: 'k.high', operator: 'lt', value: 5 },
              { field: 'k.low', operator: 'eq', value: 9 },
            ],
          },
        ],
      },
      'entry',
    );

    expect(evaluateStrategyPlan(plan, project(buildBars(1)))).toMatchObject({
      status: 'evaluated',
      matched: true,
    });
  });

  it('reuses the fixed KDJ and adjacent MACD windows through the context builder', () => {
    const kdjPlan = compileStoredStrategyRule(
      { field: 'indicator.kdj.k', operator: 'gt', value: -1 },
      'entry',
    );
    const macdPlan = compileStoredStrategyRule(
      {
        field: 'indicator.macd.line',
        operator: 'crossesAbove',
        value: -100,
      },
      'entry',
    );
    const projected = project(buildBars(131));
    const kdj = evaluateStrategyPlan(kdjPlan, projected);
    const macd = evaluateStrategyPlan(macdPlan, projected);

    expect(kdj).toMatchObject({ status: 'evaluated' });
    expect(macd).toMatchObject({ status: 'evaluated' });
    if (macd.status !== 'evaluated') throw new Error('expected MACD context');
    expect(macd.context.fields['indicator.macd.line']?.previous).toEqual(
      expect.any(Number),
    );
  });

  it('shares KDJ 13/14 and MACD 130/131 calculations across plans at one anchor', () => {
    const calculateKdj = jest.fn((bars: readonly StrategyBar[]) => {
      void bars;
      return { k: 3, d: 2, j: 5 };
    });
    const calculateMacd = jest.fn((bars: readonly StrategyBar[]) => {
      void bars;
      return { line: 3, signal: 2, histogram: 1 };
    });
    const analysis = new StrategyAnalysisObservationCache(
      calculateKdj,
      calculateMacd,
    );
    const projected = project(buildBars(131));
    const plans = [
      compileStoredStrategyRule(
        { field: 'indicator.kdj.k', operator: 'gt', value: 0 },
        'entry',
      ),
      compileStoredStrategyRule(
        { field: 'indicator.kdj.d', operator: 'crossesAbove', value: 0 },
        'entry',
      ),
      compileStoredStrategyRule(
        { field: 'indicator.macd.line', operator: 'gt', value: 0 },
        'entry',
      ),
      compileStoredStrategyRule(
        {
          field: 'indicator.macd.histogram',
          operator: 'crossesAbove',
          value: 0,
        },
        'entry',
      ),
    ];

    plans.forEach((plan) => evaluateStrategyPlan(plan, projected, analysis));

    expect(calculateKdj).toHaveBeenCalledTimes(2);
    expect(calculateKdj.mock.calls.map(([bars]) => bars.length)).toEqual([
      13, 13,
    ]);
    expect(calculateMacd).toHaveBeenCalledTimes(2);
    expect(calculateMacd.mock.calls.map(([bars]) => bars.length)).toEqual([
      130, 130,
    ]);
  });

  it('rebuilds identical MACD context after an analysis-cache restart', () => {
    const plan = compileStoredStrategyRule(
      {
        field: 'indicator.macd.line',
        operator: 'crossesAbove',
        value: -100,
      },
      'entry',
    );
    const projected = project(buildBars(131));
    const before = evaluateStrategyPlan(
      plan,
      projected,
      new StrategyAnalysisObservationCache(),
    );
    const after = evaluateStrategyPlan(
      plan,
      projected,
      new StrategyAnalysisObservationCache(),
    );
    if (before.status !== 'evaluated' || after.status !== 'evaluated') {
      throw new Error('expected restart parity contexts');
    }

    expect(serializeStrategyContextSnapshot(plan, after.context)).toEqual(
      serializeStrategyContextSnapshot(plan, before.context),
    );
  });
});

describe('shared strategy context snapshot', () => {
  it('records raw/effective/resolution while keeping k.volume scalar', () => {
    const plan = compileStoredStrategyRule(
      { field: 'k.volume', operator: 'gt', value: '50' },
      'entry',
    );
    const bars = buildBars(2);
    bars[0] = { ...bars[0], volume: '100' };
    bars[1] = { ...bars[1], volume: null, type: 'incomplete' };
    const outcome = evaluateStrategyPlan(plan, project(bars));
    if (outcome.status !== 'evaluated') throw new Error('expected context');

    expect(serializeStrategyContextSnapshot(plan, outcome.context)).toEqual({
      k: { type: 'incomplete', volume: '100' },
      quantityEvidence: {
        current: {
          volume: {
            raw: null,
            effective: '100',
            resolution: 'forwardFilled',
          },
        },
      },
    });
  });

  it('records both observations for quantity crossover', () => {
    const plan = compileStoredStrategyRule(
      { field: 'k.amount', operator: 'crossesAbove', value: '100' },
      'entry',
    );
    const bars = buildBars(2);
    bars[0] = { ...bars[0], amount: '100' };
    bars[1] = { ...bars[1], amount: null };
    const outcome = evaluateStrategyPlan(plan, project(bars));
    if (outcome.status !== 'evaluated') throw new Error('expected context');
    const snapshot = serializeStrategyContextSnapshot(plan, outcome.context);

    expect(snapshot).toMatchObject({
      k: { amount: '100' },
      previous: { k: { amount: '100' } },
      quantityEvidence: {
        current: {
          amount: {
            raw: null,
            effective: '100',
            resolution: 'forwardFilled',
          },
        },
        previous: {
          amount: {
            raw: '100',
            effective: '100',
            resolution: 'observed',
          },
        },
      },
    });
  });

  it('materializes quantity evidence before a boolean condition can short-circuit', () => {
    const plan = compileStoredStrategyRule(
      {
        all: [
          { field: 'k.close', operator: 'lt', value: 0 },
          { field: 'k.volume', operator: 'gt', value: '50' },
        ],
      },
      'entry',
    );
    const bars = buildBars(2);
    bars[0] = { ...bars[0], volume: '100' };
    bars[1] = { ...bars[1], volume: null };
    const outcome = evaluateStrategyPlan(plan, project(bars));
    if (outcome.status !== 'evaluated') throw new Error('expected context');
    const snapshot = serializeStrategyContextSnapshot(plan, outcome.context);

    expect(outcome.matched).toBe(false);
    expect(snapshot).toHaveProperty(
      'quantityEvidence.current.volume.resolution',
      'forwardFilled',
    );
  });

  it('omits quantity evidence and full raw bars when quantity is unused', () => {
    const plan = compileStoredStrategyRule(
      { field: 'k.close', operator: 'gt', value: 1 },
      'entry',
    );
    const outcome = evaluateStrategyPlan(plan, project(buildBars(1)));
    if (outcome.status !== 'evaluated') throw new Error('expected context');
    const snapshot = serializeStrategyContextSnapshot(plan, outcome.context);

    expect(snapshot).toEqual({ k: { type: 'complete', close: 10 } });
    expect(snapshot).not.toHaveProperty('quantityEvidence');
    expect(JSON.stringify(snapshot)).not.toContain('rawBar');
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.k)).toBe(true);
  });

  it('keeps equivalent replay and realtime materialization deterministic', () => {
    const plan = compileStoredStrategyRule(
      {
        any: [
          { field: 'k.close', operator: 'crossesAbove', value: 9 },
          { field: 'k.volume', operator: 'gt', value: '50' },
        ],
      },
      'entry',
    );
    const raw = buildBars(2, { volume: '100' });
    const replay = evaluateStrategyPlan(plan, project(raw));
    const realtime = evaluateStrategyPlan(
      plan,
      project(raw.map((bar) => ({ ...bar }))),
    );

    expect(replay.status).toBe('evaluated');
    expect(realtime.status).toBe('evaluated');
    if (replay.status !== 'evaluated' || realtime.status !== 'evaluated') {
      throw new Error('expected contexts');
    }
    expect(replay.matched).toBe(realtime.matched);
    expect(serializeStrategyContextSnapshot(plan, replay.context)).toEqual(
      serializeStrategyContextSnapshot(plan, realtime.context),
    );
  });

  it('returns unavailable without producing a serializable context', () => {
    const plan = compileStoredStrategyRule(
      { field: 'k.volume', operator: 'gt', value: '0' },
      'entry',
    );
    const prepared = buildStrategyEvaluationContext(
      plan,
      project(buildBars(1, { volume: null })),
    );

    expect(prepared).toEqual({
      status: 'unavailable',
      reason: 'field_unavailable',
    });
    expect(prepared).not.toHaveProperty('context');
  });
});

function project(bars: readonly StrategyBar[]) {
  const projector = new QuantityForwardFillProjector();
  return bars.map((bar) => projector.project(bar));
}

function buildBars(
  count: number,
  overrides: Partial<StrategyBar> = {},
): StrategyBar[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 10 + Math.sin(index / 3) + index * 0.05;
    return {
      securityId: 1,
      source: 'tdx',
      period: 1,
      timestamp: new Date(Date.UTC(2026, 7, 3, 1, index)),
      open: close - 0.2,
      high: close + 1,
      low: close - 1,
      close,
      volume: String(100 + index),
      amount: String(200 + index),
      type: 'complete',
      ...overrides,
    };
  });
}
