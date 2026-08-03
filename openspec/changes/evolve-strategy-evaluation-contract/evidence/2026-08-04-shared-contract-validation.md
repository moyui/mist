# 共享策略契约阶段验证（2026-08-04）

## 验证范围

- 分支：`feat/evolve-strategy-evaluation-contract`
- 被验证提交：`7fc5ced feat(strategy): evaluate bounded strategy contexts`
- 本阶段只覆盖 tasks 2.1–2.6 的 runtime-neutral Strategy library。
- 本阶段没有修改 migration、TypeORM entity、HTTP/RPC API、`mist-fe` 或生产部署。

## 自动化结果

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| Strategy library Jest | 通过 | 6 suites、111 tests 全部通过。 |
| TypeScript `tsc --noEmit` | 通过 | 全仓 TypeScript 类型检查通过。 |
| `libs/strategy/src` ESLint | 通过 | 无 lint error。 |
| Nest `mist` build | 通过 | webpack 编译成功。 |
| `openspec validate evolve-strategy-evaluation-contract --strict` | 通过 | change artifacts 符合 strict validation。 |
| `git diff --check` | 通过 | 无 whitespace error。 |

Strategy tests 覆盖以下已确认边界：

- runtime-neutral `StrategyBar` 与 replay/realtime market-data ports；
- MySQL fixed-scale OHLC string 和 Redis finite number 的共同价格投影；
- exact field/node validation、depth/condition limit 和 required-bar compilation；
- `Decimal8` create normalization、stored canonical validation 和精确比较；
- 同交易日 quantity forward-fill、日切清空、显式零值和 current/previous evidence；
- 两阶段 `unavailable | evaluated(matched)` evaluator 与 current/prior crossover；
- 固定 13-bar KDJ(9,3,3) 和 130-bar MACD(12,26,9)；
- immutable bounded context 与不携带完整原始 K 的 `contextSnapshot`。

## 完整 Jest 基线

完整 Jest 执行结果为：108 suites 通过、2 suites 失败、2 suites 跳过；965 tests 通过、
9 tests 失败、3 tests 跳过。

失败仅来自两个需要 Supertest 监听本地 socket 的 integration suite：

- `libs/transport/src/http/http-transport.integration.spec.ts`
- `apps/mist/src/collector/collector-http-boundary.integration.spec.ts`

两者均在监听 `0.0.0.0` 时收到沙箱错误
`listen EPERM: operation not permitted 0.0.0.0`，没有进入业务断言。其余 strategy、candle、
Chan、schema 和 controller 测试均通过。因此将这两项记录为执行环境阻塞，不把完整 backend
baseline 记为通过，也不勾选 task 4.1。

## 跨仓 CI contract 检查

`tools/test-ci-contracts.mjs` 默认要求一个已经合并全部前置 change 的多仓组合基线。本 change 是从
`complete-current-day-realtime-candles` 独立 worktree 开发；该基线不包含仍位于独立
`extract-chan-core` worktree 的 `libs/chancore`。

将 `MIST_WORKSPACE_ROOT` 指向外层当前多仓工作区后，脚本在读取
`mist/libs/chancore/src/internal/bi.ts` 时即报告 `Missing expected file`，没有运行后续 contract
断言。该结果是组合基线不满足脚本前置条件，不是本阶段 Strategy library 的断言失败。待相关前置
change 合并到同一集成基线后重跑。

## 仍然生效的硬门禁

- 尚未在真实生产 MySQL 执行只读审计
  `deploy/database/audit-strategy-evaluation-contract.sql`。
- `schema_migrations`、六类 strategy/backtest 表存量、column/index/constraint inventory 和
  source quantity profile 尚未取得生产证据。
- 因此 tasks 1.3、1.4、3.1–3.5、4.1–4.4 保持未完成。
- 在项目负责人审核生产 preflight 前，不得新增或修改 migration、entity、数据库约束或公开 API。
