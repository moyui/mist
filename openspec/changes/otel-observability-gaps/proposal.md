# Proposal: otel-observability-gaps

## Why

2026-08-10 交易时段排查"TDX 上午 no_snapshot"归因时，现有 OTel 埋点（O1）暴露出一批
**可操作性问题**：最终定位靠新增日志 grep + 下午开盘实测绕了大圈，而 skip/discard 计数
若有 source 归因 5 分钟就能定位。问题分三层：

**指标层（埋点补强）**：
1. `mist_candle_skip_total` / `mist_candle_discard_total` **无 source label**——上午
   `out_of_session=1170` 混了两源（TDX+QMT 午休帧都在 skip），无法归因，差点误判成 TDX bug。
2. `candle.due.finalize` span **缺判定结果**——只有 `bucketStartMs`，不知道这桶是 sealed 还是
   discarded（+reason）。（vwap 一致性检查在 deploy workflow 层提供，不属 span。）
3. `candle.snapshot.process` span **缺 bucket 解析结果**——每帧 skip/accept 的原因在 span
   events 里，但 OO 查询不到，排查 skip 原因被迫转 backend 日志。

**日志层（可检索性）**：
4. **span events 在 OO 搜不到**——`skipped`/`ingest_gated` events 查询返回空/null。
5. **backend 日志没有读取工具且不可回溯**——只能临时 `docker logs --tail 2000` grep（约 50 分钟
   容量），上午的 skip 记录查不到；没有按 trace_id 聚合检索的入口。

**工具层（体验）**：
6. **指标历史查询不可靠**——上午时段 skip/discard 历史值查不到（OO metrics 搜索窗口行为不直观）。
7. **时间换算易错**——排查中 epoch/时区换算错两次，窗口算偏；项目已有时间约定
   （libs/timezone：内部 UTC、业务边界 Asia/Shanghai）未被工具遵守。

## What Changes

本 change = **埋点补强（指标层）+ 日志进 OO（可检索性）+ 工具约定 + 已补项登记**。

- **A. 指标层埋点补强**：
  - A1: `mist_candle_skip_total` / `mist_candle_discard_total` 增加 `source` label，
    并可带 `securityId`/`symbol`（低基数归因；修订 O1"symbol 不得作 label"的约束，
    仅限 skip/discard 两类计数）。
  - A2: `candle.due.finalize` span 增加 attributes：`verdict`（sealed/discarded）、
    `discardReason`。
  - A3: `candle.snapshot.process` span 关键判断点提升为 attribute：`bucketStartMs`、
    `skippedReason`（每帧 skip/accept 的原因，OO 可查询）；span events 保留。
- **B. 日志进 OO**：
  - B1: backend pino 日志经 OTLP 进入 OO（logs 流），与 spans 同 trace_id 检索、可任意时间回溯
    （解决 4/5/6 的根因——不依赖 docker logs tail）。
  - B2: 明确 OO 日志/指标查询方式文档化（窗口/聚合语义），脚本统一 UTC（引用 libs/timezone
    约定：内部 UTC、业务边界 Asia/Shanghai）。
- **C. 已补项登记**：`read-windows-realtime-candle-closed`（closed hash + vwap 检查 + backend
  日志 grep）已落地（实盘线程 08-10），登记 done；B1 落地后其日志 grep 部分可降级。

### 边界（不做）

- **不建 OO 告警规则**（G4/B4 盲区）——独立 O3 change，本 change 提供其输入（断流判定信号）。
- 不改动 `REALTIME_PRODUCTIZATION_MODE`（保持 off，B1 约束）。
- 不新增 OpenObserve 之外的监控组件（平台决策 08-09 已定：OO 一体化）。
- datasource 侧埋点不动（O2a 已含 source label；本次问题全在 backend skip/discard）。

## Capabilities

新建大 capability `mist-observability`，子 spec 归并（live specs 已建前两个）：
- `backend-candle-pipeline-observability`（live：O1 内容；本 change MODIFIED 低基数约束）
- `datasource-bridge-ingest-observability`（live：O2a 内容，本 change 不动）
- `candle-pipeline-attribution-gaps`（本 change ADDED：source/symbol 归因、判定结果、
  关键判断点 attribute）
- `backend-log-access`（本 change ADDED：日志进 OO、检索、时间约定、查询方式文档）

## Assumptions

- OO（Rust 版）logs 流可用且支持按 trace_id/时间回溯检索（B1 实施前先验证）。
- backend pino 日志进 OTLP 的实现（pino transport / LoggerProvider）不依赖 webpack patch
  （pino 在 bundle 内，instrumentation-pino 无效——沿用 pinoTraceMixin 思路，logs 侧带
  trace_id 由 transport 从活动 span 读取）。
