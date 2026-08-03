## 1. 范围与契约门禁

- [x] 1.1 盘点当前 Trend、K merge、Fenxing、Bi、Channel、pure helpers/enums/types 和 tests。
- [x] 1.2 确认本 change 只交付 `libs/chancore`；现有 API、K reader、IndicatorModule、route owner、gateway
  与跨 app import 清理均不属于本 change。
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
- [ ] 1.9 在 source move 前复核全部接受的 contract 已写入 design/specs，且不存在 API/K-reader/deploy
  实施项。

## 2. Pure ChanCore

- [ ] 2.1 建立 `libs/chancore`、project config、`@app/chancore` alias 和 pure-boundary contract tests。
- [ ] 2.2 迁移 Trend、K merge、Fenxing、Bi Phase A/Phase B、Channel Phase A/Phase B、
  `bi-range`、`span-merge` 与实际使用的 enums/types；不得保留第二份算法或恢复 K ID 距离算术。
- [ ] 2.3 将 DTO/VO/Entity 输入替换为 readonly library-owned types；完整 `ChanK` 保持 OHLCVA、Date 和
  exact-decimal/null。
- [ ] 2.4 实现 facade-private `assertChanKSeries()` 与 public `ChanInputError/ChanInvariantError`；覆盖
  duplicate identity/time、跨 symbol、invalid Date、NaN/Infinity、`high < low`、MySQL fixed-scale
  decimal、非法 exponent/number/scale，并证明不排序、不转换、不补值。
- [ ] 2.5 实现最小 public barrel 和 readonly `ChanCore.algorithmVersion=1`；拒绝导出 internal
  services/helpers/Nest module/analyze，禁止把 version 重复放入每个结果、HTTP、DB 或 config。
- [ ] 2.6 覆盖 equal-center、strict Fenxing、first-wins、Bi non-strict progression、`zg === zd`、相邻
  representable number、Date/identity 精确比较。
- [ ] 2.7 以 frozen input 和 before/after fingerprint 证明四个 facade 不 mutation；允许嵌套结果共享
  readonly `ChanK`，tests 不断言引用 identity。
- [ ] 2.8 运行旧实现与 ChanCore full-output differential，固定 algorithmVersion、结构、值、枚举、顺序、
  null、Date 和已归档宽笔行为。

## 3. 现有调用兼容

- [ ] 3.1 现有 Chan algorithm services 改为调用 `@app/chancore` 的薄 wrapper，或由现有调用点直接调用
  library；不得复制核心算法。
- [ ] 3.2 wrapper 只做现有调用形状所需的输入/输出映射，不能 mutation core output 或改变既有 API
  response；原 API 的 Controller/DTO/VO/OpenAPI/K reader/module/route ownership 保持原样。
- [ ] 3.3 证明 `apps/chan`、`apps/mist`、`/v1/chan/*`、`/v1/indicators/*`、gateway、frontend 和 skills
  contract 没有因本 change 发生变化。
- [ ] 3.4 证明当前 Backtest、Realtime、Signal/Alert 和 Strategy evaluator 没有被增加 ChanCore
  prerequisite；未来 adoption 由独立 owning change 负责。

## 4. 验证与交付

- [ ] 4.1 运行 Chan 定向、full-output differential、public barrel、pure-boundary 和 legacy API regression
  tests。
- [ ] 4.2 运行全量 lint、typecheck、test、build 和 `ci:contracts`。
- [ ] 4.3 检索 `libs/chancore` 的 TypeORM/Redis/HTTP/Nest/env/persistence imports 和旧算法重复实现。
- [ ] 4.4 执行 strict OpenSpec、`git diff --check`，记录未来 Chan strategy adoption、现有 API cleanup、
  公共 Indicator/K API 重构为 residual work。
- [ ] 4.5 向项目负责人审阅 differential 与 validation evidence 后才归档。
