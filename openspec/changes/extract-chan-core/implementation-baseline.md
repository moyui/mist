## 实施基线

记录时间：2026-08-03

### 最终范围

本 change 取代尚未实施的 `extract-market-analysis-kernels`，只交付 pure `libs/chancore`：

- 不把 Chan 与 Indicator/Strategy calculation 合并成通用 analysis base；
- 不重构现有 `chan-api`、`mist-backend`、Controller、DTO/VO、OpenAPI、K reader 或 route ownership；
- 不处理 `/v1/indicators/*`、gateway、frontend、skills、deploy 或跨 app import；
- 现有调用若接入新 core，只保留不改变公共行为的薄 wrapper；
- 为 Backtest、Realtime、Signal/Alert 等后续 owning change 提供直接 library 调用边界，但当前 V1 不
  开放 `chan.*`，不新增 prerequisite。

### 仓库与工作区

- 仓库：`mist`
- 分支：`feat/extract-chan-core`
- worktree：`mist/.worktrees/extract-chan-core`
- 初始审计基线：`master@fe56c6863cc498acbad0a6803da16c2615bb6997`
- 当前实施基线：`master@3a07d4b725dec2c288058505c82959224281d2a3`
- 已同步前置：归档 change `2026-08-03-fix-chan-wide-bi-distance`
- 当前状态：未移动应用源码、未新增 migration

### pure calculation 影响链

```text
caller-owned ordered ChanK[]
  -> @app/chancore public facade
  -> private validation
  -> Trend / K merge / Fenxing / Bi / Channel pure calculation
  -> readonly algorithm-owned result
  -> direct consumer or consumer-owned thin wrapper
```

core 不拥有 producer transport、K retrieval、HTTP/RPC wire、database/Redis persistence、deployment 或
monitoring。上述边界由未来采用 ChanCore 的 Backtest/Realtime/Signal/Alert owning change 自己定义。

### 已确认 contract

- library：`libs/chancore`；project `chancore`；import `@app/chancore`。
- facade：`mergeK/findFenxings/createBi/createChannels`；不增加 `analyze()`。
- public barrel：facade、签名所需 types/enums、`ChanInputError/ChanInvariantError`、
  `algorithmVersion=1`；不导出 internals 或 Nest module。
- input：完整 readonly `ChanK(id/symbol/time/open/high/low/close/volume/amount)`；量额为 exact decimal
  string/null。
- outputs：完整 MergedK、Fenxing、Bi/Phase A/Phase B、Channel/Phase A/Phase B；使用标准
  `high/low`，现有 wrapper 若需要可恢复 `highest/lowest`。
- empty：四个 facade 对空 K 返回自然零结果；不足数据返回自然空集合或未完成笔。
- validation：单 symbol、time 严格递增、identity 唯一、finite OHLC、`high >= low`、合法
  DECIMAL(36,8) string/null；不排序、转换、过滤、去重或填充。
- errors：precondition 使用 `ChanInputError`，算法不变量使用 `ChanInvariantError`；二者不含 HTTP、Nest
  或 persistence 语义。
- numeric：保留现有 strict/non-strict JavaScript number comparison、midpoint 公式和 first-wins；不加
  epsilon/rounding/Decimal；`zg === zd` 不成立中枢。
- mutation：readonly value contract；不 mutation caller，不保留状态/cache，不 runtime freeze/deep-clone；
  允许共享 readonly `ChanK`，引用 identity 不属于公共契约。
- version：正整数 1；算法语义变化必须 version bump + full-output fingerprint，纯 source move/refactor
  不 bump；不进入 HTTP/DB/config。
- 算法基线：宽笔按候选 `originData` 序列位置计数，端点缺失/重复为 invariant failure，不使用数据库
  ID 差。

### 已完成审计

- 当前算法 service/helper/type/test inventory；
- 完整 input/output、empty/error/numeric/mutation/version 逐项评审；
- active Strategy/Backtest/Realtime specs 对照：当前 V1 明确不开放 `chan.*`；
- 完整 45 根 raw K characterization：38 merged K、15 Fenxing、Bi Phase A/Phase B 各 9、Channel
  Phase A/Phase B 各 1；fixture 使用唯一、非连续且局部非单调 ID，并逐笔证明有效宽笔端点唯一且按
  position distance 判断；
- `algorithmVersion=1 + input + complete outputs` SHA-256 fingerprint：
  `7a24563a1d419c87cc151cfcd83ce42732fe59b6fc535de2d818699994964312`；
- strict OpenSpec validation 持续通过。

### 尚未满足的实施门禁

- source move 后的新 ChanCore 尚未与已冻结 full-output fingerprint 做 differential；
- equal-boundary、readonly 和 public `algorithmVersion` 的新 core 证据尚未实施；
- pure boundary/public barrel tests 尚未实施；
- 旧算法尚未移动，现有 wrapper 尚未接入 `@app/chancore`。

以上门禁完成前不得宣称 extraction 完成。
