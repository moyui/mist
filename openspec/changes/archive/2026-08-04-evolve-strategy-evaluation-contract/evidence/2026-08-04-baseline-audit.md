# Strategy Evaluation Contract 基线审计（2026-08-04）

## 结论

- `complete-current-day-realtime-candles` 已提供共享 `libs/decimal`；本 worktree 对
  `decimal8.spec.ts` 和 `decimal-boundary.guard.spec.ts` 的独立复验为 2 suites / 51 tests 全部通过。
- `libs/strategy`、`libs/backtest`、`libs/signal` 当前仍是边界占位，策略 field catalog、compiler、
  projector、context serializer 和有界指标尚未进入共享 library。
- 当前可运行的 validator/evaluator/context builder、手动 scan 和 signal-level backtest 都位于
  `apps/mist/src/strategy`，并依赖 Nest/TypeORM/entity 形状；它们只能作为迁移输入，不能作为新的
  runtime-neutral contract。
- 本轮只完成仓库边界盘点。真实生产 `schema_migrations`、六表存量和物理 schema 尚未由本 change
  获取，因此 schema、entity、HTTP DTO 和 quantity-rule consumer 不得提前修改。

## Decimal8 前置验收

共享 primitive 位于：

- `libs/decimal/src/decimal8.ts`
- `libs/decimal/src/decimal8.spec.ts`
- `libs/decimal/src/decimal-boundary.guard.spec.ts`

已确认能力：

- external unsigned decimal text 与 stored canonical string 分阶段校验；
- scale 8、28 位整数、最大 37 ASCII 字符；
- `compare/add/subtract/scaleByUnit` 使用 bigint 定点运算；
- 禁止隐式 number coercion、raw `Decimal8` JSON 序列化和越界输出；
- quantity 领域边界拒绝负值，`null` 不等价于零。

复验命令（新 worktree 复用仓库根的已安装 Jest）：

```text
node ../../node_modules/jest/bin/jest.js --runInBand --watchman=false \
  libs/decimal/src/decimal8.spec.ts \
  libs/decimal/src/decimal-boundary.guard.spec.ts
```

结果：`2 passed`，`51 passed`。ChanCore 不参与此依赖链。

## 当前影响链

### Registry / rule producer

- HTTP producer：`CreateStrategyDefinitionDto` 与 `UpdateStrategyDefinitionDto` 接受任意 object rule；
- service：`StrategyDefinitionService` 调 app-local `StrategyRuleValidator`，随后写
  `strategy_definitions` / `strategy_versions`；
- 当前仍存在 PATCH + 新 version 的更新链路，没有 `signalKind`。

### Rule wire / persistence

- `StrategyVersion.rule_schema_version` 当前只有 `v1` enum；rule 与 validation summary 为 JSON；
- migration 006 创建六张策略/回测表，009 收紧 FK、snapshot 与 backtest result identity；
- 本 checkout 的 migration ledger 文件最高为 `013_remove_qmt_native_period.sql`；候选新编号必须由真实
  `schema_migrations` 再确认。

### Decoder / validator / compiler

- app-local validator 只按 field root 接受 `k/indicator/chan/security`，未使用 exact field catalog；
- 仍使用 `neq`，没有 exact node shape、depth=8、condition=64 或 compiled required bar count；
- quantity threshold 已开始复用 `Decimal8.parseCanonical`，但 create normalization、统一 compiler 和
  load/runtime validation 尚不存在。

### State / market data adapter

- MySQL `K` 的 OHLC 是 `DECIMAL(20,2)` entity number，volume/amount 是 canonical string|null；
- `StrategyEvaluationContextBuilder` 直接 `Number(k.open/high/low/close)` 并附带 security/code/timestamp；
- 尚无 runtime-neutral `StrategyBar`、replay/realtime port 或 Redis adapter；
- 尚无 quantity forward-fill/evidence projector。

### Consumers

- legacy manual scan：`POST /v1/strategy-scans/run`，每个 definition/security/period/source 单独查最新 K，
  命中后写 Signal + AlertEvent；这与已确认的“只有实时链路产生 Signal”目标不一致。
- signal-level backtest：HTTP 请求内同步查询整段 K、逐行 evaluation 并写 result；尚未接入 Backtest app/RPC。
- `mist-fe` 当前 `feat/design-system-phase0` 工作区干净，但仍消费 PATCH、manual scan、旧 rule、
  `securityCode` 和旧 backtest API。本 change 不修改该并行前端分支。
- stable specs 仍描述版本更新、manual scan 和旧 signal-level backtest；本 change 的 delta specs 是后续
  收敛依据，归档前必须确保 stable specs 被正确更新。

## Portfolio worktree 处置

`feat/strategy-portfolio-backtesting` worktree 当前干净，HEAD 为 `73befb9`，但基于已经过时的仓库状态：

- 包含 `entryRule/exitRule/lookbackBars`、paired rules、portfolio processor 和私有 field catalog；
- 同时混入大量旧 realtime/roadmap 文件移动与删除；
- 使用旧 `007/008` portfolio migration 编号，而当前主线已经存在 007～013；
- 因此只用于提取业务 fixtures/算法意图，不 cherry-pick，不复用其 migration、schema ownership 或
  app-local rule engine。

## 质量状态与硬门禁

| 项目 | 状态 | 说明 |
|---|---|---|
| Decimal8 自动化 | confirmed | 2 suites / 51 tests passed |
| entities/migrations/API/FE/legacy consumers inventory | confirmed | 已按 producer 到 consumer 链记录 |
| production `schema_migrations` | not-found | 本轮尚未获取真实 Windows MySQL evidence |
| 六张表精确 row count | not-found | 不以旧 protected digest 代替本 change preflight |
| physical columns/indexes/constraints | not-found | 必须通过新的只读 production audit |
| source quantity profile | partial | 前置 change 已记录当前 profile；最终 shadow/HIL 仍未完成 |

在后三项得到 evidence 并由项目负责人复核前：不创建 migration，不改 entity，不删除 PATCH，不改变公共
HTTP DTO，也不让实时/回测 runtime 依赖尚未完成的 contract。
