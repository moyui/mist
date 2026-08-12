# Tasks: otel-observability-gaps

> 状态约定：本 change 三层——A 指标层埋点补强、B 日志进 OO、C 已补项登记。
> spec 确认后写实施计划（代码级），再落地。

## 0. SDK 初始化切换官方 register（G0，remediate G1 提前）

- [x] 0.1 删 `otel-preload.js`；`libs/otel` 删 `initTelemetry`/`shutdownTelemetry`
      （保留 `pinoTraceMixin`）；6 处 main.ts 删 `initTelemetry(...)` 调用。
- [x] 0.2 启动命令换 target：Dockerfile CMD / deploy compose 3 处 + CI 门禁 /
      run-mock.sh NODE_OPTIONS → `-r @opentelemetry/auto-instrumentations-node/register`。
- [x] 0.3 `otel.spec.ts` 更新（删 initTelemetry 测试，保留 mixin 测试）。
- [x] 0.4 验证：mock 栈 backend 全链路（spans + 10 gauges + logs）通过。

## 1. 指标层埋点补强（A）

- [x] 1.1 `mist_candle_skip_total` / `mist_candle_discard_total` 增加 `source` +
      `securityId`/`symbol` label（D1-B）；skipTotals/discardTotals 按 source+securityId 汇总
      （aggregator per-instance 计数）。
- [x] 1.2 `candle.due.finalize` span attributes：`verdict`（sealed/discarded）、
      `discardReason`（discarded 时）、vwap 校验结果（通过/失败）。
- [x] 1.3 `candle.snapshot.process` span attributes：`bucketStartMs`、`skippedReason`
      （skip 时，reason 有界）、ingest gated 等关键判断点；events 保留。
- [x] 1.4 单测：reason/source 枚举有界；attributes 断言（sealed/discarded/skip 路径）；
      label 基数护栏测试（超阈值回退 source-only 或告警）。

## 2. 日志进 OO（B）

- [x] 2.1 验证 OO Rust 版 logs 流：OTLP logs 接收（/v1/logs）+ 检索（type=logs）可用；
      trace_id 顶层检索验证（c37fab 查询成功）。
- [x] 2.2 `pino` webpack external（instrumentation-pino RITM patch 前提，mock 实证 patch 成功）。
- [x] 2.3 日志走官方 instrumentation-pino（register 已含）→ LoggerProvider（env 默认 otlp）；
      **无 transport、无 pinoTraceMixin**（初版 transport+mixin 实测双发（cnt=2），改单一官方
      路径后单发——2026-08-11 二版修正）。
- [x] 2.4 部署：复用 OTEL_EXPORTER_OTLP_ENDPOINT（logs 派生 /v1/logs）无新 env；可配置项走
      OTel 标准 env（OTEL_BLRP_*）；日志流量/留存观察。

## 3. 查询方式与时间约定（B2）

- [x] 3.1 文档化 OO logs/metrics 查询方式（stream 名、窗口微秒、type 参数）。
- [x] 3.2 验证脚本时间约定统一 UTC（引用 libs/timezone 约定：内部 UTC、边界 Asia/Shanghai）。

## 4. 已补项登记（C）

- [x] 4.1 `read-windows-realtime-candle-closed`（closed hash + vwap + backend 日志 grep）
      登记 done（实盘线程 2026-08-10 已落地）；B1 落地后日志 grep 部分降级说明。

## 5. 验证

- [x] 5.1 mock 环境：注入两源帧 → OO 查询 skip/discard 按 source+symbol 归因正确；
      finalize/snapshot spans 的 attributes 可查；pino 日志进 OO 且带 trace_id。
- [x] 5.2 生产验证（交易时段，实盘线程执行）——**TDX 侧 08-11 完成**：candle spans
      （snapshot.process OK / due.finalize verdict 可见）、skip 归因（discard
      reason=no_snapshot 带 trace_id 日志 + events）、logs 单发（cnt=1）+ 顶层
      trace_id/span_id 注入、service_name=mist-backend、quantity_missing_frame
      判断点路径；**QMT 侧待 QMT 数据流恢复后补**（08-11 QMT 断流中，见
      tdx-bridge-tcp-restore-20260811 记忆）。
- [x] 5.3 `pnpm test:ci` 全绿 + `openspec validate otel-observability-gaps --strict`。

## 6. 提交（三步工作流）

- [x] 6.1 spec 确认通过后写实施计划（代码级）。
- [x] 6.2 实施计划确认后落地。
- [x] 6.3 归档（--skip-specs；live specs 已含 O1/O2a 子 spec，delta 合并由手动同步）——2026-08-12 执行
