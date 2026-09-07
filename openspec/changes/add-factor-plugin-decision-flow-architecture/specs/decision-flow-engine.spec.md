# Spec: 决策流树引擎（Decision Flow Engine）与执行协议

## 1. 架构目标与树状控制流规范

1. **拒绝网状 DAG，采用树状拓扑**：
   - 决策流是一棵有向单根树（Directed Rooted Tree）；
   - 执行方向自顶向下（Top-Down），杜绝任何环状依赖（No Cycles）与死锁风险；
   - 天然支持毫秒级短路剪枝（Fast-Fail Pruning），未命中的子树零计算开销。
2. **控制流与数据流分离**：
   - **控制流**：由节点父子树状拓扑决定路由走向；
   - **数据流**：由单次求值生命周期内的共享黑板 `context.attributes` 承载，派生特征上游写入、下游自由消费。

---

## 2. 节点模型规范 (Node Model Specification)

决策流树由 5 种核心节点联合构成：

```typescript
export type DecisionFlowNode =
  | GuardNode
  | BranchNode
  | ExtractorNode
  | ConsensusNode
  | TerminalNode;
```

### 2.1 门禁节点 (`GuardNode`)
用于前置条件断言与快速短路。
```typescript
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
```

### 2.2 条件分支路由节点 (`BranchNode`)
用于多路径决策分流（例如：牛市走突破树、熊市走反弹树）。
```typescript
export interface BranchNode {
  readonly id: string;
  readonly type: 'BRANCH';
  readonly name: string;
  /**
   * 分支判定条件：
   * 支持通过属性黑板取值表达式（如 'attributes.get("market.regime") === "BULL"'）
   * 或绑定判定插件
   */
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
```

### 2.3 特征提取与黑板富化节点 (`ExtractorNode`)
用于执行计算并向共享黑板写入派生特征。
```typescript
export interface ExtractorNode {
  readonly id: string;
  readonly type: 'EXTRACTOR';
  readonly name: string;
  /** 负责计算的插件标识（如缠论中枢计算器） */
  readonly pluginId: string;
  readonly params?: Record<string, unknown>;
  /** 写入共享黑板的属性键名（如 'chan.central'） */
  readonly exportAttributeKey: string;
  /** 特征提取完成后流向的下一个节点 */
  readonly next: DecisionFlowNode;
}
```

### 2.4 局部加权共识节点 (`ConsensusNode`)
在决策树分支末端，对多个平行因子进行局部并联打分。
```typescript
export interface ConsensusPluginWeight {
  readonly pluginId: string;
  /** 权重分值（所有项权重相加通常为 100） */
  readonly weight: number;
  /** 是否拥有一票否决权（若为 true 且该插件投了 SELL，综合得分直接归零） */
  readonly isVeto?: boolean;
  readonly params?: Record<string, unknown>;
}

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
```

### 2.5 终结执行节点 (`TerminalNode`)
决策流的叶子节点，负责发出交易信号或记录正式阻断。
```typescript
export interface TerminalNode {
  readonly id: string;
  readonly type: 'TERMINAL';
  /** 最终裁决：产生买入/卖出信号，或显式记录终止阻断 */
  readonly action: 'BUY' | 'SELL' | 'ABORT';
  /** 信号业务标签（如 'BREAKOUT_RESONANCE', 'OVERSOLD_REBOUND'） */
  readonly signalTag?: string;
  /** 阻断说明 */
  readonly reason?: string;
}
```

---

## 3. 求值器算法与置信度级联计算 (`DecisionFlowEvaluator`)

### 3.1 递归求值算法规范
```typescript
async function evaluateFlow(
  node: DecisionFlowNode,
  context: FactorContext,
  trace: ExecutionTraceItem[]
): Promise<DecisionResult> {
  switch (node.type) {
    case 'GUARD': {
      const plugin = registry.get(node.pluginId);
      const opinion = await plugin.evaluate(context, node.params);
      trace.push({ nodeId: node.id, type: 'GUARD', opinion });
      
      const passed = opinion.action === node.requiredAction && 
                     (opinion.confidence >= (node.minConfidence ?? 0));
      if (passed) {
        return evaluateFlow(node.onPass, context, trace);
      } else if (node.onFail) {
        return evaluateFlow(node.onFail, context, trace);
      }
      return { status: 'ABORTED', reason: `门禁未通过: ${opinion.reason}`, trace };
    }

    case 'BRANCH': {
      const conditionValue = resolveCondition(node.condition, context);
      trace.push({ nodeId: node.id, type: 'BRANCH', result: conditionValue });
      const nextNode = conditionValue ? node.branches.true : node.branches.false;
      return evaluateFlow(nextNode, context, trace);
    }

    case 'EXTRACTOR': {
      const plugin = registry.get(node.pluginId);
      const opinion = await plugin.evaluate(context, node.params);
      if (opinion.evidence) {
        context.attributes.set(node.exportAttributeKey, opinion.evidence);
      }
      trace.push({ nodeId: node.id, type: 'EXTRACTOR', exportedKey: node.exportAttributeKey });
      return evaluateFlow(node.next, context, trace);
    }

    case 'CONSENSUS': {
      let totalWeight = 0;
      let earnedScore = 0;
      let vetoTriggered = false;
      const breakdown: OpinionBreakdown[] = [];

      // 并发执行局部挂载的所有插件
      const results = await Promise.all(node.plugins.map(async (p) => {
        const plugin = registry.get(p.pluginId);
        const op = await plugin.evaluate(context, p.params);
        return { config: p, opinion: op };
      }));

      for (const { config, opinion } of results) {
        totalWeight += config.weight;
        breakdown.push({ pluginId: config.pluginId, weight: config.weight, opinion });
        
        if (config.isVeto && opinion.action === 'SELL') {
          vetoTriggered = true;
        }
        if (opinion.action === 'BUY') {
          earnedScore += config.weight * opinion.confidence;
        }
      }

      const finalScore = vetoTriggered || totalWeight === 0 ? 0 : (earnedScore / totalWeight) * 100;
      trace.push({ nodeId: node.id, type: 'CONSENSUS', score: finalScore, threshold: node.threshold, breakdown });

      if (!vetoTriggered && finalScore >= node.threshold) {
        return evaluateFlow(node.onSuccess, context, trace);
      } else if (node.onFailure) {
        return evaluateFlow(node.onFailure, context, trace);
      }
      return { status: 'ABORTED', reason: `加权打分(${finalScore.toFixed(1)})低于阈值(${node.threshold})`, trace };
    }

    case 'TERMINAL': {
      trace.push({ nodeId: node.id, type: 'TERMINAL', action: node.action, signalTag: node.signalTag });
      return {
        status: node.action === 'ABORT' ? 'ABORTED' : 'SIGNAL_EMITTED',
        action: node.action,
        signalTag: node.signalTag,
        trace
      };
    }
  }
}
```

