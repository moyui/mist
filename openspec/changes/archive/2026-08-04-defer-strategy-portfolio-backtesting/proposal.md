## Why

`strategy-portfolio-backtesting`（组合级回测：资金、仓位、订单、成交、A 股费用、净值曲线、收益指标）
是一个完整设计并已在 `feat/strategy-portfolio-backtesting` 分支实现的能力（约 9k 净 LOC、真
portfolio engine、交易台账实体、异步 202 API、007/008 SQL migration、484 测试通过）。但它从未被
ratified，也从未并入任何主分支，且与现行 spec 体系的方向**根本不同**——现行方向一贯是 signal-level
回测。本 change 正式记录这一**方向决策的延期**，避免后续任何 agent/会话再次把该分支当作"未知孤儿"
重新评估。

判定依据（均可在仓库中复核，file:line）：

1. 现行 spec 体系从 2026-07-07 roadmap 起一贯 signal-level。portfolio 级当时被作为备选**评估并主动
   否决**，理由是"是另一种执行模型，应等 signal 语义稳定后再说"——见
   `archive/2026-07-07-define-strategy-platform-roadmap/design.md:140-149`。
2. 占位子 change `extend-strategy-portfolio-backtesting` 被标记 **Deferred**、从未创建或 ratified——见
   `archive/2026-07-07-define-strategy-platform-roadmap/design.md:394`。
3. 所有触及回测的 ratified spec 都以**排除 portfolio** 的 requirement 形态存在，portfolio 从不作为能力
   出现——`specs/strategy-signal-backtesting/spec.md:52-60`（`Backtests Shall Exclude Portfolio
   Simulation`：MUST NOT 有 cash/positions/orders/fills/fees/slippage/NAV/组合收益字段）、
   `specs/strategy-platform-roadmap/spec.md:164-165`、`specs/strategy-definition-registry/spec.md:102-113`、
   `specs/strategy-operator-ux/spec.md:123-132`。
4. 当前进行中的 `extract-backtest-runtime` 与 `evolve-strategy-evaluation-contract` 在多处明文不实现
   portfolio：`extract-backtest-runtime`（`proposal.md:189-190`、`design.md:27`、`design.md:843-847`、
   `specs/backtest-runtime/spec.md:1398,1403`）、`evolve-strategy-evaluation-contract`（`proposal.md:61`、
   `proposal.md:75`、`proposal.md:92`、`design.md:20`、`design.md:227`、
   `specs/strategy-evaluation-contract/spec.md:306`、`specs/strategy-signal-backtesting/spec.md:12`）。
5. 重定基线的生产 roadmap `define-mist-production-roadmap` 零次提及 portfolio——组合回测不在 G0–G4
   里程碑内。
6. 已有两个 archived change **明文拒绝合并**该分支：
   `archive/2026-07-23-align-realtime-native-ingress-contracts/evidence/2026-07-22-workspace-checkpoint-audit.md:19-47`
   （不 cherry-pick、不 merge 任意 commit；不把 `007/008` 当可复用 migration 号；portfolio worktree
   原样保留不动）、`archive/2026-07-22-converge-theme-a-realtime-bridges/tasks.md:77`（portfolio 工作归
   `add-strategy-portfolio-backtesting` 拥有；要求新开分支；明文把 007/008 排除出生产）。

## What Changes

- **正式标记** `strategy-portfolio-backtesting`（组合级回测）为**无限期延期**。
- 当前 sanctioned 的回测方向为 **signal-level**：`extract-backtest-runtime`（将信号级回测抽到独立
  `apps/backtest` 进程）+ `evolve-strategy-evaluation-contract`（共享评估契约 `StrategyBar` /
  `StrategyMarketDataPort` / evaluator 的唯一 owner）。
- 不创建任何 spec delta、不修改任何 capability。本 change 是纯决策记录。

## Capabilities

### New Capabilities

无。`strategy-portfolio-backtesting` 作为能力**不被 ratified**；它仍以"被排除/被延期"的形态存在于
现行 spec 体系中。

### Modified Capabilities

无。

## Impact

- **无代码影响**：不引入、不删除任何代码。`feat/strategy-portfolio-backtesting` 分支（commit
  `db365eb`、`4c7880b`、`73befb9`）及其 worktree 原样保留，作为唯一完整的组合级实现/设计副本，永不
  丢失（remote `origin/feat/strategy-portfolio-backtesting` 同样保留）。
- **migration 不可复用**：分支带的 `007_strategy_portfolio_backtesting.sql` 与
  `008_strategy_portfolio_backtesting_indexes.sql` **不得**被任何其他 change 当作可复用 migration
  号或内容；主分支的 migration 序列已独立前进。
- **无 schema 变更**：组合级回测所需的 order/trade/equity-point 表与 paired entry/exit rule 契约均
  不进入主分支。
- 同步登记到治理指南
  `docs/project-quality-governance-guide.md` §6.7「当前明确延期或不实施的能力」。

## Restart Prerequisite（未来若重启 portfolio）

组合级回测若在未来重启，**必须新建独立 change**，并重新评审：

- 与 `evolve-strategy-evaluation-contract` 共享评估契约（`StrategyBar` / port / evaluator / signalKind
  schema）的冲突——portfolio 需要 paired entry/exit rule，而现行契约是 creation-only 单 rule + 单
  signalKind。
- 与 `extract-backtest-runtime` runtime 边界的关系（是否在 `apps/backtest` 内扩展还是独立进程）。
- 资金/费用/净值模型的 A 股正确性基线（T+1、整手、印花税等）。
- 前端 mist-fe 的组合回测工作区方向。

不得直接 rebase 或 cherry-pick 旧分支，需以本决策记录为前置背景重新立项。
