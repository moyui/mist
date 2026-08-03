## 1. 范围与契约门禁

- [x] 1.1 盘点当前 Trend、K merge、Fenxing、Bi、Channel、pure helpers/enums/types 和 tests。
- [x] 1.2 确认本 change 交付 `libs/chancore`，并按后续批准同步 K/Chan HTTP `high/low` 输出；K reader、
  IndicatorModule、route owner、gateway 与跨 app import 清理均不属于本 change。
- [x] 1.3 确认 pure library 为 `libs/chancore`、Nest project `chancore`、import `@app/chancore`。
- [x] 1.4 确认 public facade 只含 `mergeK/findFenxings/createBi/createChannels`、签名 types/enums、
  `ChanInputError/ChanInvariantError` 和 `algorithmVersion=1`，不含 internal helpers/Nest module/analyze。
- [x] 1.5 确认完整 `ChanK` 输入及 MergedK/Fenxing/Bi/Channel/Phase A/Phase B 输出。
- [x] 1.6 确认 empty result、invalid input、number comparison、readonly mutation 和 algorithm-version
  contract。
- [x] 1.7 确认当前 Backtest/Realtime V1 不开放 `chan.*`，本 change 只提供未来可直接调用或薄封装的
  core，不修改相关 runtime/spec prerequisite。
- [x] 1.8 建立完整 raw K → merged K → Fenxing/Bi/Channel characterization fixture 与 full-output
  fingerprint；纳入已归档 `fix-chan-wide-bi-distance` 的非连续 K ID、唯一端点和 position-distance。
- [x] 1.9 在 source move 前复核全部 core contract 已写入 design/specs；后续批准的 HTTP 字段迁移单独
  进入 3.5–3.8，仍不存在 K-reader/deploy 实施项。

## 2. Pure ChanCore

- [x] 2.1 建立 `libs/chancore`、project config、`@app/chancore` alias 和 pure-boundary contract tests。
- [x] 2.2 迁移 Trend、K merge、Fenxing、Bi Phase A/Phase B、Channel Phase A/Phase B、
  `bi-range`、`span-merge` 与实际使用的 enums/types；不得保留第二份算法或恢复 K ID 距离算术。
- [x] 2.3 将 DTO/VO/Entity 输入替换为 readonly library-owned types；完整 `ChanK` 保持 OHLCVA、Date 和
  exact-decimal/null。
- [x] 2.4 实现 facade-private `assertChanKSeries()` 与 public `ChanInputError/ChanInvariantError`；覆盖
  duplicate identity/time、跨 symbol、invalid Date、NaN/Infinity、`high < low`、MySQL fixed-scale
  decimal、非法 exponent/number/scale，并证明不排序、不转换、不补值。
- [x] 2.5 实现最小 public barrel 和 readonly `ChanCore.algorithmVersion=1`；拒绝导出 internal
  services/helpers/Nest module/analyze，禁止把 version 重复放入每个结果、HTTP、DB 或 config。
- [x] 2.6 覆盖 equal-center、strict Fenxing、first-wins、Bi non-strict progression、`zg === zd`、相邻
  representable number、Date/identity 精确比较。
- [x] 2.7 以 frozen input 和 before/after fingerprint 证明四个 facade 不 mutation；允许嵌套结果共享
  readonly `ChanK`，tests 不断言引用 identity。
- [x] 2.8 运行旧实现与 ChanCore full-output differential，固定 algorithmVersion、结构、值、枚举、顺序、
  null、Date 和已归档宽笔行为。

## 3. 现有调用兼容

- [x] 3.1 现有 Chan algorithm services 改为调用 `@app/chancore` 的薄 wrapper，或由现有调用点直接调用
  library；不得复制核心算法。
- [x] 3.2 wrapper 只做现有调用形状所需的输入/输出映射，不能 mutation core output；该阶段先保持原
  API response，后续批准的 breaking field migration 由 3.5–3.8 持有。
- [x] 3.3 证明 core source move 本身没有改变 `apps/chan`、`apps/mist`、gateway、frontend 和 skills；
  后续 HTTP field migration 的消费者影响按 3.8 单独记录。
- [x] 3.4 证明当前 Backtest、Realtime、Signal/Alert 和 Strategy evaluator 没有被增加 ChanCore
  prerequisite；未来 adoption 由独立 owning change 负责。
- [x] 3.5 将 `/v1/indicators/k` 与四个 `/v1/chan/*` response VO、mapper 和递归嵌套输出统一为
  `high/low`，删除 `highest/lowest` 且不保留 alias。
- [x] 3.6 修正 merge-k/fenxing/bi/channel 的 OpenAPI response type，并增加字段存在与旧字段缺失的
  contract tests。
- [x] 3.7 证明数据库 entity/column、migration、K reader、Chan algorithm output value 与
  `algorithmVersion` 均未改变。
- [x] 3.8 盘点 `mist-fe`、`mist-skills` 消费者并记录 matching-version 发布门禁；在 3.9/3.10 完成前
  不得部署 breaking backend contract。
- [x] 3.9 在独立 `mist-fe` branch/worktree 中将 API types、KPanel、live/snapshot consumer、fixtures、
  tests 和文档递归迁移到 `high/low`；不得加入旧字段 fallback，fixture 只改字段名不改值与顺序。
- [x] 3.10 在独立 `mist-skills` branch/worktree 中迁移 K/Chan agent-facing 文档、示例和 contract tests；
  共享 client 继续原样返回 backend data，不增加 shape alias。

## 4. 验证与交付

- [x] 4.1 运行 Chan 定向、full-output differential、public barrel、pure-boundary 和 source-move API
  regression tests；HTTP 字段迁移后按 3.6/4.2 重跑 canonical contract regression。
- [x] 4.2 在 HTTP 字段迁移后重跑全量 lint、typecheck、test、build 和 `ci:contracts`。
- [x] 4.3 检索 `libs/chancore` 的 TypeORM/Redis/HTTP/Nest/env/persistence imports 和旧算法重复实现。
- [x] 4.4 在 HTTP 字段迁移后重跑 strict OpenSpec、`git diff --check`，记录未来 Chan strategy
  adoption、route/app cleanup、公共 Indicator/K API 重构为 residual work。
- [x] 4.5 运行 `mist-fe` lint/typecheck/full tests/production build、`mist-skills` ruff/pyright/black/pytest，
  执行三仓旧字段检索、`git diff --check` 与 backend `ci:contracts` matching-worktree 验证。
- [ ] 4.6 向项目负责人审阅三仓 differential 与 validation evidence 后才归档。