---

## 4. 数据库实体扩展契约 (`StrategySignal`)

在 `libs/shared-data/src/entities/strategy-signal.entity.ts` 中扩展以下字段：

| 列名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `confidence` | `DECIMAL(5, 2)` | 最终综合置信度得分 (0.00 ~ 100.00) |
| `confidence_level` | `ENUM('HIGH', 'MEDIUM', 'LOW')` | 评级分档：`HIGH` (>=80), `MEDIUM` (65~79), `LOW` (<65) |
| `decision_trace` | `JSON` | 决策树从根节点到叶子节点的完整命中路径与各节点投票快照 |

### Context Snapshot 结构示范
```json
{
  "confidence": 86.5,
  "confidenceLevel": "HIGH",
  "decisionTrace": [
    { "nodeId": "guard_regime", "type": "GUARD", "action": "BUY", "confidence": 1.0, "reason": "大盘处于安全区" },
    { "nodeId": "extractor_chan", "type": "EXTRACTOR", "exported": "chan.central" },
    { 
      "nodeId": "consensus_buy", 
      "type": "CONSENSUS", 
      "score": 86.5, 
      "threshold": 75.0,
      "breakdown": [
        { "pluginId": "plugin.chan.bsp3", "weight": 40, "action": "BUY", "confidence": 0.9 },
        { "pluginId": "plugin.volume.surge", "weight": 35, "action": "BUY", "confidence": 0.85 },
        { "pluginId": "plugin.capital.northbound", "weight": 25, "action": "BUY", "confidence": 0.8 }
      ]
    },
    { "nodeId": "leaf_buy", "type": "TERMINAL", "action": "BUY", "signalTag": "BREAKOUT_CONCURRENCE" }
  ]
}
```

---

## 5. 运行环境同构与薄壳调用规范 (Environment Parity & Thin Consumer Protocol)

为彻底消灭实盘与回测双轨逻辑漂移（Research-to-Live Drift），设立以下调用契约：

### 5.1 运行态绝对中立禁令 (Agnostic Execution Rule)
- 决策树节点、求值器 `DecisionFlowEvaluator`、以及所有 `FactorPlugin` 内部，**严禁注入任何指示运行环境的布尔值（如 `isBacktest`, `env === 'realtime'`）**；
- 求值器唯一的输入是只读的 `FactorContext` 与 `ProjectedStrategyBar[]`；
- 求值器唯一的输出是结构化的 `DecisionResult`；
- 严禁在求值器内部直接执行持久化写入（写入 DB/Redis）或发起外部告警推送。

### 5.2 薄壳消费者调用契约 (Thin Consumer Calling Standard)
无论是 `apps/signal`（实时）还是 `apps/backtest`（回测），在消费 K 线切片时，必须遵循完全相同的调用范式：

```typescript
// 1. 组装只读上下文 (由各自环境的薄壳组装)
const context: FactorContext = {
  securityId,
  securityCode,
  timestamp: bar.timestamp,
  period: bar.period,
  bars: imputer.read(),                   // 底层 StrategySeriesImputer 补齐后的标准化 K 线
  attributes: new Map<string, unknown>(), // 全新单次会话黑板
  marketData: windowReader,               // 只读数据代理
};

// 2. 强行调用同一行求值内核代码
const result = await flowEvaluator.evaluate(plan.rootNode, context);

// 3. 各自处理下游专属副作用
if (result.status === 'SIGNAL_EMITTED') {
  // apps/signal: 写入 strategy_signals + 产生 PENDING AlertEvent
  // apps/backtest: 写入 backtest_signals + 推进虚拟撮合状态机
}
```
通过此契约，确保回测与实盘在任何特定时点的逻辑判断与置信度打分 100% 逐位对齐。
