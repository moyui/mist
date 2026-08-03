## 实施基线

记录时间：2026-08-03

### 范围修正

本 change 取代尚未实施的 `extract-market-analysis-kernels`：

- 不再把 Chan 与 Indicator 作为共同 base；
- Strategy KDJ/MACD 归 `evolve-strategy-evaluation-contract`；
- 当前公共 Indicator/K API 保持现状，不进入本 change；
- 本 change 只抽取 ChanCore 并解除 `apps/chan → apps/mist` 业务源码依赖。

### 仓库与工作区

- 仓库：`mist`
- 分支：`feat/extract-chan-core`
- worktree：`mist/.worktrees/extract-chan-core`
- 基线：`master@fe56c6863cc498acbad0a6803da16c2615bb6997`
- 初始实现状态：未移动应用源码、未新增 migration

### 当前真实链路

```text
mist-fe / mist-skills
  -> gateway /api/chan
  -> apps/chan (chan-api:8008)
  -> apps/mist/src/chan/ChanModule             [跨 app import]
  -> IndicatorService.findKData                [TypeORM K/Security adapter]
  -> KMerge / Fenxing / Bi / Channel services  [DTO/VO/Nest/HTTP 混合]
  -> shared HTTP envelope
```

`apps/mist` 同时装配 IndicatorModule 与 ChanModule，因此当前存在两个 app 都可注册相关 controller 的
可能性；长期 owner 尚未确认。

### 已确认的范围结论

- ChanCore 与 Strategy Indicator calculation 是两个独立 owner。
- Backtest/Realtime 通过 StrategyMarketDataPort + shared evaluator 计算 KDJ/MACD，不依赖 ChanCore 或
  `/v1/indicators/*`。
- 不创建 `@app/analysis/indicator`，不预先发明 `reference/timestampMs/ordinal` 等 Chan 字段。
- ChanCore 不查询 K、不写 persistence、不访问 HTTP/TypeORM/Redis/env。
- 现有 URL、HTTP contract 和 Chan 算法在本 change 内保持不变。

### 已完成审计

- 当前 Chan service/controller/DTO/VO/type/app import inventory；
- frontend/skills/gateway/deploy/monitoring route consumer inventory；
- 现有 9 个相关 Jest suites、50 个 tests 全部通过；
- stable Chan lifecycle 与 Strategy runtime ownership 对照。

### 尚未满足的实施门禁

- 现有 fixtures 还不是完整 end-to-end full-output fingerprint；
- Chan route、K read adapter、`/v1/indicators/k` 和 Nest module owner 未确认；
- pure library 名称与 input/output/error/numeric/mutation/version contract 未确认。

以上门禁完成前不得移动 source files。
