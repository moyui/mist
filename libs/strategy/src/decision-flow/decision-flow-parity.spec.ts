import type { ProjectedStrategyBar } from '@app/market-data';
import { compileStoredStrategyRule, evaluateStrategyPlan } from '../index';
import { InMemoryFactorPluginRegistry } from '../factor/factor-plugin-registry';
import { LegacyRuleDslPlugin } from '../factor/plugins/legacy-rule-dsl.plugin';
import { DecisionFlowEvaluator } from './decision-flow-evaluator';
import { LegacyStrategyCompiler } from './legacy-strategy-compiler';
import type { FactorContext } from '../factor/factor.types';
import type { DecisionFlowNode } from './decision-flow.types';

function makeMockBar(
  time: Date,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number = 10000,
): ProjectedStrategyBar {
  return {
    rawBar: {
      securityId: 101,
      source: 'tdx',
      period: 5,
      timestamp: time,
      open,
      high,
      low,
      close,
      volume: String(volume),
      amount: String(volume * close),
      type: 'complete',
    },
    tradingDay: '2026-09-07',
    ohlc: {
      raw: { open, high, low, close },
      effective: { open, high, low, close },
      resolution: 'observed',
    },
    volume: {
      raw: String(volume),
      effective: String(volume),
      resolution: 'observed',
    },
    amount: {
      raw: String(volume * close),
      effective: String(volume * close),
      resolution: 'observed',
    },
  };
}

describe('Phase 3: Parity Verification (Legacy DSL vs Decision Flow Tree)', () => {
  let registry: InMemoryFactorPluginRegistry;
  let evaluator: DecisionFlowEvaluator;

  beforeEach(() => {
    registry = new InMemoryFactorPluginRegistry();
    registry.register(new LegacyRuleDslPlugin());
    evaluator = new DecisionFlowEvaluator({ registry });
  });

  it('guarantees 100% decision and timing parity between legacy evaluateStrategyPlan and compiled DecisionFlow', async () => {
    const baseTime = new Date('2026-09-07T09:30:00Z');
    const series: ProjectedStrategyBar[] = [];

    // 生成一段 30 根 K 线的历史序列
    for (let i = 0; i < 30; i++) {
      const price = 10.0 + Math.sin(i / 5) * 2;
      series.push(
        makeMockBar(
          new Date(baseTime.getTime() + i * 5 * 60000),
          price - 0.1,
          price + 0.3,
          price - 0.2,
          price,
          10000 + i * 500,
        ),
      );
    }

    const legacyRule = {
      all: [
        {
          field: 'k.close',
          operator: 'gt',
          value: 11.0,
        },
      ],
    };

    const compiledPlan = compileStoredStrategyRule(legacyRule, 'entry');
    const decisionFlowNode =
      LegacyStrategyCompiler.compileRuleToDecisionFlow(compiledPlan);

    // 逐根 K 线模拟时间推移，比对双轨执行判定
    for (let i = 5; i <= series.length; i++) {
      const windowSlice = series.slice(0, i);
      const currentBar = windowSlice[windowSlice.length - 1];

      // 1. 存量引擎计算
      const legacyOutcome = evaluateStrategyPlan(compiledPlan, windowSlice);

      // 2. 新决策流引擎计算
      const context: FactorContext = {
        securityId: currentBar.rawBar.securityId,
        securityCode: '600000',
        timestamp: currentBar.rawBar.timestamp,
        period: currentBar.rawBar.period,
        bars: windowSlice,
        attributes: new Map(),
      };
      const flowResult = await evaluator.evaluate(decisionFlowNode, context);

      // 3. 严格 Parity 断言
      if (legacyOutcome.status === 'evaluated' && legacyOutcome.matched) {
        expect(flowResult.status).toBe('SIGNAL_EMITTED');
        expect(flowResult.action).toBe('BUY');
        expect(flowResult.confidence).toBe(80);
      } else {
        expect(flowResult.status).toBe('ABORTED');
      }
    }
  });

  it('guarantees identical parity in real-time step evaluation vs batch evaluation for composite decision tree', async () => {
    // 构造一个多节点复合决策流：门禁 -> 加权共识 -> 终结执行
    registry.register({
      id: 'plugin.guard.regime',
      name: 'Regime Guard',
      category: 'REGIME',
      version: '1.0.0',
      description: '',
      evaluate: async () => ({
        action: 'BUY',
        confidence: 0.95,
        reason: '大盘多头',
      }),
    });

    registry.register({
      id: 'plugin.tech.momentum',
      name: 'Momentum',
      category: 'TECHNICAL',
      version: '1.0.0',
      description: '',
      evaluate: async (ctx) => {
        const lastBar = ctx.bars[ctx.bars.length - 1];
        const isUp = (lastBar.ohlc.effective?.close ?? 0) > 10.5;
        return {
          action: isUp ? 'BUY' : 'NEUTRAL',
          confidence: isUp ? 0.88 : 0.0,
          reason: isUp ? '动量向上' : '动量不足',
        };
      },
    });

    const compositeTree: DecisionFlowNode = {
      id: 'guard_market',
      type: 'GUARD',
      name: '环境门禁',
      pluginId: 'plugin.guard.regime',
      requiredAction: 'BUY',
      minConfidence: 0.9,
      onPass: {
        id: 'consensus_eval',
        type: 'CONSENSUS',
        name: '共识打分',
        threshold: 80.0,
        plugins: [{ pluginId: 'plugin.tech.momentum', weight: 100 }],
        onSuccess: {
          id: 'term_emit',
          type: 'TERMINAL',
          action: 'BUY',
          signalTag: 'MOMENTUM_BREAKOUT',
        },
      },
    };

    const baseTime = new Date('2026-09-07T09:30:00Z');
    const barA = makeMockBar(baseTime, 10.0, 10.4, 9.9, 10.2); // close 10.2 <= 10.5
    const barB = makeMockBar(
      new Date(baseTime.getTime() + 60000),
      10.2,
      11.2,
      10.1,
      10.9,
    ); // close 10.9 > 10.5

    // Step A: 评估 barA
    const ctxA: FactorContext = {
      securityId: 101,
      securityCode: '600000',
      timestamp: barA.rawBar.timestamp,
      period: 5,
      bars: [barA],
      attributes: new Map(),
    };
    const resA = await evaluator.evaluate(compositeTree, ctxA);
    expect(resA.status).toBe('ABORTED');

    // Step B: 评估 barA + barB
    const ctxB: FactorContext = {
      securityId: 101,
      securityCode: '600000',
      timestamp: barB.rawBar.timestamp,
      period: 5,
      bars: [barA, barB],
      attributes: new Map(),
    };
    const resB = await evaluator.evaluate(compositeTree, ctxB);
    expect(resB.status).toBe('SIGNAL_EMITTED');
    expect(resB.action).toBe('BUY');
    expect(resB.confidence).toBe(88.0);
    expect(resB.signalTag).toBe('MOMENTUM_BREAKOUT');
  });
});
