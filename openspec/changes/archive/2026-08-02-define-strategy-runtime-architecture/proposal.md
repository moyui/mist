## Why

现有策略能力、`apps/schedule`、独立 `chan-api`、指标计算和 realtime signal 规划存在职责重叠，
一体化 change 又把多个可独立验收的能力合成了单次交付。需要先建立稳定的运行时边界和依赖顺序，
再逐项评审具体实现。

## What Changes

- 定义 market producer、策略控制面、策略计算面、分析内核和通知投递面的唯一职责。
- 确认采用“先拆模块、再拆进程、暂不拆仓库”的演进方向；公共策略 REST API 继续由
  `apps/mist` 持有。
- `apps/signal` 作为 realtime live Signal 与 PENDING AlertEvent 的唯一计算和写入 owner；旧
  `/v1/strategy-scans/run` 不迁移到 Signal，后续 focused change 将删除该人工 live-scan 入口。
  人工执行策略只通过 backtest API 创建 `BacktestRun`，不得写 live Signal/AlertEvent。
- 使用项目名 `backtest`、目录 `apps/backtest` 和根模块 `BacktestAppModule` 建立独立历史回放
  运行时；公共 backtest API 仍由 `apps/mist` 持有。
- 使用 focused child change `standardize-service-boundary-contracts` 先建立 `libs/transport/http`
  与 `libs/transport/rpc`；公共 HTTP 与内部 RPC 使用不同 envelope，所有内部 request-response
  调用共享必填 `correlationId` 和版本化 pattern 规则。
- 由 `evolve-strategy-evaluation-contract` 单一持有 canonical `StrategyBar`、
  `StrategyMarketDataPort` 及其 criteria/result domain types；`extract-backtest-runtime` 只实现 MySQL
  replay adapter，`run-realtime-strategy-evaluation` 只实现 MySQL/Redis/memory realtime adapters，
  两个 runtime 不互相依赖或重新定义公共契约。
- 将 `apps/schedule` 从 realtime strategy 和 notification owner 候选中移除；其未来职责继续延期。
- 把原一体化 realtime strategy change 拆为独立 child changes，并规定前置依赖和独立验收门禁。
- 建立强制逐项评审门禁：child change 的 schema、provider 语义、队列、恢复、迁移、部署和 HIL
  细节，必须在实现前与项目负责人确认并记录。
- 本 change 只更新架构与 OpenSpec，不修改产品代码、数据库或部署。

## Capabilities

### New Capabilities

- `strategy-runtime-architecture`: 定义策略控制面、计算面、市场分析内核、通知投递和数据端口的职责及依赖方向。

### Modified Capabilities

- `strategy-platform-roadmap`: 以 focused child changes 替代单一大 change，并记录新的依赖与验收顺序。
- `strategy-scheduler-alert-delivery`: 移除 `apps/schedule` 对 realtime strategy scan 和通知投递的所有权。

## Impact

- **OpenSpec/docs**：新增运行时架构 capability，修订策略 roadmap 和旧 schedule delivery 边界。
- **后续代码**：先由 `standardize-service-boundary-contracts` 新增 `libs/transport` 并修复现有
  HTTP envelope，再新增同仓 `apps/signal`、`apps/backtest`；可能新增的 notification app 和纯逻辑
  libraries 均不由本 change 实现。
- **本 change 不直接修改**：provider wire、MySQL schema、Redis、Compose、现有 API 和生产运行
  状态；后续 realtime focused change 负责删除 legacy strategy-scan API，frontend consumer 由独立
  项目同步清理。
