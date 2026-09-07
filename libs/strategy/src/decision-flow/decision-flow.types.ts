import type { FactorAction } from '../factor/factor.types';

export type DecisionFlowNode =
  | GuardNode
  | BranchNode
  | ExtractorNode
  | ConsensusNode
  | TerminalNode;

/**
 * 门禁节点：用于前置条件断言与快速短路
 */
export interface GuardNode {
  readonly id: string;
  readonly type: 'GUARD';
  readonly name: string;
  /** 引用的插件标识 */
  readonly pluginId: string;
  /** 插件参数 */
  readonly params?: Record<string, unknown>;
  /** 期望通过的动作，通常为 'BUY' */
  readonly requiredAction: FactorAction;
  /** 最低置信度要求（低于此置信度视作门禁未过，默认 0.0） */
  readonly minConfidence?: number;
  /** 门禁通过后流向的下一个节点 */
  readonly onPass: DecisionFlowNode;
  /** 门禁未通过后流向的节点（可选，若未指定则默认静默 Abort 剪枝） */
  readonly onFail?: DecisionFlowNode;
}

/**
 * 条件分支路由节点：用于多路径决策分流
 */
export interface BranchNode {
  readonly id: string;
  readonly type: 'BRANCH';
  readonly name: string;
  /** 分支判定条件 */
  readonly condition: {
    readonly attributeKey?: string;
    readonly pluginId?: string;
    readonly operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
    readonly value: unknown;
  };
  /** 分支映射字典 */
  readonly branches: {
    readonly true: DecisionFlowNode;
    readonly false: DecisionFlowNode;
  };
}

/**
 * 特征提取与黑板富化节点：执行计算并向共享黑板写入派生特征
 */
export interface ExtractorNode {
  readonly id: string;
  readonly type: 'EXTRACTOR';
  readonly name: string;
  /** 负责计算的插件标识 */
  readonly pluginId: string;
  readonly params?: Record<string, unknown>;
  /** 写入共享黑板的属性键名（如 'chan.central'） */
  readonly exportAttributeKey: string;
  /** 特征提取完成后流向的下一个节点 */
  readonly next: DecisionFlowNode;
}

/**
 * 局部加权共识节点挂载的插件配置
 */
export interface ConsensusPluginWeight {
  readonly pluginId: string;
  /** 权重分值（所有项权重相加通常为 100） */
  readonly weight: number;
  /** 是否拥有一票否决权（若为 true 且该插件投了 SELL，综合得分直接归零） */
  readonly isVeto?: boolean;
  readonly params?: Record<string, unknown>;
}

/**
 * 局部加权共识节点：在决策树分支末端对多个平行因子进行局部并联打分
 */
export interface ConsensusNode {
  readonly id: string;
  readonly type: 'CONSENSUS';
  readonly name: string;
  /** 综合置信度最低触发阈值 (0.0 ~ 100.0) */
  readonly threshold: number;
  /** 挂载的投票插件列表 */
  readonly plugins: readonly ConsensusPluginWeight[];
  /** 打分达标后流向的下一个节点（通常为 TerminalNode） */
  readonly onSuccess: DecisionFlowNode;
  /** 打分未达标流向的节点（可选，默认终止） */
  readonly onFailure?: DecisionFlowNode;
}

/**
 * 终结执行节点：决策流的叶子节点，负责发出交易信号或记录终止阻断
 */
export interface TerminalNode {
  readonly id: string;
  readonly type: 'TERMINAL';
  /** 最终裁决：产生买入/卖出信号，或显式记录终止阻断 */
  readonly action: 'BUY' | 'SELL' | 'ABORT';
  /** 信号业务标签（如 'BREAKOUT_RESONANCE', 'OVERSOLD_REBOUND'） */
  readonly signalTag?: string;
  /** 终止说明 */
  readonly reason?: string;
}

/**
 * 共识节点投票明细
 */
export interface ConsensusVoteBreakdown {
  readonly pluginId: string;
  readonly weight: number;
  readonly action: FactorAction;
  readonly confidence: number;
  readonly reason: string;
  readonly isVeto?: boolean;
  readonly vetoTriggered?: boolean;
}

/**
 * 决策流节点白盒执行轨迹明细
 */
export interface DecisionExecutionTraceItem {
  readonly nodeId: string;
  readonly type: 'GUARD' | 'BRANCH' | 'EXTRACTOR' | 'CONSENSUS' | 'TERMINAL';
  readonly name?: string;
  readonly action?: FactorAction | 'ABORT';
  readonly signalTag?: string;
  readonly confidence?: number;
  readonly score?: number;
  readonly threshold?: number;
  readonly reason?: string;
  readonly exportedKey?: string;
  readonly conditionResult?: boolean;
  readonly breakdown?: readonly ConsensusVoteBreakdown[];
  readonly evidence?: Readonly<Record<string, unknown>>;
}

export type DecisionStatus = 'SIGNAL_EMITTED' | 'ABORTED';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * 决策流最终求值结果
 */
export interface DecisionResult {
  readonly status: DecisionStatus;
  readonly action?: 'BUY' | 'SELL';
  /** 最终综合置信度 (0.0 ~ 100.0) */
  readonly confidence: number;
  /** 置信度评级：HIGH (>=80), MEDIUM (65~79), LOW (<65) */
  readonly confidenceLevel: ConfidenceLevel;
  /** 业务标签 */
  readonly signalTag?: string;
  /** 人类可读说明 */
  readonly reason: string;
  /** 白盒执行轨迹 */
  readonly trace: readonly DecisionExecutionTraceItem[];
}
