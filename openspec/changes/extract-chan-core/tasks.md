## 1. 现状与契约评审

- [x] 1.1 盘点 Chan service、controller、DTO/VO、无 persistence 边界、cross-app import 和 tests。
- [x] 1.2 盘点 `chan-api`、`mist-backend`、gateway、frontend、skills、deploy 和 monitoring 的现有
  route/consumer 拓扑。
- [ ] 1.3 建立完整 raw K → merged K → Fenxing/Bi/Channel characterization fixture 与 full-output
  fingerprint；现有局部 Phase A/Phase B tests 继续保留。
- [ ] 1.4 向项目负责人评审 `/v1/chan/*` 长期唯一 owner、当前双入口和独立 route migration 范围。
- [ ] 1.5 向项目负责人评审 `chan-api` TypeORM K read adapter、`/v1/indicators/k` 兼容链路和
  Controller/VO/Nest module 落位。
- [ ] 1.6 向项目负责人逐项评审 pure Chan library 名称、public exports、最小 input/output、空输入、
  invalid-input、numeric comparison、mutation 和算法版本。
- [ ] 1.7 将全部接受的 contract 写回 design/specs 后，才开始移动源文件。

## 2. Pure ChanCore

- [ ] 2.1 建立 pure Chan library 和无 TypeORM/Redis/HTTP/Nest/env/persistence contract tests。
- [ ] 2.2 迁移 K merge、Trend、Fenxing、Bi Phase A/Phase B、Channel Phase A/Phase B 与纯 helpers，
  保持已批准的输入输出和算法语义。
- [ ] 2.3 用 library-owned types 替代 DTO/VO/Entity 输入，adapter 显式完成双向映射。
- [ ] 2.4 用 full-output differential fixtures 证明结构、枚举、顺序、日期、数值与 mutation contract。

## 3. Application Adapters

- [ ] 3.1 按已批准 owner 重接 Chan HTTP controller、TypeORM K read adapter、VO/OpenAPI 和错误映射。
- [ ] 3.2 删除 `apps/chan → apps/mist` 业务源码 import 及 transport guard 中的精确 legacy allowlist。
- [ ] 3.3 固定所有保留 `/v1/chan/*` 与 `/v1/indicators/k` 路由的 runtime owner 和 compatibility tests。
- [ ] 3.4 证明 Strategy、Backtest 和 Realtime 不导入 ChanCore 或公共 Indicator HTTP 实现。

## 4. 验证与交付

- [ ] 4.1 运行 Chan 定向/differential/API/OpenAPI tests 与 app import guards。
- [ ] 4.2 运行全量 lint、typecheck、test、build 和 `ci:contracts`。
- [ ] 4.3 检索 pure library 的 TypeORM/Redis/HTTP/Nest/env imports 与退役 app-to-app path。
- [ ] 4.4 执行 strict OpenSpec、`git diff --check`，记录路由迁移与公共 Indicator 重构 residual work。
- [ ] 4.5 向项目负责人审阅 differential、route ownership 和 validation evidence 后才归档。
