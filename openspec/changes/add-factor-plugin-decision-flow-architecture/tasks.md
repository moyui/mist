# Tasks: 通用因子插件化与决策流树架构实施计划（含存量分叉合并与前后端彻底清洗）

> 详细设计与重构路径见：[implementation-plan.md](./implementation-plan.md)

## Phase 1: 插件契约与存量特权剥离 (`libs/strategy`, `libs/factor`)

- [x] 1.1 定义 `FactorPlugin`, `FactorOpinion`, `FactorContext` 标准 TypeScript 接口契约（完全领域中立）
- [x] 1.2 实现 `FactorPluginRegistry`（插件注册、元数据索引与单例工厂）
- [x] 1.3 **【核心存量合并】剥离缠论特权，封装 `ChanBspFactorPlugin`**（将 `ChanBspDetector` 与 `ChanBspEpisodeCursor` 内聚到插件内部生命周期）
- [x] 1.4 **【核心存量合并】封装存量规则 DSL，实现 `LegacyRuleDslPlugin`**（将 `evaluateStrategyPlan` 包装为标准插件以保证存量平滑运行）
- [x] 1.5 落地多流派示范插件（涵盖不同领域，打破单一技术分析局限）：
  - [x] 1.5.1 `VolumeBreakoutPlugin`（经典量价类：放量突破因子插件）
  - [x] 1.5.2 `FinancialSafetyGuardPlugin`（基本面类：连续3年ROE避雷门禁插件）
  - [x] 1.5.3 `NorthboundCapitalPlugin`（资金面类：北向外资加仓异动插件）
- [x] 1.6 实现 `HttpProxyFactorPlugin`（为外置 Python/FastAPI AI 模型与另类数据预留标准桥接器，含200ms硬超时与弃权熔断）
- [x] 1.7 编写插件契约与注册表单元测试门禁（100% 覆盖率断言）

## Phase 2: 决策流引擎核心与快照收敛 (`libs/strategy/decision-flow`)

- [x] 2.1 定义通用决策流树节点模型：`GuardNode`, `BranchNode`, `ExtractorNode`, `ConsensusNode`, `TerminalNode`
- [x] 2.2 实现共享黑板（BlackBoard Context）生命周期管理与上下文富化机制
- [x] 2.3 实现通用递归求值器 `DecisionFlowEvaluator`（支持异步递归求值、毫秒级短路剪枝、条件路由与局部加权打分）
- [x] 2.4 **【核心存量合并】统一白盒执行轨迹构建器（`DecisionExecutionTraceBuilder`）**（淘汰并吸收原两套独立的 `serializeStrategyContextSnapshot` 与 `serializeChanBspContextSnapshot`）
- [x] 2.5 实现存量策略透明编译器（`legacy-strategy-compiler.ts`，自动把旧策略转为单节点决策树，保障零感知平移）
- [x] 2.6 编写决策流引擎完整测试套件（多分支分流、短路熔断、加权打分、一票否决、Parity 对齐）

## Phase 3: 实时与回测双轨求值链路彻底合并 (`apps/signal`, `apps/backtest`, `apps/mist`, `libs/shared-data`)

- [x] 3.1 数据库 Migration 024：在 `strategy_signals` 与 `backtest_signal_results` 中扩展 `confidence`, `confidence_level`, `decision_trace` 字段，扩充 `kind` 枚举支持 `'decision_flow'`
- [x] 3.2 更新 TypeORM 实体 `strategy-signal.entity.ts` 及其类型定义
- [x] 3.3 **【核心存量合并】重构 `RealtimeStrategyEvaluationService`**：彻底删除私有方法 `evaluateChanBsp`，消除 `if (kind === chan_bsp)` 硬编码分支，统一调用 `DecisionFlowEvaluator`
- [x] 3.4 **【核心存量合并】重构 `BacktestRunExecutor`**：彻底删除回放循环中重复的两套 `if (plan.kind === 'chan_bsp') { ... } else { ... }` 逻辑，100% 复用 `DecisionFlowEvaluator`
- [x] 3.5 **【核心存量合并】解耦 `StrategyDefinitionService` 校验层**：消除对 `CHAN_BSP` 的硬编码 `if-else` 分叉，委托给 `DecisionFlowCompiler` 统一校验图拓扑
- [x] 3.6 **【修复数据缺陷】`StrategySignalService` 补全 `security` 关联**：消除前端实时信号只显示 `securityId: 142` 的缺陷，填充真实标的代码与名称
- [x] 3.7 **告警通知层置信度与决策摘要增强**：升级 `apps/notification` 的 `notification-envelope.ts`，消息格式纳入置信度与一句话白盒理由
- [x] 3.8 **新增因子货架元数据端点**：在 `apps/mist` 中新增 `GET /v1/factors/plugins`，供前端动态拉取已注册插件元数据
- [x] 3.9 编写实时推流与离线回测双轨一致性测试（Parity Test：同一历史切片下决策与轨迹 100% 逐字对齐）

## Phase 4: 前端彻底清洗、双工作区归一与通用白盒抽屉 (`mist-fe`)

- [x] 4.1 **【前端彻底摘除】清除 `StrategiesWorkspace` 旧手写 JSON 文本框与多余回测 Tab**（彻底删除 `DEFAULT_RULE` 与 `<textarea value={ruleText}>`）
- [x] 4.2 清洗升级 `mist-fe` API Client 契约（`app/api/client.ts`，扩展统一信号契约 `UnifiedSignalVo`，剔除旧版单规则参数）
- [x] 4.3 全新组件开发：因子插件货架 `PluginCatalog.tsx`（按 7 大流派分类卡片展示可用插件）
- [x] 4.4 全新组件开发：决策流树编排台 `DecisionFlowBuilder.tsx`（树状门禁/分支配置器 + 局部加权滑块）
- [x] 4.5 **【通用合并】全新组件：通用白盒归因抽屉 `DecisionTraceDrawer.tsx`**（**彻底废弃并删除 `ChanDiagnosisDrawer.tsx`**，实时与回测 100% 共享共用同一个抽屉，支持动态插件证据卡片）
- [x] 4.6 回测工作区对齐升级：改造 `BacktestSignalTable.tsx`，删除硬编码 `BSP_LABEL_MAP` 与 `1bsp/2bsp/3bsp` 过滤按钮，升级 K 线 Marker 标记
- [x] 4.7 **跨工作区无缝看盘联动**：在信号表格增加“在看盘中打开”，改造 `KLineLivePage.tsx` 支持 `focusTime` URL 参数聚焦定位该时刻 K 线
- [x] 4.8 前端全工作区端到端与页面交互回归测试

