# Spec Delta: web-visualization（双请求对齐修复）

> 旧 Change `integrate-lightweight-charts-web-visualization` 的 `specs/web-visualization/spec.md` 目前为非标结构（`## 场景 1/2/3`），未按 `Requirement/Scenario` 规范化。归档时 CLI 要求 `MODIFIED` 必须携带全量场景，直接文本覆盖会 `abort`。本 delta 先以 `ADDED` 固化双请求不变量，旧 Spec 的规范化与旧场景迁移在归档前手工合入 live spec（`--skip-specs` 后手合），避免 CLI 结构校验失败。

## ADDED Requirements

### Requirement: 双请求 K 线与可视化指令同参同源

`mist-fe` 的 `KLineLivePage` 与 `BacktestWorkspace` 采用**双请求并发**：`fetchK`（`POST /v1/indicators/k`）与 `fetchVisualCommands`（`GET /v1/visual/commands`）以**同一 query** `{code, period, source, startDate, endDate}` 并发请求，后端两端点必须以**同一查询真源** `IndicatorService.findKData` 提供数据，且 `WHERE`/`ORDER BY` 语义等价。

#### Scenario: 同参同源查询
- **WHEN** 前端以同一 query 并发请求 `POST /v1/indicators/k` 与 `GET /v1/visual/commands`
- **THEN** `VisualController` 与 `IndicatorController` 对 `startDate/endDate` 的 `TimezoneService.parseDateString` 解析必须一致（`YYYY-MM-DD` → `00:00:00+08:00` 等价，`YYYY-MM-DD HH:MM:SS` → 对应 `+08:00`）
- **AND** 两端点传入 `IndicatorService.findKData` 的 `code/period/source/Between(startDate,endDate)` 必须等价，且 `order: {timestamp: ASC}` 一致

#### Scenario: 纯时间窗口（移除 count 裁剪）
- **WHEN** 前端请求 `GET /v1/visual/commands` 未显式传 `count`（或传任意 `count`）
- **THEN** `VisualController` 不得执行默认 `count=500` 的 `slice(-count)` 尾部裁剪；查询以**时间窗口**为唯一真源，返回窗口内全部可投射 K
- **AND** 如需限流/分页，需显式引入新参数并在 Spec 中另行约束，不在本变更以默认裁剪实现

### Requirement: 价格投射前后端一致且可观测

`K` 端点与 `Visual` 端点对 MySQL `DECIMAL` 的校验/投射策略必须一致；任何不可投射 bar 的过滤必须可观测，不得一端静默丢弃一端透传。

#### Scenario: 不可投射 bar 可观测
- **WHEN** `projectToChanK` 经 `KPriceProjector` 对某根 K 的 `open/high/low/close` 校验失败
- **THEN** 该 bar 的丢弃必须可观测（日志/指标/契约字段三选一，具体由实施计划选定），且 `totalKlines` 与实际 `chanKlines` 的差值不得静默
- **AND** `IndicatorController.k` 与 `VisualController` 对 `open/high/low/close` 的容错策略必须一致（同以 `KPriceProjector` 为准或同以宽松策略为准，不允许分叉）

### Requirement: 可视化索引映射零伪造

`ChanVisualAdapter` 将 Bi/Duan/Channel/Zhongshu 的时间/ID 映射到 K 索引时，未命中不得回退到 0，且 VO 字段必须与 `visual-command.types.ts` 单一来源对齐。

#### Scenario: 未命中索引丢弃
- **WHEN** `getKIndex(time, id)` 在 `timeToIndex/idToIndex` 均未命中
- **THEN** 必须返回 `null` 并丢弃该 `VisualCommand`，禁止 `return 0` 导致钉在首根 K 的伪造对齐

#### Scenario: VO 字段对齐
- **WHEN** `VisualCommandVo` 序列化 `BandVisualCommand`/`LineVisualCommand`/`TextVisualCommand`
- **THEN** 必须与 `libs/visual-command/src/visual-command.types.ts` 的 `LineVisualCommand`/`BandVisualCommand` 字段集对齐，包含 `fromIndex/toIndex/fromTime/toTime/gg/dd/fill/width/style/position` 等缺失字段，不得选择性省略导致前端 `fromTime/toTime` 读取为 `undefined`

## 归档说明（旧 Spec 场景迁移）

`integrate-lightweight-charts-web-visualization` 的原有 `## 场景 1/2/3` 将在归档时手工规范化为以下 Requirement 并合入 live spec，本 Change 不以 `MODIFIED` 覆盖旧文件以避免 CLI 校验失败：
- 场景 1 `单一接口拉取` → 修正为 `双请求同参并发（fetchK + fetchVisualCommands）` 的 `Requirement: Web Visualization Shall Render Via Dual Requests`
- 场景 2 `零坐标错位` → 保留并补充上述 `同参同源/零伪造` 不变量作为验收门禁
- 场景 3 `回测复盘兼容` → 保留，补充 `TradingViewChart {k, commands}` 的合并渲染契约

> 归档命令：`openspec archive fix-dual-request-visual-alignment --skip-specs` 后手工将本 delta 与旧 Spec 场景合入 `openspec/specs/web-visualization/spec.md`（若届时已提升为 live），或保留在 `changes/` 归档目录作为审计轨迹。
