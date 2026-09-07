import type { FactorContext, FactorPlugin } from '../factor/factor.types';
import {
  factorPluginRegistry,
  type FactorPluginRegistry,
} from '../factor/factor-plugin-registry';
import type {
  ConfidenceLevel,
  ConsensusVoteBreakdown,
  DecisionExecutionTraceItem,
  DecisionFlowNode,
  DecisionResult,
} from './decision-flow.types';

export interface DecisionFlowEvaluatorOptions {
  readonly registry?: FactorPluginRegistry;
}

/**
 * 树状决策流通用求值器 (DecisionFlowEvaluator)
 * 采用 Top-Down 递归求值算法，支持毫秒级短路剪枝、黑板属性流转与局部加权打分
 */
export class DecisionFlowEvaluator {
  private readonly registry: FactorPluginRegistry;

  constructor(options?: DecisionFlowEvaluatorOptions) {
    this.registry = options?.registry ?? factorPluginRegistry;
  }

  public async evaluate(
    rootNode: DecisionFlowNode,
    context: FactorContext,
  ): Promise<DecisionResult> {
    const trace: DecisionExecutionTraceItem[] = [];
    let activeScore: number | undefined;

    return this.evaluateNode(rootNode, context, trace, activeScore);
  }

  private async evaluateNode(
    node: DecisionFlowNode,
    context: FactorContext,
    trace: DecisionExecutionTraceItem[],
    currentScore?: number,
  ): Promise<DecisionResult> {
    switch (node.type) {
      case 'GUARD': {
        const plugin = this.getPlugin(node.pluginId);
        const opinion = await plugin.evaluate(context, node.params);

        trace.push({
          nodeId: node.id,
          type: 'GUARD',
          name: node.name,
          action: opinion.action,
          confidence: opinion.confidence,
          reason: opinion.reason,
          evidence: opinion.evidence,
        });

        const minConf = node.minConfidence ?? 0.0;
        const passed =
          opinion.action === node.requiredAction &&
          opinion.confidence >= minConf;

        const nextScore =
          currentScore ?? Number((opinion.confidence * 100).toFixed(1));

        if (passed) {
          return this.evaluateNode(node.onPass, context, trace, nextScore);
        } else if (node.onFail) {
          return this.evaluateNode(node.onFail, context, trace, nextScore);
        }

        return {
          status: 'ABORTED',
          confidence: 0,
          confidenceLevel: 'LOW',
          reason: `前置门禁[${node.name}]未通过: ${opinion.reason}`,
          trace,
        };
      }

      case 'BRANCH': {
        const conditionResult = this.resolveCondition(node.condition, context);
        trace.push({
          nodeId: node.id,
          type: 'BRANCH',
          name: node.name,
          conditionResult,
        });

        const nextNode = conditionResult
          ? node.branches.true
          : node.branches.false;
        return this.evaluateNode(nextNode, context, trace, currentScore);
      }

      case 'EXTRACTOR': {
        const plugin = this.getPlugin(node.pluginId);
        const opinion = await plugin.evaluate(context, node.params);

        if (opinion.evidence) {
          context.attributes.set(node.exportAttributeKey, opinion.evidence);
        } else {
          context.attributes.set(node.exportAttributeKey, opinion);
        }

        trace.push({
          nodeId: node.id,
          type: 'EXTRACTOR',
          name: node.name,
          exportedKey: node.exportAttributeKey,
          evidence: opinion.evidence,
        });

        return this.evaluateNode(node.next, context, trace, currentScore);
      }

      case 'CONSENSUS': {
        let totalWeight = 0;
        let earnedScore = 0;
        let vetoTriggered = false;
        let vetoReason = '';
        const breakdown: ConsensusVoteBreakdown[] = [];

        const evaluationPromises = node.plugins.map(async (item) => {
          const plugin = this.getPlugin(item.pluginId);
          const opinion = await plugin.evaluate(context, item.params);
          return { item, opinion };
        });

        const results = await Promise.all(evaluationPromises);

        for (const { item, opinion } of results) {
          totalWeight += item.weight;
          const isVetoItem = item.isVeto === true;
          const itemVetoTriggered = isVetoItem && opinion.action === 'SELL';

          if (itemVetoTriggered) {
            vetoTriggered = true;
            vetoReason = `插件[${pluginName(item.pluginId)}]行使一票否决权: ${opinion.reason}`;
          }

          if (opinion.action === 'BUY') {
            earnedScore += item.weight * opinion.confidence;
          }

          breakdown.push({
            pluginId: item.pluginId,
            weight: item.weight,
            action: opinion.action,
            confidence: opinion.confidence,
            reason: opinion.reason,
            isVeto: isVetoItem,
            vetoTriggered: itemVetoTriggered,
          });
        }

        const calculatedScore =
          vetoTriggered || totalWeight === 0
            ? 0
            : (earnedScore / totalWeight) * 100;

        trace.push({
          nodeId: node.id,
          type: 'CONSENSUS',
          name: node.name,
          score: calculatedScore,
          threshold: node.threshold,
          breakdown,
        });

        const passed = !vetoTriggered && calculatedScore >= node.threshold;

        if (passed) {
          return this.evaluateNode(
            node.onSuccess,
            context,
            trace,
            calculatedScore,
          );
        } else if (node.onFailure) {
          return this.evaluateNode(
            node.onFailure,
            context,
            trace,
            calculatedScore,
          );
        }

        return {
          status: 'ABORTED',
          confidence: calculatedScore,
          confidenceLevel: this.resolveConfidenceLevel(calculatedScore),
          reason: vetoTriggered
            ? vetoReason
            : `局部加权打分(${calculatedScore.toFixed(1)})未达门槛(${node.threshold.toFixed(1)})`,
          trace,
        };
      }

      case 'TERMINAL': {
        trace.push({
          nodeId: node.id,
          type: 'TERMINAL',
          action: node.action,
          signalTag: node.signalTag,
          reason: node.reason,
        });

        const confidence = currentScore ?? (node.action === 'ABORT' ? 0 : 85);
        const confidenceLevel = this.resolveConfidenceLevel(confidence);

        if (node.action === 'ABORT') {
          return {
            status: 'ABORTED',
            confidence,
            confidenceLevel,
            signalTag: node.signalTag,
            reason: node.reason ?? '决策流执行终止',
            trace,
          };
        }

        return {
          status: 'SIGNAL_EMITTED',
          action: node.action,
          confidence,
          confidenceLevel,
          signalTag: node.signalTag,
          reason:
            node.reason ??
            `决策流信号发射 (${node.action === 'BUY' ? '买入/开仓' : '卖出/平仓'})`,
          trace,
        };
      }
    }
  }

