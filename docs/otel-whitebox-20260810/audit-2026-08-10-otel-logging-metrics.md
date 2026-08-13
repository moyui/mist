# 日志+打点系统（OTel 白盒监控）质量审计报告

- 日期：2026-08-10；范围：OTel 白盒监控体系（O0 底座 / O1 backend 管道 / O2a datasource / backtest 5.2 指标与日志 / 部署链路）
- 仓库状态（§0）：
  - mist：master @ `f73d3c1`，dirty=3（openspec 草稿目录：otel-observability-gaps、fix-tdx-realtime-vwap-window-consistency、live specs/mist-observability——均为未提交 spec，不在本次代码审计范围）
  - mist-datasource：master @ `445b441`，clean
  - mist-deploy：master @ `8317453`，clean（含 OTEL_SERVICE_NAME 修复，**未部署**）
- 排除：OpenSpec 归档内容（--skip-specs rename-only，另见 gaps spec）、生产 HIL 证据（evidence-2026-08-10-*.md 已另行记录）

## 总览

| 状态 | 高 | 中 | 低 | 合计 |
|---|---|---|---|---|
| 已确认 | 0 | 6 | 2 | 8 |
| 已修复 | 0 | 1 | 0 | 1 |
| 有意差异 | 0 | 0 | 2 | 2 |
| 未发现 | — | — | — | — |

## Finding

### F1【中】SDK 配置双份，存在漂移风险
- 状态：已确认
- 证据：`otel-preload.js:33-38`（NodeSDK 配置：serviceName/traceExporter/metricReader/instrumentations）与 `libs/otel/src/otel.ts:80-85`（initTelemetry 内完全相同的 NodeSDK 配置）逐字重复；shutdown 逻辑也双份（preload L39-47 / otel.ts L92-96）
- Producer → wire → consumer：SDK 配置是 preload（生产主路径）与 initTelemetry（fallback）共同的运行时契约；两处各自独立演化
- 实际后果：gaps 的"日志进 OO"（LoggerProvider）必须改两处，漏改一处即生产/fallback 行为漂移；本次审计已见 `metricReader`（deprecated）在两处同步过期
- 边界/例外：preload 必须独立于 webpack（CJS 前置加载），不能直接 import TS 的 initTelemetry；共享方式需 CJS 兼容
- 验证方法：diff 两文件配置段；gaps 实施时确认单一来源

### F2【中】initTelemetry fallback 路径静默半可用
- 状态：已确认
- 证据：`libs/otel/src/otel.ts:62-68`（注释宣称 "remains as a fallback for direct `node dist/...` runs"）+ `otel.ts:80-90`（fallback 在 bundle 内 start SDK）
- Producer → wire → consumer：直接 `node dist/...`（无 `-r otel-preload.js`）时 SDK 在 webpack 顶层 require 之后初始化 → RITM 对已缓存的 http/express/pino 不触发 → **manual spans 工作、auto-instrumentation 全部静默失效**（08-10 已实证该机制）
- 实际后果：任何绕过 preload 的启动方式（本地直跑、未来部署脚本漏 -r）会得到"有遥测但关键链路缺失"的假健康；无任何告警或日志提示
- 边界/例外：mock 与生产均走 preload，fallback 仅影响直跑场景
- 验证方法：`node dist/apps/mist/main.js`（带 endpoint env，无 -r）→ OO 无 http server span

### F3【中】OTLP 凭据 base64 默认值进仓库
- 状态：已确认
- 证据：`mist-deploy/docker/compose.yaml:94,124,157,209`——`OO_OTLP_AUTH_BASE64:-cm9vdEBtaXN0LmxvY2FsOk1pc3RAMjAyNiFPYnNlcnZl`（= base64("root@mist.local:Mist@2026!Observe")，可逆解出生产 OO 凭据）
- Producer → wire → consumer：compose 默认值 → 容器 env → OTLP Authorization header；`.env` 可覆盖但默认即生产凭据
- 实际后果：凭据以可解 base64 常驻 git 历史；repo 若外泄即生产 OO 管理面暴露
- 边界/例外：repo 为私有（待确认）；同仓另有 `OO_ROOT_USER_PASSWORD` 的 .env 默认（`Mist@2026!Observe`）同样明文——但那是 compose 变量默认，本 finding 聚焦 OTLP header 的 base64 形态
- 验证方法：base64 -d 解出明文；确认 repo 可见性

### F4【中】service_name 双来源，preload fallback 默认串名（已修复，待部署）
- 状态：已修复（deploy `8317453`，15:40，**未部署**）
- 证据：`otel-preload.js:33`（`OTEL_SERVICE_NAME ?? 'mist-backend'`）；main.ts 的 `initTelemetry({ serviceName })` 在 preload 路径被忽略（otel.ts:58-60 no-op）→ service 名实际只来自 compose env；8317453 已为 backtest/mist-backend/signal/chan-api 显式设 `OTEL_SERVICE_NAME`
- Producer → wire → consumer：compose env → preload → OO service_name；main.ts 参数是死参数（preload 下）
- 实际后果：修复前所有 app 生产遥测 service_name 全为 mist-backend（跨 app 无法区分，08-10 backtest 生产验证实证）；新 app 若忘设 compose env 会复发
- 边界/例外：生产 4 个 node app 已覆盖；schedule 不在生产 compose（重构中）
- 验证方法：下次部署后查 OO `distinct service_name`；main.ts 死参数处置纳入 gaps 决策

