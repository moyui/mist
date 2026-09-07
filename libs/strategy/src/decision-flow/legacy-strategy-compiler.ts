import type {
  CompiledStrategyExecutionPlan,
  StrategyRuleExpression,
  StrategySignalKind,
} from '../rules/strategy-rule.types';
import { compileStoredStrategyRule } from '../rules/strategy-rule.compiler';
import type { DecisionFlowNode } from './decision-flow.types';

export interface LegacyChanBspPlanLike {
  readonly units: 'bi' | 'duan';
  readonly direction: 'buy' | 'sell' | 'both';
  readonly points: {
    readonly first: boolean;
    readonly second: boolean;
    readonly third: boolean;
  };
  readonly requiredBarCount?: number;
}

/**
 * 存量策略透明编译器 (LegacyStrategyCompiler)
 * 将数据库中已有的历史规则定义（DSL Rule 或 Chan BSP）自动编译为等价的决策流树，
 * 保障存量策略无需迁移数据库即可在通用决策流引擎上零感知运行。
 */
export class LegacyStrategyCompiler {
  /**
   * 将旧版 DSL 规则编译为单门禁决策流树
   */
  public static compileRuleToDecisionFlow(
    ruleOrPlan: StrategyRuleExpression | CompiledStrategyExecutionPlan,
    signalKind: StrategySignalKind = 'entry',
  ): DecisionFlowNode {
    const plan: CompiledStrategyExecutionPlan =
      'root' in ruleOrPlan
        ? ruleOrPlan
        : compileStoredStrategyRule(ruleOrPlan, signalKind);

    const action = plan.signalKind === 'entry' ? 'BUY' : 'SELL';

    return {
      id: 'guard_legacy_rule',
      type: 'GUARD',
      name: '存量规则DSL门禁',
      pluginId: 'plugin.legacy.rule-dsl',
      params: { plan },
      requiredAction: action,
      minConfidence: 0.5,
      onPass: {
        id: 'term_legacy_matched',
        type: 'TERMINAL',
        action,
        signalTag: 'LEGACY_DSL',
        reason: '存量规则条件满足，触发信号',
      },
      onFail: {
        id: 'term_legacy_unmatched',
        type: 'TERMINAL',
        action: 'ABORT',
        reason: '存量规则条件未满足',
      },
    };
  }

  /**
   * 将旧版缠论三类买卖点计划编译为决策流树
   */
  public static compileChanBspToDecisionFlow(
    plan: LegacyChanBspPlanLike,
  ): DecisionFlowNode {
    const action = plan.direction === 'sell' ? 'SELL' : 'BUY';

    return {
      id: 'guard_chan_bsp',
      type: 'GUARD',
      name: '缠论买卖点门禁',
      pluginId: 'plugin.chan.bsp',
      params: {
        units: plan.units,
        direction: plan.direction,
        points: plan.points,
        requiredBarCount: plan.requiredBarCount,
        deduplicate: true,
      },
      requiredAction: action,
      minConfidence: 0.7,
      onPass: {
        id: 'term_chan_bsp_matched',
        type: 'TERMINAL',
        action,
        signalTag: 'CHAN_BSP',
        reason: '缠论买卖点结构确立',
      },
      onFail: {
        id: 'term_chan_bsp_unmatched',
        type: 'TERMINAL',
        action: 'ABORT',
        reason: '缠论形态未出现或未达买卖点确认门槛',
      },
    };
  }
}
