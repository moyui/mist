import type {
  ProjectedStrategyBar,
  StrategyMarketDataPort,
} from '@app/market-data';

export type FactorCategory =
  | 'REGIME'
  | 'FUNDAMENTAL'
  | 'CAPITAL'
  | 'EVENT'
  | 'TECHNICAL'
  | 'CHAN'
  | 'AI_SENTIMENT';

export type FactorAction = 'BUY' | 'SELL' | 'NEUTRAL';

export interface FactorOpinion {
  /** 插件观点：看多(BUY)、看空/风控(SELL)、弃权/中立(NEUTRAL) */
  readonly action: FactorAction;

  /**
   * 插件对自己当前判断的确信度 (0.0 ~ 1.0)
   * 例如：确信一买成立填 0.9；微弱背驰但未完全确认填 0.55
   */
  readonly confidence: number;

  /** 人类可读的原因说明，用于白盒归因和前端展示 */
  readonly reason: string;

  /**
   * 结构化特征快照（可选），用于复盘调试与原生终端绘图回写
   * 例如：缠论中枢可附带 { zd: 15.2, zg: 16.8 }；资金流可附带 { netInflow: 50000000 }
   */
  readonly evidence?: Readonly<Record<string, unknown>>;
}

export interface FactorContext {
  /** 标的唯一ID与代码 */
  readonly securityId: number;
  readonly securityCode: string;

  /** 当前评估基准时间戳（撮合时间点） */
  readonly timestamp: Date;

  /** 当前评估周期（分钟，如 1, 5, 15, 30, 60, 1440） */
  readonly period: number;

  /**
   * 规范化行情序列：
   * 100% 复用底层已有的 StrategySeriesImputer（停牌缺口补齐与时段对齐）与 KPriceProjector，
   * 因子插件直接消费处理完毕的纯净行情序列，绝不重复解析或造轮子做填补。
   */
  readonly bars: readonly ProjectedStrategyBar[];

  /**
   * 共享黑板 (BlackBoard)：
   * 用于树状决策流中前序节点与后序节点之间传递派生特征。
   * 命名规范推荐使用领域前缀，如 'chan.central', 'capital.main_inflow'
   */
  readonly attributes: Map<string, unknown>;

  /** 标的行情数据只读代理端口（可选） */
  readonly marketData?: StrategyMarketDataPort;

  /** 外部特征代理端口（如需按需拉取外部财务/资金流等，按需提供） */
  readonly featureProvider?: {
    getFeature(key: string, symbol: string): Promise<unknown>;
  };
}

export interface FactorPluginMetadata {
  /** 全局唯一ID，命名规范：plugin.<category>.<name>，如 'plugin.chan.bsp', 'plugin.fundamental.roe' */
  readonly id: string;
  /** 插件名称 */
  readonly name: string;
  /** 领域分类 */
  readonly category: FactorCategory;
  /** 插件语义版本 */
  readonly version: string;
  /** 详细功能描述 */
  readonly description: string;
  /** 参数配置 Schema（用于前台动态渲染配置表单，可选） */
  readonly paramSchema?: Record<string, unknown>;
}

export interface FactorPlugin extends FactorPluginMetadata {
  /**
   * 核心求值入口（无状态纯函数）
   * @param context 评估上下文（含黑板与数据代理）
   * @param params 策略实例在装配该插件时传入的具体参数配置
   */
  evaluate(
    context: FactorContext,
    params?: Record<string, unknown>,
  ): Promise<FactorOpinion>;
}