### F5【中】skip/discard 计数无 source 归因
- 状态：已确认（gaps spec 已规划 A1）
- 证据：`apps/mist/src/realtime/observability/candle-metrics.ts:110-117`（skip gauge 只 observe `{reason}`）；对比 datasource `metrics.py:35-43`（accepted/rejected 带 `{source,reason}`）——**不对称**
- Producer → wire → consumer：aggregator skip 计数 → product.runtimeObservation().candle.skipTotals（全局合并）→ gauge `{reason}` → OO 查询无 source 维
- 实际后果：08-10 实盘 `out_of_session=1170` 混两源无法归因，差点误判 TDX bug；排查绕大圈
- 边界/例外：aggregator 本身 per securityId+source（计数可溯源），是汇聚层丢维度
- 验证方法：gaps 实施后 OO 按 source 分组查询

### F6【中】span events 在 OO 不可查询
- 状态：已确认（gaps spec 已规划 D2：提升 attribute 规避）
- 证据：08-10 实盘查询 `candle.snapshot.process` 的 `skipped`/`ingest_gated` events 全空；`realtime.client.ts`（tdx:298-369 / qmt:290-36x）与 product service（`candle.due.finalize`）的判定细节均在 events
- Producer → wire → consumer：埋点（events）→ OTLP → OO（events 未索引/不可查）→ 排查被迫转 backend 日志
- 实际后果：判定细节（skip 原因、discard reason）在生产不可查，唯一消费路径是日志
- 边界/例外：OO 是否索引 events 未验证（D2 已决定不依赖）
- 验证方法：gaps 实施后 attribute 查询

### F7【低】`metricReader` 使用 deprecated API
- 状态：已确认
- 证据：`otel-preload.js:36` 与 `otel.ts:83`——`metricReader`（sdk-node 0.221 构造时输出 "The 'metricReader' option is deprecated. Please use 'metricReaders' instead."）；datasource `otel.py:56` 用 `metric_readers=[...]`（正确形态）
- 实际后果：未来 sdk-node 版本移除旧 option 时两处同步失效；当前仅运行警告
- 验证方法：启动日志可见 deprecation warning

### F8【低】tracer/meter scope 名与 service 名同值
- 状态：有意差异
- 证据：`tracer.ts:5`（getTracer('mist-backend')）、`candle-metrics.ts:19`/`startup-compensation-metrics.ts:18`（getMeter('mist-backend'/'backtest','0.1.0')）——instrumentation scope 名复用进程名
- 实际后果：OO 按 service_name 归因不受影响（scope 是元数据）；OTel 惯例 scope 用库名，但自用系统无消费者依赖 scope 名
- 边界/例外：跨 app 复制模式时保持一致即可

## 正面发现

1. **preload 架构**（`otel-preload.js`）：解决 webpack 顶层 require 先于 SDK 导致的 RITM 缓存失效——O1 部署前生产 mist-backend 零 spans，部署后 GET/tcp/dns 全链路出现，机制经实测验证
2. **`@opentelemetry/api` webpack external**（`webpack.config.js:22`）：消除双副本 noop provider 陷阱，注释含完整根因
3. **withCandleSpan try/finally**（`tracer.ts:20-30`）：正确适配 OTel SDK 2.x startActiveSpan 不再自动 end 的 breaking change，异常/提前 return 均保证 end
4. **pinoTraceMixin**（`otel.ts:17-26`）：绕开 webpack 内 pino 无法 RITM patch 的限制，trace_id/span_id 实测注入（mock 12 条）
5. **datasource 侧质量**（`otel.py`）：no-op guard、幂等、`force_flush()` 启动失败路径、单 worker 边界说明；`metrics.py` 防御式（`_INSTRUMENTS.get` no-op）且 source label 从 O2a 即带——backend 侧不对称正是 F5
6. **5.2 实现镜像 candle 模式**（backtest-metrics.ts / startup-compensation-metrics.ts）：`_registered` 幂等、`{reason}` 有界、零改动补偿服务（outcome 日志现状满足 spec）、日志级别纪律（info=生命周期/warn=拒绝/error=真实失败）
7. **mock-verify.sh 断言**（datasource 仓）：跨仓 contract 资产（ingest/ws/candle spans + trace_id），CI 可重复
8. **no-op guard 一致**（三仓）：无 OTEL_EXPORTER_OTLP_ENDPOINT 时零 OTel 开销，本地/CI 无副作用

## 未验证项与外部门禁

- OO span events 索引能力：未验证（F6 已用 attribute 规避，登记为已知限制）
- OO Rust 版 logs 流（OTLP logs 接收 + 检索）：gaps 实施前置验证项
- `mist-deploy` 8317453（service_name 修复）：待下次部署生效验证
- 生产 candle spans（`candle.snapshot.process`/`candle.due.finalize`）：开盘时段待实盘线程首验
- repo 可见性（影响 F3 严重度）：未确认公开/私有
- metrics 历史查询窗口行为（08-10 上午查不到历史值）：根因未定，gaps D4 文档化

## 修复依赖和发布/回滚边界

- F5/F6：gaps change（`otel-observability-gaps`，spec 已设计：A1 source+symbol label、D2 attributes 提升）——纯增量，无回滚风险
- F1（配置双份）/F2（fallback）：建议随 gaps 的"日志进 OO"（LoggerProvider 双份改造）一并处置——单一配置来源决策
- F4：8317453 已提交，随下次生产部署生效；main.ts 死参数（initTelemetry serviceName）处置纳入 gaps 决策（D 系列）
- F3（凭据）：compose 默认值收敛到 .env 必需项（remove default）——独立小任务，需用户拍板（涉及部署脚本 Set-DockerEnvValue 链）
- 所有修复设计需经对应 OpenSpec 或明确任务确认（审计原则），本次审计不实施任何修复

> ⚠️ 本报告按 checklist（project-quality-audit-checklist.md）审计，用户确认审计依据应为 governance guide，结论被 audit-2026-08-10-otel-governance.md 取代（2026-08-10）。
