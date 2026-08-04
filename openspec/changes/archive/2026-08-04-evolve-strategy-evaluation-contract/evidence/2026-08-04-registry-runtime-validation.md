# Strategy Registry 与 Backtest Runtime 验证（2026-08-04）

## 交付提交

- `5838721 feat(strategy): make definitions creation only`
- `2e157f5 refactor(strategy): unify backtest evaluation runtime`

本阶段只修改 `mist` 仓库 backend/schedule 代码；没有修改 `mist-fe`，没有启动 realtime Signal runtime，
也没有在生产执行 migration 014。

## Registry 与 API

- `POST /v1/strategies` 必填一个 `rule` 和一个 `signalKind='entry'|'exit'`。
- create boundary 复用共享 compiler；可规范化的 decimal string 只在此边界规范化一次，持久化 canonical
  rule。
- definition、version 1、`currentVersionId` 在同一个 TypeORM transaction 中全成全败。
- load、enable、versions read、Backtest 和未来 realtime registration 都复用 stored strict compiler；
  非 canonical 或不精确 shape 不改写，按 Mist-owned 数据不变量失败。
- quantity rule 可以创建和回测，但在 TDX/QMT quantity profile HIL 完成前，enable/realtime
  registration 明确 fail-closed。
- `PATCH /v1/strategies/:id`、`UpdateStrategyDefinitionDto` 和 service update 已删除；内容变化只能新建
  definition。

## Backtest 与旧 live scan 清理

- TypeORM historical K 先经 app adapter 映射为公共 `StrategyBar`；OHLC 统一调用 `KPriceProjector`，
  volume/amount 保持 canonical string/null，historical K 固定为 `type='complete'`。
- 每个 `(securityId, source, period)` 使用 compiled `requiredBarCount` 有界窗口；同日量额使用公共
  `QuantityForwardFillProjector`。
- 回测逐 anchor 调用共享两阶段 evaluator；`unavailable` 不写结果，matched result 使用共享
  `serializeStrategyContextSnapshot`，包含被消费字段及 raw/effective/resolution 量额证据。
- 删除 legacy 单根 K validator/evaluator/context builder、manual scan controller/service/DTO 和
  `/v1/strategy-scans/run`。
- schedule 不再导入 StrategyCore、strategy entities 或在采集后产生 live Signal；实时 Signal 只能由后续
  realtime owning change 触发。

## 自动化结果

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| Strategy/registry Jest | 通过 | 14 suites 通过、1 MySQL suite 跳过；143 tests 通过、1 跳过 |
| creation-only/schedule targeted Jest | 通过 | 相关 route、transaction、HIL gate、backtest、schedule tests 全部通过 |
| backend Jest baseline | 通过 | 105 suites 通过、2 跳过；962 tests 通过、3 跳过 |
| TypeScript | 通过 | `tsc --noEmit` |
| Nest build | 通过 | `nest build mist` |
| Schedule build | 通过 | `nest build schedule` |
| full ESLint | 通过 | `{src,apps,libs,test}/**/*.ts` 无 error |
| Decimal/transport boundary guards | 通过 | 已移除旧 evaluator 文件路径和 schedule→strategy legacy allowlist |
| OpenSpec strict | 通过 | `openspec validate evolve-strategy-evaluation-contract --strict` |
| diff check | 通过 | `git diff --check` |

完整 Jest 首轮实际执行暴露一个本 change 回归：Decimal8 guard 仍读取已删除的旧
`apps/mist/.../strategy-rule-evaluator.ts`。守卫已改为检查共享 Strategy compiler、quantity projector 和
evaluator，单独回归 4/4 通过。该问题不是跳过项。

两个 Supertest integration suites 在当前沙箱首次执行时因
`listen EPERM: operation not permitted 0.0.0.0` 无法进入业务断言：

- `libs/transport/src/http/http-transport.integration.spec.ts`
- `apps/mist/src/collector/collector-http-boundary.integration.spec.ts`

随后在允许本地 socket 的宿主执行相同 Jest 命令，两套 suite、10 个 tests 全部通过。因此 socket
环境门禁已经解除，不再列为阻塞。task 4.1 仍未完成的唯一原因是还需要纳入独立 `mist-fe` 交付的
完整基线。

## 禁止项检索结论

- production Strategy 代码没有 `lookbackBars`、paired rule、numeric decimal threshold compatibility、
  raw bigint JSON、PATCH/update DTO 或 manual scan coupling。
- `BacktestSignalResult.securityCode` 仍按已确认的 run-owned backtest result schema 保留；它不是已删除的
  live `StrategySignal.securityCode` 兼容列。
- `StrategyBar`、`StrategyMarketDataPort` 和 decimal parser/comparator 仍由共享 library 单一持有；app
  adapter 只负责 TypeORM K 到公共 bar 的边界映射。

## 剩余门禁

- 独立 `mist-fe` 交付尚未合并，因此 task 3.5 未完成。
- TDX/QMT quantity profile 的交易时段 HIL 尚未完成，量额策略不得进入 realtime eligible。
- migration 014 仅在隔离 MySQL 8.4 通过，尚未执行生产发布。
