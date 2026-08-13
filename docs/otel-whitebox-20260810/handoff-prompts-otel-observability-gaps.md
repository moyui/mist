# 交接提示词 — OTel 可观测性补强（O2b 埋点 + O3 日志平台）

> 来源：2026-08-10 主线程 TDX 排查复盘（上午 TDX no_snapshot 谜团定位过程暴露的观测缺口）。
> **本线程职责：按缺口清单创建并实施 O2b（指标/span 埋点补强）与 O3（日志平台）两个 OpenSpec change。**
> 先读：`otel-whitebox-20260810/handoff-prompts-otel-o1-o2a-20260810.md`（OTel 已知坑 §三）、
> `otel-whitebox-20260810/evidence-2026-08-10-o1-o2a-live-test-passed.md`、`evidence-2026-08-10-qmt-verification.md`。
> **三步工作流**：先建 spec（proposal/design/tasks，本提示词 §二为素材）→ 逐条与 owner 确认 →
> 再写实施计划 → 落地。不得跳过确认。

---

## 一、背景：今天排查暴露了什么

TDX 上午"全部桶 no_snapshot 丢弃"谜团的定位过程（最终根因：终端 11:29:30 才复活、恰好卡在
上午收盘，非后端 bug；下午开盘即正常封存）暴露了 OTel 观测的 6 处不好用。若 skip/discard 有
source label，5 分钟即可归因，无需绕 backend 日志 + 下午实测的弯路。

## 二、缺口清单（O2b/O3 的 spec 素材）

### 指标层（O2b 埋点补强，mist 仓）

| # | 缺口 | 今天的表现 | 建议 |
|---|---|---|---|
| 1 | **`mist_candle_skip_total` 无 source label** | `out_of_session=1170` 混两源（午休帧 TDX+QMT 都在 skip），无法归因 | 加 `source` label（低基数）；若可行加 `securityId/symbol`（仍低基数，确认基数上界） |
| 2 | **`mist_candle_discard_total` 无 source label** | `no_snapshot=174` 靠 finalize 数对比才推断出=TDX | 同 1：加 `source` |
| 3 | **due.finalize span 缺判定结果** | 只带 `bucketstartms`，不知道 sealed/discarded(+reason) | span attributes：`verdict`（sealed/discarded）、`discardReason`；vwap 校验结果（`vwapOutOfRange` bool） |
| 4 | **snapshot.process span 缺 bucket 解析结果** | skip/accept 原因在 events 里但 OO 查不到（见 #5） | 关键判断点提升为 span attribute：`skippedReason`、`bucketStartMs`、`ingestGated` |
| 5 | **span events 在 OO 搜不到** | `skipped`/`ingest_gated` events 查询恒 `[]`/`null`，排查被迫转 backend 日志 | 先验证 OO 是否索引 span events；不行则按 #4 提升为 attribute 或结构化日志 |

### 工具/平台层（O3 日志平台，mist-deploy 仓 + mist 仓）

| # | 缺口 | 今天的表现 | 建议 |
|---|---|---|---|
| 6 | **backend 日志无读取工具** | 只能临时把 `docker logs` grep 塞进 closed-hash workflow | 标准 backend-logs 工具 workflow（docker logs --tail + grep）；更根本：日志进 OO |
| 7 | **日志 tail 容量小** | `--tail 2000` 只覆盖 ~50 分钟，上午 skip 记录查不到 | O3：backend 结构化日志（pino）经 OTLP logs 进 OpenObserve，任意时间回溯 |
| 8 | **指标历史查询不可靠** | 上午时段 skip/discard 历史值查不到（OO metrics 搜索窗口行为不直观） | 日志留存后靠日志回溯；或关键指标快照落盘 |
| 9 | **时间换算易错** | 排查中 epoch/时区换算错两次 | 工具脚本统一 UTC；OO UI 时间选择器缓解 |

### 已补（无需再做）
- ✅ `read-windows-realtime-candle-closed` workflow（mist-deploy `dbbd86e`）：closed hash 读取 +
  vwap 一致性检查 + backend 日志 grep（缺口 #6 的临时版，正式工具见 O3）。

## 三、目标 change（按三步流程建 spec）

1. **O2b `instrument-realtime-observability-attribution`**（暂名，mist 仓）：
   - tasks：skip/discard 加 source label（缺口 1/2）；finalize span verdict/discardReason/vwap
     attributes（3）；snapshot span skippedReason/bucketStartMs attributes（4）；events→attribute
     迁移或验证 OO 支持（5）；对应 candle-metrics.spec / aggregator spec / contract tests 更新；
     低基数 label 断言（reason/source 枚举有界）。
   - 注意：与 `handoff-prompts-backtest-otel-metrics.md` 线程并行（该线程加 backtest 指标，
     不碰 candle-metrics；O2b 动 candle-metrics/aggregator/product——文件不重叠但
     registerXxxMetrics 模式一致，实现时互相避让）。
2. **O3 `instrument-otel-logging-platform`**（暂名，mist + mist-deploy 仓）：
   - tasks：backend pino 结构化日志（OTel logs exporter 或 OO OTLP logs 接入）；datasource
     Python 日志同入 OO；部署侧 openobserve 接收 logs 确认；backend-logs 标准工具 workflow；
     历史回溯验证（任意时间查 backend 日志）。
   - 先验证 OO 的 logs 能力（v1 是否支持 OTLP logs；不支持则评估 OO 其他摄入路径）。

## 四、约束与参考

- **零业务逻辑改动**：埋点补强=纯观测（读值/加 attribute），与 O1 一致。
- **低基数**：source/reason/verdict 枚举有界；`_total` 后缀合规；label 组合基数上界写进 spec。
- **OTel 已知坑**：preload（bundle `-r ./otel-preload.js`）、`@opentelemetry/api` webpack
  external、startActiveSpan 2.x 手动 end（withCandleSpan helper）、pino 打包进 bundle 无法被
  instrumentation-pino patch（用 pinoTraceMixin）、指标注册在 initTelemetry 后且幂等。
- **OO 查询**：`POST /api/default/_search?type=traces|metrics|logs`，微秒时间窗口，字段在 hit
  顶层；生产凭据 root@mist.local:Mist@2026!Observe（mock 是 root@example.com:Complexpass#123）。
- **分支**：mist `feat/otel-observability-attribution`（O2b）从 master 建 worktree；O3 涉及
  mist-deploy 时 deploy 侧分支或直接 master（按部署惯例，CI 门禁 test-*.ps1 注意）。
- **验证**：typecheck/lint/test:ci（带 --forceExit）/validate；mock 环境（tools/mock-env）起栈
  验证新 label 在 OO 可见（mock 查询方式见 O1 handoff §五）。
- 相关证据：`otel-whitebox-20260810/evidence-2026-08-10-o1-o2a-live-test-passed.md`（O1 模式）、
  `evidence-2026-08-10-qmt-verification.md`（OO 查询样例）。
