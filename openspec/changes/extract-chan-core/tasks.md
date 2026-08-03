## 1. 现状与契约评审

- [x] 1.1 盘点 Chan service、controller、DTO/VO、无 persistence 边界、cross-app import 和 tests。
- [x] 1.2 盘点 `chan-api`、`mist-backend`、gateway、frontend、skills、deploy 和 monitoring 的现有
  route/consumer 拓扑。
- [ ] 1.3 建立完整 raw K → merged K → Fenxing/Bi/Channel characterization fixture 与 full-output
  fingerprint；现有局部 Phase A/Phase B tests 继续保留，并纳入已归档
  `fix-chan-wide-bi-distance` 的非连续 K ID、唯一端点解析和 position-distance 行为。
- [x] 1.4 确认独立部署的 `chan-api` 是 `/v1/chan/*` 长期唯一 owner；本 change 保留
  `mist-backend` 当前兼容路由，后续独立 route migration 负责 consumer audit 与删除。
- [ ] 1.5 向项目负责人评审 `chan-api` TypeORM K read adapter、`/v1/indicators/k` 兼容链路和
  Controller/VO/Nest module 落位。
- [x] 1.6 确认 pure library 固定为 `libs/chancore`、Nest project `chancore`、import
  `@app/chancore`；Trend/K merge/Fenxing/Bi/Channel 与纯 helpers/enums/types 进入 library，
  Controller/DTO/VO/K read 留在 application adapter。
- [x] 1.7 确认 public barrel 只导出无状态 `ChanCore.mergeK/findFenxings/createBi/createChannels` 及
  签名所需 types/enums；内部 services/helpers/Nest module 不导出，不新增 speculative `analyze()`。
- [x] 1.8 确认 `ChanK` 完整输入为 `id/symbol/time/open/high/low/close/volume/amount`；量额是
  canonical decimal string/null，现有算法不启用 MACD/力度等新能力。
- [x] 1.9 向项目负责人评审各 ChanCore 输出类型和现有 HTTP VO 恢复规则。
  - [x] 1.9.1 确认 `ChanMergedK` 保留完整时间、算法 high/low、trend、count、IDs 和 `ChanK[]`；
    adapter 恢复现有 `highest/lowest` 与 K VO 外观。
  - [x] 1.9.2 确认 `ChanFenxing` 保留三组原始 K IDs、序列位置、极值 K identity、type 和
    `high/low`；adapter 恢复现有 `highest/lowest`。
  - [x] 1.9.3 确认 `ChanBi` 保留完整时间、范围、type/status、origin evidence、nullable Fenxing，
    并保留 Bi Phase A/Phase B。
  - [x] 1.9.4 确认 `ChanChannel` 保留完整 bis、zone/extreme、enum/status/trend、真实 K 与 display
    identities，并保留 Channel Phase A/Phase B；迁移时修正 ID 被误注释为索引的问题。
- [ ] 1.10 向项目负责人逐项评审空输入、invalid-input、numeric comparison、mutation 和算法版本。
  - [x] 1.10.1 确认四个 core facade 对空 K 返回合法零结果；不足数据返回自然空结果或未完成笔；
    `/v1/chan/channel` 不再把内部空 Bi 暴露成 400。
  - [x] 1.10.2 确认 facade 单一 validator、序列/identity/OHLC/decimal contract、无自动修复、纯
    `ChanInputError/ChanInvariantError` 和 HTTP 内部错误传播边界。
  - [ ] 1.10.3 确认 numeric comparison、mutation 和算法版本。
- [ ] 1.11 将全部接受的 contract 写回 design/specs 后，才开始移动源文件。

## 2. Pure ChanCore

- [ ] 2.1 建立 `libs/chancore`、Nest project `chancore`、`@app/chancore` alias 和无
  TypeORM/Redis/HTTP/Nest/env/persistence contract tests。
- [ ] 2.2 迁移 K merge、Trend、Fenxing、Bi Phase A/Phase B、Channel Phase A/Phase B 与纯 helpers，
  保持已批准的输入输出和算法语义，且不得把宽笔距离恢复为数据库 K ID 算术。
- [ ] 2.3 用 library-owned types 替代 DTO/VO/Entity 输入，adapter 显式完成双向映射。
- [ ] 2.3.1 修正 Channel core/HTTP 类型中 `startId/endId` 的注释：二者是原始 K identity，不是索引；
  保持字段名和 HTTP wire contract 不变。
- [ ] 2.4 建立最小 public barrel；contract test 拒绝导出内部算法实现、helpers、Nest module 或
  `analyze()`。
- [ ] 2.4.1 实现 facade-private `assertChanKSeries()` 和 public `ChanInputError/ChanInvariantError`；
  覆盖 duplicate ID/time、跨 symbol、invalid Date、NaN/Infinity、`high < low`、MySQL fixed-scale
  decimal、非法 exponent/number/scale，并证明不排序、不转换、不补值。
- [ ] 2.5 为完整 `ChanK` 建立 adapter mapping 与 decimal-string/null preservation tests；证明当前算法
  不因新增可用字段改变结果。
- [ ] 2.6 用 full-output differential fixtures 证明结构、枚举、顺序、日期、数值与 mutation contract。

## 3. Application Adapters

- [ ] 3.1 按已批准 owner 重接 Chan HTTP controller、TypeORM K read adapter、VO/OpenAPI 和错误映射。
- [ ] 3.1.1 修正 `/v1/chan/channel` 空历史/不足数据行为：返回 HTTP 200 与空两阶段结果，不再抛出
  `BI_ARRAY_EMPTY`；其他 HTTP contract 保持不变。
- [ ] 3.2 删除 `apps/chan → apps/mist` 业务源码 import 及 transport guard 中的精确 legacy allowlist。
- [ ] 3.3 固定所有保留 `/v1/chan/*` 与 `/v1/indicators/k` 路由的 runtime owner 和 compatibility tests。
- [ ] 3.4 证明 Strategy、Backtest 和 Realtime 不导入 ChanCore 或公共 Indicator HTTP 实现。

## 4. 验证与交付

- [ ] 4.1 运行 Chan 定向/differential/API/OpenAPI tests 与 app import guards。
- [ ] 4.2 运行全量 lint、typecheck、test、build 和 `ci:contracts`。
- [ ] 4.3 检索 pure library 的 TypeORM/Redis/HTTP/Nest/env imports 与退役 app-to-app path。
- [ ] 4.4 执行 strict OpenSpec、`git diff --check`，记录路由迁移与公共 Indicator 重构 residual work。
- [ ] 4.5 向项目负责人审阅 differential、route ownership 和 validation evidence 后才归档。
