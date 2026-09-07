import type {
  ConfidenceLevel,
  DecisionExecutionTraceItem,
  DecisionResult,
} from './decision-flow.types';

export interface DecisionTraceSnapshot {
  readonly status: 'SIGNAL_EMITTED' | 'ABORTED';
  readonly action?: 'BUY' | 'SELL';
  readonly confidence: number;
  readonly confidenceLevel: ConfidenceLevel;
  readonly signalTag?: string;
  readonly summary: string;
  readonly trace: readonly DecisionExecutionTraceItem[];
  readonly timestamp: string;
}

/**
 * 统一白盒执行轨迹构建器 (DecisionExecutionTraceBuilder)
 * 替代旧版分散的 serializeStrategyContextSnapshot 与 serializeChanBspContextSnapshot，
 * 生成符合统一信封规范的白盒追溯快照与人类可读摘要
 */
export class DecisionExecutionTraceBuilder {
  /**
   * 将求值结果转换为可持久化存储的白盒轨迹快照
   */
  public static buildSnapshot(
    result: DecisionResult,
    timestamp: Date = new Date(),
  ): DecisionTraceSnapshot {
    const summary = this.buildHumanReadableSummary(result);

    return {
      status: result.status,
      action: result.action,
      confidence: Number(result.confidence.toFixed(1)),
      confidenceLevel: result.confidenceLevel,
      signalTag: result.signalTag,
      summary,
      trace: result.trace,
      timestamp: timestamp.toISOString(),
    };
  }

  /**
   * 生成一句话人类可读的决策归因摘要
   * 示范："[HIGH 88.5%] 门禁(财务安全)通过 + 共识打分(放量突破+北向加仓)达标 -> 买入信号"
   */
  public static buildHumanReadableSummary(result: DecisionResult): string {
    const prefix = `[${result.confidenceLevel} ${result.confidence.toFixed(1)}%]`;

    if (result.status === 'ABORTED') {
      return `${prefix} 阻断: ${result.reason}`;
    }

    const keyMilestones: string[] = [];

    for (const item of result.trace) {
      if (item.type === 'GUARD' && item.reason) {
        keyMilestones.push(item.name ? `门禁[${item.name}]通过` : '门禁通过');
      } else if (item.type === 'CONSENSUS' && item.breakdown) {
        const positiveVoters = item.breakdown
          .filter((v) => v.action === 'BUY')
          .map((v) => v.pluginId.replace('plugin.', ''));
        if (positiveVoters.length > 0) {
          keyMilestones.push(`共识支持(${positiveVoters.join('+')})`);
        }
      }
    }

    const milestoneText =
      keyMilestones.length > 0 ? keyMilestones.join(' + ') + ' -> ' : '';
    const actionText =
      result.action === 'BUY' ? '触发买入信号' : '触发卖出信号';
    const tagText = result.signalTag ? ` [${result.signalTag}]` : '';

    return `${prefix} ${milestoneText}${actionText}${tagText}`;
  }
}
