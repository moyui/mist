## 实施基线

记录时间：2026-08-03

### 范围修正

本 change 取代尚未实施的 `extract-market-analysis-kernels`：

- 不再把 Chan 与 Indicator 作为共同 base；
- Strategy KDJ/MACD 归 `evolve-strategy-evaluation-contract`；
- 当前公共 Indicator/K API 保持现状，不进入本 change；
- 本 change 只抽取 `libs/chancore` 并解除 `apps/chan → apps/mist` 业务源码依赖。

### 仓库与工作区

- 仓库：`mist`
- 分支：`feat/extract-chan-core`
- worktree：`mist/.worktrees/extract-chan-core`
- 初始审计基线：`master@fe56c6863cc498acbad0a6803da16c2615bb6997`
- 当前实施基线：`master@3a07d4b725dec2c288058505c82959224281d2a3`
- 已同步前置：归档 change `2026-08-03-fix-chan-wide-bi-distance`
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
兼容状态；长期唯一 owner 已确认是独立部署的 `chan-api`。

### 已确认的范围结论

- ChanCore 与 Strategy Indicator calculation 是两个独立 owner。
- 独立部署的 `chan-api` 是 `/v1/chan/*` 的长期唯一 runtime owner；当前 change 不删除
  `mist-backend` 兼容路由，后续由独立 route migration 清理。
- pure library 固定为 `libs/chancore`、Nest project `chancore`、import `@app/chancore`。
- Trend、K merge、Fenxing、Bi、Channel 和纯 helpers/enums/types 进入 ChanCore；Controller、HTTP
  DTO/VO、OpenAPI、日期/source 解析与 TypeORM K read 留在 application adapter。
- public barrel 只导出无状态 `ChanCore.mergeK/findFenxings/createBi/createChannels` 和签名所需
  algorithm-owned types/enums；内部 services/helpers/Nest module 不导出，不增加 speculative
  `analyze()`。
- `ChanK` 固定为完整 `id/symbol/time/open/high/low/close/volume/amount`；量额保持 canonical decimal
  string/null，core 使用 `high/low`，adapter 保持现有 HTTP `highest/lowest`。
- `ChanMergedK` 保留 `startTime/endTime/high/low/trend/mergedCount/mergedIds/mergedData`；
  `mergedData` 是完整 `ChanK[]`，三个计数视图必须一致，HTTP adapter 继续恢复现有字段和 K VO 外观。
- 完整行情输入只为后续 Chan 演进留出边界；本 change 不增加笔力度、背驰、量价或 MACD 算法，
  也不导入公共 IndicatorService/Strategy evaluator。
- Backtest/Realtime 通过 StrategyMarketDataPort + shared evaluator 计算 KDJ/MACD，不依赖 ChanCore 或
  `/v1/indicators/*`。
- 不创建 `@app/analysis/indicator`，不预先发明 `reference/timestampMs/ordinal` 等 Chan 字段。
- ChanCore 不查询 K、不写 persistence、不访问 HTTP/TypeORM/Redis/env。
- 现有 URL、HTTP contract 和 Chan 算法在本 change 内保持不变。
- “现有 Chan 算法”以已归档宽笔修复后的行为为准：独立 K 数量按候选 `originData` 的序列位置差
  计算，不按数据库 K ID 差计算；端点缺失或重复继续作为 invariant failure。

### 已完成审计

- 当前 Chan service/controller/DTO/VO/type/app import inventory；
- frontend/skills/gateway/deploy/monitoring route consumer inventory；
- 现有 9 个相关 Jest suites、50 个 tests 全部通过；
- stable Chan lifecycle 与 Strategy runtime ownership 对照。

### 尚未满足的实施门禁

- 现有 fixtures 还不是完整 end-to-end full-output fingerprint；
- full-output fingerprint 还需纳入非连续 K ID、唯一端点解析和宽笔 position-distance 回归场景；
- `chan-api` K read adapter、`/v1/indicators/k` 和 Nest module 具体落位未确认；
- output 字段与 error/numeric/mutation/version contract 未确认。

以上门禁完成前不得移动 source files。
