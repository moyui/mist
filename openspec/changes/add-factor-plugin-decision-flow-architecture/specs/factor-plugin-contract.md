# Spec: 因子插件标准契约与注册协议

## 1. 领域中立性与设计原则

1. **领域中立（Domain Neutrality）**：
   - 本契约完全独立于具体的交易派系（如缠论、均线、多因子、波浪等）；
   - 任何分析维度（基本面、资金面、技术面、事件面、宏观面、外部 AI 预测）均实现同一套接口，享有同等公民地位。
2. **纯函数与无状态原则（Stateless & Pure）**：
   - 插件的 `evaluate` 方法必须是**无副作用的幂等纯函数**；
   - 插件不得自行修改外部全局状态、不得向数据库写入业务状态；
   - 插件所需的一切事实数据均通过只读的 `FactorContext` 注入。
3. **自治生命周期（Autonomous Lifecycle）**：
   - 插件内部自理时效性与数据粒度（如财报插件看季报、高频量价看最新Bar）；
   - 框架不维护全局 TTL / 倒计时衰减器；策略装配即是插件生命周期。

---

## 2. 核心接口定义 (TypeScript)

### 2.1 因子分类枚举

```typescript
export type FactorCategory =
  | 'REGIME'        // 宏观与大盘环境
  | 'FUNDAMENTAL'   // 基本面与财务质量
  | 'CAPITAL'       // 资金面与微观流动性
  | 'EVENT'         // 事件驱动与公告
  | 'TECHNICAL'     // 经典量价与技术指标
  | 'CHAN'          // 缠论几何形态(独立插件套件)
  | 'AI_SENTIMENT'; // 外部 AI 与另类舆情数据
```

### 2.2 因子输出观点 (`FactorOpinion`)

借鉴 QuantConnect LEAN 的 `Insight` 极简契约，插件只输出纯粹观点与置信度，不关心仓位与撮合：

```typescript
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
```

### 2.3 因子上下文与共享黑板 (`FactorContext`)

```typescript
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
  
  /** 标的行情数据只读代理端口 */
  readonly marketData: StrategyMarketDataPort;
  
  /** 外部特征代理端口（如需按需拉取外部财务/资金流等，按需提供） */
  readonly featureProvider?: {
    getFeature(key: string, symbol: string): Promise<unknown>;
  };
}
```

### 2.4 因子插件接口 (`FactorPlugin`)

```typescript
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
   * 核心求值入口
   * @param context 评估上下文（含黑板与数据代理）
   * @param params 策略实例在装配该插件时传入的具体参数配置
   */
  evaluate(context: FactorContext, params?: Record<string, unknown>): Promise<FactorOpinion>;
}
```

---

## 3. 插件注册表规范 (`FactorPluginRegistry`)

系统在 `libs/strategy` / `libs/factor` 中提供全局单例注册表：

```typescript
export interface FactorPluginRegistry {
  /** 注册插件 */
  register(plugin: FactorPlugin): void;
  
  /** 根据 ID 获取插件 */
  get(pluginId: string): FactorPlugin | undefined;
  
  /** 按分类列出所有已注册插件 */
  listByCategory(category?: FactorCategory): readonly FactorPlugin[];
  
  /** 检查插件是否存在 */
  has(pluginId: string): boolean;
}
```

---

## 4. 外置 HTTP / Python 插件协议 (`HttpProxyFactorPlugin`)

为了无缝接入 Python / FastAPI（如 `mist-datasource` 或 `mist-skills`）中的 AI 与另类数据模型，框架提供标准 HTTP 代理插件实现。

### 4.1 契约规范
- **Method**: `POST`
- **Path**: 由配置指定（如 `/api/v1/factor/evaluate`）
- **Request Body**:
  ```json
  {
    "pluginId": "plugin.ai.sentiment",
    "securityId": 1,
    "securityCode": "000001",
    "timestamp": "2026-09-07T09:35:00.000+08:00",
    "attributes": {
      "market.regime": "BULL"
    },
    "params": {
      "threshold": 0.75
    }
  }
  ```
- **Response Body**:
  ```json
  {
    "action": "BUY",
    "confidence": 0.88,
    "reason": "研报一致预期综合评级调升，NLP情绪分处于历史95%分位",
    "evidence": {
      "sentimentScore": 0.92,
      "reportCount": 5
    }
  }
  ```
- **容错与超时**：
  - 外置 HTTP 插件必须设置硬超时（默认 200ms）；
  - 超时或网络异常时，代理插件安全降级为 `{ action: 'NEUTRAL', confidence: 0.0, reason: '外置因子评估超时，自动弃权' }`，不得阻塞主交易链路。
