import type { ProjectedStrategyBar } from '@app/market-data';
import { InMemoryFactorPluginRegistry } from '../factor/factor-plugin-registry';
import type { FactorContext } from '../factor/factor.types';
import { DecisionFlowEvaluator } from './decision-flow-evaluator';
import type { DecisionFlowNode } from './decision-flow.types';
import { FlowBlackboard } from './flow-blackboard';
import { DecisionExecutionTraceBuilder } from './decision-trace-builder';
import { LegacyStrategyCompiler } from './legacy-strategy-compiler';
import { LegacyRuleDslPlugin } from '../factor/plugins/legacy-rule-dsl.plugin';

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
      securityId: 1,
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

describe('Phase 2: Decision Flow Engine', () => {
  let registry: InMemoryFactorPluginRegistry;
  let evaluator: DecisionFlowEvaluator;

  beforeEach(() => {
    registry = new InMemoryFactorPluginRegistry();
    evaluator = new DecisionFlowEvaluator({ registry });
  });

  describe('FlowBlackboard', () => {
    it('manages attributes and serializes to JSON object', () => {
      const board = new FlowBlackboard({ 'market.regime': 'BULL' });
      expect(board.get('market.regime')).toBe('BULL');

      board.set('chan.central', { zd: 10.0, zg: 12.0 });
      expect(board.has('chan.central')).toBe(true);

      const json = board.toJSON();
      expect(json['market.regime']).toBe('BULL');
      expect((json['chan.central'] as any).zd).toBe(10.0);

      board.delete('market.regime');
      expect(board.has('market.regime')).toBe(false);
      expect(board.size).toBe(1);

      board.clear();
      expect(board.size).toBe(0);
    });
  });

  describe('GuardNode (Fast-Fail Short-Circuit)', () => {
    it('passes through onPass when requiredAction and minConfidence are satisfied', async () => {
      registry.register({
        id: 'plugin.guard.mock',
        name: 'Mock Guard',
        category: 'REGIME',
        version: '1.0.0',
        description: '',
        evaluate: async () => ({
          action: 'BUY',
          confidence: 0.9,
          reason: '大盘安全',
        }),
      });

      const flow: DecisionFlowNode = {
        id: 'guard_1',
        type: 'GUARD',
        name: '环境门禁',
        pluginId: 'plugin.guard.mock',
        requiredAction: 'BUY',
        minConfidence: 0.8,
        onPass: {
          id: 'term_buy',
          type: 'TERMINAL',
          action: 'BUY',
          signalTag: 'SAFE_BUY',
        },
      };

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 5,
        bars: [],
        attributes: new Map(),
      };

      const result = await evaluator.evaluate(flow, context);
      expect(result.status).toBe('SIGNAL_EMITTED');
      expect(result.action).toBe('BUY');
      expect(result.signalTag).toBe('SAFE_BUY');
      expect(result.trace).toHaveLength(2);
      expect(result.trace[0].type).toBe('GUARD');
      expect(result.trace[1].type).toBe('TERMINAL');
    });

    it('aborts when guard confidence is below minConfidence', async () => {
      registry.register({
        id: 'plugin.guard.mock',
        name: 'Mock Guard',
        category: 'REGIME',
        version: '1.0.0',
        description: '',
        evaluate: async () => ({
          action: 'BUY',
          confidence: 0.6,
          reason: '微弱看多',
        }),
      });

      const flow: DecisionFlowNode = {
        id: 'guard_1',
        type: 'GUARD',
        name: '环境门禁',
        pluginId: 'plugin.guard.mock',
        requiredAction: 'BUY',
        minConfidence: 0.8,
        onPass: {
          id: 'term_buy',
          type: 'TERMINAL',
          action: 'BUY',
        },
      };

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 5,
        bars: [],
        attributes: new Map(),
      };

      const result = await evaluator.evaluate(flow, context);
      expect(result.status).toBe('ABORTED');
      expect(result.reason).toContain('前置门禁');
      expect(result.trace).toHaveLength(1);
    });
  });

  describe('BranchNode (Condition Routing)', () => {
    it('routes to true branch when blackboard attribute matches', async () => {
      const flow: DecisionFlowNode = {
        id: 'branch_regime',
        type: 'BRANCH',
        name: '大盘多空路由',
        condition: {
          attributeKey: 'market.regime',
          operator: 'eq',
          value: 'BULL',
        },
        branches: {
          true: {
            id: 'term_bull',
            type: 'TERMINAL',
            action: 'BUY',
            signalTag: 'BULL_STRATEGY',
          },
          false: {
            id: 'term_bear',
            type: 'TERMINAL',
            action: 'ABORT',
            reason: '非牛市环境，不执行该分支',
          },
        },
      };

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 5,
        bars: [],
        attributes: new Map([['market.regime', 'BULL']]),
      };

      const result = await evaluator.evaluate(flow, context);
      expect(result.status).toBe('SIGNAL_EMITTED');
      expect(result.signalTag).toBe('BULL_STRATEGY');
    });

    it('routes to false branch when condition does not match', async () => {
      const flow: DecisionFlowNode = {
        id: 'branch_regime',
        type: 'BRANCH',
        name: '大盘多空路由',
        condition: {
          attributeKey: 'market.regime',
          operator: 'eq',
          value: 'BULL',
        },
        branches: {
          true: {
            id: 'term_bull',
            type: 'TERMINAL',
            action: 'BUY',
          },
          false: {
            id: 'term_bear',
            type: 'TERMINAL',
            action: 'ABORT',
            reason: '震荡或弱市环境',
          },
        },
      };

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 5,
        bars: [],
        attributes: new Map([['market.regime', 'BEAR']]),
      };

      const result = await evaluator.evaluate(flow, context);
      expect(result.status).toBe('ABORTED');
      expect(result.reason).toBe('震荡或弱市环境');
    });
  });

  describe('ExtractorNode (Blackboard Enrichment)', () => {
    it('executes extractor plugin and exposes evidence to blackboard for downstream consumption', async () => {
      registry.register({
        id: 'plugin.extractor.chan',
        name: 'Chan Extractor',
        category: 'CHAN',
        version: '1.0.0',
        description: '',
        evaluate: async () => ({
          action: 'NEUTRAL',
          confidence: 1.0,
          reason: '中枢区间提取成功',
          evidence: { zd: 10.5, zg: 12.8 },
        }),
      });

      const flow: DecisionFlowNode = {
        id: 'extractor_chan',
        type: 'EXTRACTOR',
        name: '提取中枢区间',
        pluginId: 'plugin.extractor.chan',
        exportAttributeKey: 'chan.central',
        next: {
          id: 'branch_after_extract',
          type: 'BRANCH',
          name: '中枢突破判断',
          condition: {
            attributeKey: 'chan.central',
            operator: 'ne',
            value: undefined,
          },
          branches: {
            true: {
              id: 'term_extracted',
              type: 'TERMINAL',
              action: 'BUY',
              signalTag: 'CENTRAL_EXTRACTED',
            },
            false: {
              id: 'term_abort',
              type: 'TERMINAL',
              action: 'ABORT',
            },
          },
        },
      };

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 5,
        bars: [],
        attributes: new Map(),
      };

      const result = await evaluator.evaluate(flow, context);
      expect(result.status).toBe('SIGNAL_EMITTED');
      expect(result.signalTag).toBe('CENTRAL_EXTRACTED');
      expect(context.attributes.get('chan.central')).toEqual({
        zd: 10.5,
        zg: 12.8,
      });
    });
  });

  describe('ConsensusNode (Parallel Weighted Scoring & Veto)', () => {
    beforeEach(() => {
      registry.register({
        id: 'plugin.vote.p1',
        name: 'Plugin 1',
        category: 'TECHNICAL',
        version: '1.0.0',
        description: '',
        evaluate: async () => ({
          action: 'BUY',
          confidence: 0.9,
          reason: 'P1看多',
        }),
      });

      registry.register({
        id: 'plugin.vote.p2',
        name: 'Plugin 2',
        category: 'CAPITAL',
        version: '1.0.0',
        description: '',
        evaluate: async () => ({
          action: 'BUY',
          confidence: 0.8,
          reason: 'P2看多',
        }),
      });

      registry.register({
        id: 'plugin.vote.veto',
        name: 'Veto Plugin',
        category: 'FUNDAMENTAL',
        version: '1.0.0',
        description: '',
        evaluate: async () => ({
          action: 'SELL',
          confidence: 0.95,
          reason: '重大财务雷点',
        }),
      });
    });

    it('calculates weighted score and passes when score exceeds threshold', async () => {
      // 权重 60 * 0.9 + 40 * 0.8 = 54 + 32 = 86 分
      const flow: DecisionFlowNode = {
        id: 'consensus_1',
        type: 'CONSENSUS',
        name: '多因子加权共识',
        threshold: 80.0,
        plugins: [
          { pluginId: 'plugin.vote.p1', weight: 60 },
          { pluginId: 'plugin.vote.p2', weight: 40 },
        ],
        onSuccess: {
          id: 'term_consensus_pass',
          type: 'TERMINAL',
          action: 'BUY',
          signalTag: 'CONSENSUS_BULL',
        },
      };

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 5,
        bars: [],
        attributes: new Map(),
      };

      const result = await evaluator.evaluate(flow, context);
      expect(result.status).toBe('SIGNAL_EMITTED');
      expect(result.confidence).toBe(86.0);
      expect(result.confidenceLevel).toBe('HIGH');
      expect(result.signalTag).toBe('CONSENSUS_BULL');
    });

    it('aborts immediately when a veto-enabled plugin emits SELL', async () => {
      const flow: DecisionFlowNode = {
        id: 'consensus_veto',
        type: 'CONSENSUS',
        name: '带一票否决的共识',
        threshold: 50.0,
        plugins: [
          { pluginId: 'plugin.vote.p1', weight: 80 },
          { pluginId: 'plugin.vote.veto', weight: 20, isVeto: true },
        ],
        onSuccess: {
          id: 'term_pass',
          type: 'TERMINAL',
          action: 'BUY',
        },
      };

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(),
        period: 5,
        bars: [],
        attributes: new Map(),
      };

      const result = await evaluator.evaluate(flow, context);
      expect(result.status).toBe('ABORTED');
      expect(result.confidence).toBe(0);
      expect(result.reason).toContain('一票否决权');
    });
  });

  describe('DecisionExecutionTraceBuilder', () => {
    it('builds structured snapshot and informative human-readable summary', () => {
      const result = {
        status: 'SIGNAL_EMITTED' as const,
        action: 'BUY' as const,
        confidence: 88.5,
        confidenceLevel: 'HIGH' as const,
        signalTag: 'BREAKOUT_RESONANCE',
        reason: '决策流信号发射 (买入/开仓)',
        trace: [
          {
            nodeId: 'guard_1',
            type: 'GUARD' as const,
            name: '财务安全门禁',
            action: 'BUY' as const,
            confidence: 0.95,
            reason: 'ROE达标',
          },
          {
            nodeId: 'consensus_1',
            type: 'CONSENSUS' as const,
            name: '共识打分',
            score: 88.5,
            threshold: 75.0,
            breakdown: [
              {
                pluginId: 'plugin.technical.breakout',
                weight: 50,
                action: 'BUY' as const,
                confidence: 0.9,
                reason: '放量突破',
              },
            ],
          },
          {
            nodeId: 'term_1',
            type: 'TERMINAL' as const,
            action: 'BUY' as const,
            signalTag: 'BREAKOUT_RESONANCE',
          },
        ],
      };

      const snapshot = DecisionExecutionTraceBuilder.buildSnapshot(result);
      expect(snapshot.confidence).toBe(88.5);
      expect(snapshot.confidenceLevel).toBe('HIGH');
      expect(snapshot.summary).toContain('[HIGH 88.5%]');
      expect(snapshot.summary).toContain('门禁[财务安全门禁]通过');
      expect(snapshot.summary).toContain('触发买入信号');
    });
  });

  describe('LegacyStrategyCompiler', () => {
    it('compiles legacy rule into DecisionFlowNode and evaluates smoothly', async () => {
      registry.register(new LegacyRuleDslPlugin());

      const baseTime = new Date('2026-09-07T09:30:00Z');
      const bars = [
        makeMockBar(baseTime, 10, 10.5, 9.8, 10.2),
        makeMockBar(
          new Date(baseTime.getTime() + 60000),
          10.2,
          11.0,
          10.1,
          10.8,
        ),
      ];

      const rule = {
        all: [
          {
            field: 'k.close',
            operator: 'gt',
            value: 10.5,
          },
        ],
      };

      const flow = LegacyStrategyCompiler.compileRuleToDecisionFlow(
        rule,
        'entry',
      );
      expect(flow.type).toBe('GUARD');

      const context: FactorContext = {
        securityId: 1,
        securityCode: '000001',
        timestamp: new Date(baseTime.getTime() + 60000),
        period: 5,
        bars,
        attributes: new Map(),
      };

      const result = await evaluator.evaluate(flow, context);
      expect(result.status).toBe('SIGNAL_EMITTED');
      expect(result.action).toBe('BUY');
      expect(result.signalTag).toBe('LEGACY_DSL');
    });
  });
});
