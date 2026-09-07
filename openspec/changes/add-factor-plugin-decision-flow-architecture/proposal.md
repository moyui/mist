# Proposal: 通用因子插件体系与决策流树（Factor Plugin & Decision Flow）架构

## 1. 背景与核心痛点

当前 Mist 的策略与信号体系（`apps/signal`、`apps/backtest`、`libs/strategy`）存在以下深层次结构性局限：

1. **“策略 = 单一规则 = 单一信号”直连僵化**：
   - 现存系统将规则 DSL 或缠论买卖点直接与 `StrategySignal` 1:1 绑定；
   - 实际上，单点规则（如 MACD 金叉、缠论一买）本质只是一个“因子（Factor）”或“条件”，孤立的单因子无法支撑真实的交易决策。
2. **分析维度局限，缺乏通用多流派包容力**：
   - 系统早期过多聚焦于单一技术指标或缠论几何，缺乏对基本面质量、微观资金流动（北向、主力、L2）、事件驱动公告以及外置 AI 模型的通用插拔能力；
   - 必须确立**“平台内核极致中立、缠论仅为普通插件”**的通用架构原则，为未来的多流派因子演进留足空间。
3. **扁平加权无法表达真实交易的“因果序与决策树（Decision Tree / Pipeline）”**：
   - 交易逻辑天然具备层级因果：大盘环境定调（牛/熊/震荡）-> 标的池初筛（流动性/ST门禁）-> 核心形态/特征提取 -> 多因子置信度增强（资金/量能）-> 终结信号；
   - 扁平投票无法实现“按需短路求值（Short-circuiting）”与“上下文特征逐级富化（Context Enrichment）”。
4. **存量代码正处于“硬编码分叉与重复实现”的严重技术债务临界点**：
   - 排查发现，为了支持缠论与传统规则，系统在 `RealtimeStrategyExecutionPlan` 类型、`RealtimeStrategyEvaluationService` 实时求值、`BacktestRunExecutor` 离线回放循环、上下文快照序列化器以及 `StrategyDefinitionService` 校验层中**处处充斥着 `if (kind === 'chan_bsp')` 的硬编码分支与复制粘贴代码**；
   - 亟需通过本次重构对这 6 大硬编码分叉资产进行统一合并与收敛。
5. **回测引擎与实时引擎“假解耦、真分叉”（缺少 Research-to-Live Parity）**：
   - 当前虽然将 `apps/signal` 与 `apps/backtest` 拆为了两个独立进程应用，但**中层决策内核未抽离**，导致两边各自复制了一份求值逻辑；
   - 必须建立标准“三明治架构”，回测与实盘共用完全同一行决策求值代码，彻底消灭双轨逻辑漂移隐患。
6. **前端体验割裂、数据缺陷与老旧代码包袱**：
   - 策略工作台依赖原始的反人类 `<textarea>` 手写规则 JSON，且包含一套残缺冗余的内嵌回测 Tab；
   - 实时信号表格严重缺失标的信息，直接向交易员裸露数字 ID（如 `securityId: 142`）；
   - 回测工作区硬编码只认缠论买卖点（`BSP_LABEL_MAP`），抽屉（`ChanDiagnosisDrawer`）无法解析任何量价或多因子信号；
   - 告警通知（微信/飞书）仅发送方向与价格，完全缺乏置信度评分与决策理由。

---

## 2. 目标与范围 (Scope & Goals)

### 2.1 核心目标

1. **构建通用、中立的工业级多因子决策平台**：
   - 核心决策流引擎（`DecisionFlowEngine`）完全领域无关，不硬编码任何具体交易理论；
   - 缠论、经典技术指标、资金流向、财务基本面、事件驱动与外部 AI 享有同等公民地位，统一遵循标准插件协议。
