# Tasks: Pre-Market Strategy Window Hydration and Timeline Governance

## Phase 1: 集中调度常量与时段定义 (`@app/timezone`)

- [ ] 1.1 在 `libs/timezone/src/cron-schedules.constants.ts` 中新增 `CRON_PRE_MARKET_STRATEGY_WARMUP_0920 = '0 20 9 * * 1-5'` 调度常量定义
- [ ] 1.2 在 `libs/timezone/src/index.ts` 中导出 `CRON_PRE_MARKET_STRATEGY_WARMUP_0920` 并补充单元测试
- [ ] 1.3 运行 `pnpm --filter @app/timezone test` 确保时区库全绿

## Phase 2: 内存滑窗主动预热能力 (`SharedStrategyWindowStore`)

- [ ] 2.1 在 `libs/signal/src/runtime/shared-strategy-window.store.ts` 中实现 `warmup(marketData, targets, anchorAt)` 方法
- [ ] 2.2 确保 `warmup` 遵循现有容量复用检查（已有且容量满足则幂等跳过）
- [ ] 2.3 确保单标的异常被捕获隔离，返回结构化 `WindowWarmupReport`
- [ ] 2.4 编写 `shared-strategy-window.store.spec.ts` 针对 `warmup` 的全量单元测试（成功预热、跳过已就绪、异常隔离）

## Phase 3: 信号运行时编排与双重触发 (`apps/signal`)

- [ ] 3.1 在 `SignalRealtimeStartupService` 中集成事件驱动的异步预热逻辑（注册表初始化与变更后触发）
- [ ] 3.2 增加 09:20 交易日定时调度器，在交易日开盘前 09:20 执行全量活跃策略滑窗预热
- [ ] 3.3 补充 `SignalRealtimeStartupService.spec.ts` 针对预热调度与触发的测试用例

## Phase 4: 可观测性与健康诊断 (`apps/signal`)

- [ ] 4.1 在 `SignalHealthVo` 及 diagnostics 中增加预热状态信息
- [ ] 4.2 确保预热失败记录规范的 safe failure code，不向健康端点抛出未捕获异常

## Phase 5: 验证与两份质量门禁校对

- [ ] 5.1 运行受影响模块的全量自动化测试：`pnpm --filter @app/timezone test`、`pnpm --filter @app/signal test`、`pnpm --filter signal test`
- [ ] 5.2 运行全仓静态检查：`pnpm run lint:check` 和 `pnpm run typecheck`
- [ ] 5.3 运行 OpenSpec 校验：`openspec validate --all --strict`
- [ ] 5.4 依据 `mist/docs/project-quality-governance-guide.md` 和 `mist/docs/governance/openspec-and-documentation-governance-guide.md` 完成逐项校对
