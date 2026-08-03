# 实时策略与回测运行时开发总览

状态：Living index
适用范围：Mist 策略公共契约、signal-level backtest、盘中实时策略信号和后续通知投递

本文是策略运行时开发的唯一人工入口，只回答“系统怎么流动、谁负责、先做什么、现在做到哪里”。
具体字段、错误、容量、数据库、部署和验收契约以 stable OpenSpec 与当前 focused change 为准；本文
不复制这些细节。

## 1. 目标链路

```text
TDX / QMT native data
  → realtime decoder / historical MySQL K
  → current-day sealed 1m candle or replay page
  → canonical StrategyBar / StrategyMarketDataPort
  → Strategy-owned Indicator calculation + bounded strategy context
  → shared validator / evaluator
  ├─ BacktestSignalResult                 (apps/backtest)
  └─ StrategySignal + PENDING AlertEvent  (apps/signal)
                                             → notification worker
```

- realtime V1 只由 sealed K 触发；snapshot signal 留给未来 focused change。
- 人工执行只创建 BacktestRun；不得写 live Signal/AlertEvent。
- portfolio simulation 不属于本链路。现有 Backtest 是 signal-level historical replay。

## 2. 唯一 owner

| 边界 | Owner |
|---|---|
| 公共 HTTP 与内部 RPC envelope | `standardize-service-boundary-contracts` / `libs/transport` |
| realtime snapshot、open/sealed candle、market Redis、Decimal8 | `complete-current-day-realtime-candles` |
| Chan 纯计算（不进入 V1 Strategy） | `extract-chan-core` |
| StrategyBar、StrategyMarketDataPort、KDJ/MACD、field catalog、validator/evaluator/context | `evolve-strategy-evaluation-contract` |
| MySQL replay adapter 与 Backtest lifecycle | `extract-backtest-runtime` / `apps/backtest` |
| realtime adapters、window、episode、Signal/AlertEvent transaction | `run-realtime-strategy-evaluation` / `apps/signal` |
| PENDING AlertEvent 外部投递 | `deliver-strategy-notifications` / notification worker |

Backtest 与 Signal 共享 domain contract，但不得互相导入 application source，也不互为架构前置。

## 3. 实施顺序

```text
standardize-service-boundary-contracts
       │
       ├───────────────┐
       ▼               ▼
complete-current-   extract-market-
day-realtime-       analysis-kernels
candles                 │
       └───────┬────────┘
               ▼
evolve-strategy-evaluation-contract
       ┌───────┴────────┐
       ▼                ▼
extract-backtest-   run-realtime-
runtime             strategy-evaluation
                         │
                         ▼
              deliver-strategy-notifications
```

实际交付一次只推进一个 change：

1. 当前下一项是 `standardize-service-boundary-contracts`。
2. 随后对账并完成已有 candle/Redis 代码，再抽取 Indicator/Chan kernels。
3. 两个基础能力验收后实现共享 strategy evaluation contract。
4. Backtest 与 Signal 可独立实施；默认先用确定性历史回放验证 evaluator，再接 realtime。
5. Signal 稳定产生 PENDING AlertEvent 后才启动通知投递。

## 4. 当前代码事实

- `apps/mist` 仍持有同步 signal-level backtest、legacy manual scan、strategy registry、Indicator 和
  Chan 适配代码。
- candle/Redis foundation 已有部分实现和测试；`complete-current-day-realtime-candles` 的工作是按新
  契约审计、修正并完成 HIL，不是盲目重写。
- `libs/transport`、`apps/backtest`、`apps/signal` 当前尚不存在。
- Backtest/Signal change 中已勾选的多数项目是设计确认，不代表产品代码完成。
- safety stash 和旧 feature worktree 只作逐文件参考；不得整体恢复、继承旧 task 状态或直接移植
  过期 migration。

## 5. 延期与非目标

- 收盘后 provider history sync 无限期延期且当前无 active change；Redis candle 不回写 MySQL，
  `apps/schedule` 不启用。
- portfolio cash/position/order/trade/fee/NAV simulation 需要未来独立 change。
- snapshot-triggered strategy、Chan strategy fields、主动交易执行均不属于 realtime V1。
- frontend 变更使用独立项目和发布门禁，不与后端运行时 change 混写。
- 真实 schema、存量数据、Windows Compose 和交易时段 TDX/QMT 行为必须用环境证据验证；strict
  OpenSpec 或单元测试不能替代 HIL。

## 6. 文档读取顺序

1. 当前系统真相：`openspec/specs/`。
2. 当前正在实施的唯一 change：`openspec/changes/<change>/`。
3. 跨项目质量规则：`docs/project-quality-governance-guide.md`。
4. 后端错误与风格：`docs/backend-error-handling-governance-guide.md`、
   `docs/mist-backend-code-style-guide.md`。
5. `openspec/changes/archive/` 只保存历史证据，不作为当前实现来源。

每次切换 change 时，只更新本文的“当前下一项”和真实代码状态；不得把 child design 的详细常量复制
回本文。
