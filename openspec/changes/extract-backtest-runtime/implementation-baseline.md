# Backtest runtime implementation baseline

日期：2026-08-04

## 范围

- `mist`: `feat/extract-backtest-runtime`, 基于 `master` `c387bd4`，worktree clean。
- `mist-deploy`: 当前 master worktree clean，未发现 Backtest service 配置。
- `mist-monitoring`: 当前 master worktree clean，未发现 Backtest 观测配置。
- 本次实现使用独立 `mist/.worktrees/extract-backtest-runtime`，不包含主 worktree 的实时订阅未提交修改。

## 前置依赖

- `standardize-service-boundary-contracts` 已归档：`2026-08-03-standardize-service-boundary-contracts`。
- `evolve-strategy-evaluation-contract` 已归档：`2026-08-04-evolve-strategy-evaluation-contract`。
- `extract-chan-core` 已归档，且不属于本 change 前置依赖。
- 共享 `libs/transport`、`libs/strategy`、`libs/decimal` 已存在；Backtest library 当前仅有空 root barrel。

## 自动化基线

| 命令 | 结果 | 说明 |
|---|---|---|
| `pnpm run typecheck` | 通过 | 基线无 TypeScript 错误 |
| `pnpm run lint:check` | 通过 | 基线无 ESLint 错误 |
| `pnpm run test:ci` | 130 suites passed | 2 个 HTTP integration suite 因 sandbox 禁止监听 `0.0.0.0` 失败；不是断言失败 |

## 数据库门禁

当前本机没有运行 Mist MySQL/Compose，无法读取真实 `schema_migrations`、Backtest 存量、物理列、named
constraints、index 或 `EXPLAIN`。仓库 migration 已存在 `014_evolve_strategy_evaluation_contract.sql`，
因此 spec 中的 `014/015` 不能直接作为本 change 编号。任何 target-issues/pagination DDL 必须等待
真实 preflight/readback 后再固定编号和执行。
