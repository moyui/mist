## 1. 基线与所有权确认

- [x] 1.1 记录六仓 branch、HEAD、dirty/worktree、active changes、当前 Compose 和数据库 migration 基线。
- [x] 1.2 建立 market → context → analysis → strategy → Signal/AlertEvent → notification → deploy/monitoring owner matrix。
- [x] 1.3 确认 `apps/signal` 是 realtime live Signal/PENDING AlertEvent 唯一 writer；人工执行策略只
  创建并提交 BacktestRun，不写 live 记录。legacy `/v1/strategy-scans/run` 不迁移到 Signal，由
  realtime child change 删除。
- [x] 1.4 确认 `apps/backtest` 持有历史回放执行，`apps/mist` 保留公共 backtest API。
- [x] 1.5 确认 MySQL `BacktestRun` 是 V1 权威任务登记，不增加 backtest queue Redis。
- [x] 1.6 确认 V1 backtest 单实例、中断后 FAILED、用户新建 run 且不自动重试。
- [x] 1.7 确认 NestJS TCP 为 backtest 主触发，只做两端启动补偿且不周期轮询。
- [x] 1.8 确认 backtest 最大等待数量由 `libs/config` 的 `BACKTEST_QUEUE_CAPACITY` 提供，默认
  `8`，合法整数范围 `1–64`。
- [x] 1.9 确认 Backtest 自身 reconciliation 使用固定 cutoff、稳定排序、超量显式 FAILED，完成后才
  ready；Mist 启动只做一次 3 秒 health 检查，不等待/轮询/重试，仅 ready=true 时补发一次，其他
  结果按 cutoff 条件失败且不阻塞无关 API/market ingress/Signal。
- [x] 1.10 确认 backtest POST 只提交 command，accepted 后返回
  `202 + runId + PENDING + Location`，执行与结果走 GET 查询。
- [x] 1.11 确认 `queue_full→429`、unready/connection/still-PENDING timeout→503、timeout readback
  RUNNING/COMPLETED→202，并保留已创建 run identity。
- [x] 1.12 确认唯一端到端 `BACKTEST_COMMAND_TIMEOUT_MS` 位于 `mistEnvSchema`，默认 `3000ms`、
  范围 `500–30000ms`，覆盖 connect/response 且不自动重发。
- [x] 1.13 确认 `standardize-service-boundary-contracts` 先建立 `libs/transport/http|rpc`，公共 HTTP
  与内部 RPC 使用不同 envelope，所有 RPC 必填 `correlationId`。
- [x] 1.14 确认 HTTP body `statusCode` 镜像真实 status、error 使用 stable `code` 与安全 message、
  expected business rejection 使用实际 200 + `success=false/code`，protocol/dependency/internal
  failure 使用真实 4xx/5xx；同时保留 typed error data、单一 server requestId，并消除
  `apps/chan -> apps/mist` transport source import。
- [x] 1.15 确认 `evolve-strategy-evaluation-contract` 单一持有 canonical `StrategyBar`、统一内部
  `StrategyMarketDataPort` 及 criteria/result domain types，并同时表达 replay、realtime warmup 和
  realtime observation；`extract-backtest-runtime` 只装配 MySQL replay adapter，
  `run-realtime-strategy-evaluation` 只装配 MySQL/Redis/memory realtime adapters；两个 runtime 不互相
  依赖或重新定义 contract。V1 不定义 snapshot
  observation branch，snapshot 不参与 backtest 或 realtime execution，未来需要时另建 focused
  change。
- [x] 1.15.1 确认 raw quantity 保留 decimal string/null，strategy evaluation 通过共享
  `QuantityForwardFillProjector` 只在同交易日向前生成 effective view；V1 strategy 只消费 Indicator
  kernels，不计算或暴露 `chan.*`，未来 Chan strategy 接入另开 change。
- [x] 1.16 与项目负责人逐项确认其余 control plane、analysis kernels、notification runtime 和 schedule 边界。

### 1.A 基线证据（2026-08-02）

- `mist`：`feat/productize-current-day-realtime-market-data` @
  `6a1caa0f2e54750db5cbfe8f1800db6cb4fb26a2`；文档/OpenSpec dirty；另有 alert-delivery 与 portfolio
  worktree。
- `mist-deploy`：同名 branch @ `8f323bb72a5c2b1706a79dd94996c1d66c4a41af`；
  `docker/.env.example` 既有 dirty 修改保持不动。
- `mist-monitoring`：同名 branch @ `4718416f`，clean；`mist-datasource`：同名 branch @
  `c59eefd`，clean；`mist-skills`：同名 branch @ `9458f26`，clean。
- `mist-fe`：`feat/design-system-phase0` @ `6515bfed`，clean；另有 portfolio worktree，前端交付不并入
  本后端架构 change。
- 当前 Compose 尚无 backtest、signal 或 notification service；migration 文件为 `001`–`013`。
- 真实 `schema_migrations`、生产数据、Windows Compose 与交易时段 TDX/QMT HIL 未在本次文档审计中
  验证，继续作为 child change 实施门禁。

## 2. Roadmap 收敛

- [x] 2.1 将确认后的 owner matrix 和 child-change 依赖图写回 design/specs。
- [x] 2.2 核对每个 child change 只有一个 schema、runtime state 和 migration owner。
- [x] 2.3 核对 `apps/schedule` 保持禁用且未被任何 child change 隐式恢复。
- [x] 2.4 核对旧一体化 change 的每项 requirement 已映射到唯一 child change 或明确丢弃。
- [x] 2.5 核对 backtest/signal RPC 产品代码都以已验收的 service-boundary change 为前置，且未各自
  定义通用 envelope。

## 3. 验证与归档

- [x] 3.1 执行本 change 与全部 stable specs strict validation。
- [x] 3.2 执行 `git diff --check` 和 active-change 重复所有权检索。
- [x] 3.3 由项目负责人审核拆分结果后归档本 change；归档前不开始 child-change 产品代码。