  private getPlugin(pluginId: string): FactorPlugin {
    const plugin = this.registry.get(pluginId);
    if (!plugin) {
      throw new Error(
        `DecisionFlowEvaluator: 未在注册表中找到插件 [${pluginId}]`,
      );
    }
    return plugin;
  }

  private resolveCondition(
    condition: {
      readonly attributeKey?: string;
      readonly operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
      readonly value: unknown;
    },
    context: FactorContext,
  ): boolean {
    if (!condition.attributeKey) {
      return true;
    }

    const actual = context.attributes.get(condition.attributeKey);
    const expected = condition.value;

    switch (condition.operator) {
      case 'eq':
        return actual === expected;
      case 'ne':
        return actual !== expected;
      case 'gt':
        return Number(actual) > Number(expected);
      case 'gte':
        return Number(actual) >= Number(expected);
      case 'lt':
        return Number(actual) < Number(expected);
      case 'lte':
        return Number(actual) <= Number(expected);
      case 'in':
        if (Array.isArray(expected)) {
          return expected.includes(actual);
        }
        return false;
      default:
        return false;
    }
  }

  public resolveConfidenceLevel(score: number): ConfidenceLevel {
    if (score >= 80) return 'HIGH';
    if (score >= 65) return 'MEDIUM';
    return 'LOW';
  }
}

function pluginName(pluginId: string): string {
  const parts = pluginId.split('.');
  return parts[parts.length - 1] ?? pluginId;
}