2. **回测与实时严格同构（Research-to-Live Parity）**：
   - 建立“三明治架构”：时钟与数据灌入层各自隔离，中层决策求值内核 100% 强行共享，下游执行与持久化各取所需；
   - `apps/signal` 与 `apps/backtest` 均收敛为“薄壳消费者（Thin Consumer）”，求值器内部绝不包含 `isBacktest` 运行态分叉，实现双轨绝对对齐。
3. **现有高质量行情预处理与补缺基础设施 100% 零破坏复用**：
   - **核心资产无缝承接**：K 线缺口填补与对齐（`StrategySeriesImputer`）、价格投影标准化（`KPriceProjector`）、A 股 242 桶交易时钟边界（`CandleBucketUtil`）、多周期聚合构建器（`realtime-period.builder.ts`）以及拥有 174 个严苛单测的缠论核心算法库（`libs/chancore`）全部作为底层基石 **100% 完整保留与复用**；
   - 因子插件绝不重复解析原始行情，而是直接消费经统一补齐和投影的高质量 `ProjectedStrategyBar[]` 标准行情切片。
4. **存量 6 大硬编码分叉资产的整理与彻底合并**：
   - 统一执行计划模型：收敛 `RealtimeStrategyExecutionPlan`；
   - 统一求值引擎：合并 `RealtimeStrategyEvaluationService` 与 `BacktestRunExecutor` 中重复的两套 `if (chan_bsp)` 求值链路；
   - 统一白盒归因轨迹：合并两套互不兼容的快照序列化器为统一 `DecisionExecutionTraceBuilder`。
5. **极简因子插件契约 (Factor Plugin Contract)**：
   - 吸收 QuantConnect LEAN 的 `Insight` 架构精髓，插件只负责对当前时刻输出纯粹的 `BUY` / `SELL` / `NEUTRAL` 观点、局部置信度 `confidence` 与可读原因；
   - 插件自身即是完整生命周期，消除框架层复杂的全局时效管理负担。
6. **决策树控制流与共享黑板数据流 (Decision Tree + BlackBoard)**：
   - **架构定论**：坚决不引入复杂的重型通用 DAG 计算引擎，而是采用“**树状控制流 + 共享黑板（BlackBoard Context）数据流**”；
   - 支持条件分支路由（Branching）、短路过滤（Fast-Fail Guard）、上下文特征透传（Context Enrichment）以及局部加权打分（Consensus）；
   - 执行过程自动记录从根节点到叶子节点的决策路径轨迹（Execution Trace），具备完备的可解释性归因。
7. **全栈交互与前后端契约彻底清洗归一（Clean-Cut & Full-Stack Linkage）**：
   - **彻底摘除旧包袱**：删除手写 JSON 文本框与内嵌简易回测 Tab，删除硬编码的 `ChanDiagnosisDrawer` 与 `BSP_LABEL_MAP`；
   - **上线全流派通用组件**：开发 `DecisionFlowBuilder`（树状可视化编排台）、`PluginCatalog`（动态因子货架）与 `DecisionTraceDrawer`（实时与回测 100% 共享的白盒归因抽屉）；
   - **修复数据缺陷与跨工作区联动**：后端关联 `security` 输出真实代码与中文名称；实时与回测信号一键跳转 `/k` 页面自动聚焦该时刻 K 线。
8. **告警通知层置信度与决策归因富文本推送**：
   - 升级 `apps/notification`，推送消息格式化纳入置信度得分、等级标签与白盒决策命中摘要。
9. **向后兼容与低侵入迁移**：
   - 现有存量 Strategy 封装为默认的单一节点决策树，保障存量回测与实盘无缝平移。

### 2.2 非目标 (Out of Scope)

- **坚决不做通用网状 DAG 调度器**（不引入复杂的跨节点多对多拓扑排序与成环检测，通过树 + 共享黑板即可 100% 覆盖业务需求）；
- 核心引擎内部禁止出现任何特定理论的专有字段，保持纯净；
- 资产组合层面的资金管理、仓位拆分与撮合状态机仍由 `upgrade-backtest-decision-and-parity-engine` 独立承接。
