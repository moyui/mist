# Design: otel-observability-gaps

## 决策点

### D1：skip/discard label 粒度（A1）
- **B（用户拍板 2026-08-10）**：`source` + 标的维度——逐标的归因。
  基数评估：skip reason（≤6）× source（2）× 活跃标的（allowlist 规模，个位数~数十）——仍属低基数。
- **D1a 词汇定稿（治理审计 G3，§6.3 标识符词汇）**：标的 label 在
  `securityCode`（Mist 领域代码）/ `securityId`（DB 数字主键）/ `providerSymbol`（provider 标识）
  三选一：
  - `securityCode`：消费方归因按人可读领域代码；若 securityId→securityCode 解析需每收集周期
    查库则成本高
  - `securityId`：aggregator 侧原生已有（数字主键），零解析成本，跨 provider 稳定
  - `providerSymbol`：provider 侧标识，跨 provider 不统一（600519.SH vs 300502.SZ 格式不同）
  - **倾向：`securityCode`，解析成本高则退 `securityId`**——与 remediate-otel-audit-findings
    D3 共享同一决策（两 change 引用同一定稿，不重复实现）
- 实施前提：`skipTotals`/`discardTotals` 目前是全局合并计数，需 aggregator per-instance 的
  skip/discard 计数按 source+标的汇总（aggregator 本身 per securityId+source）。
- **修订 O1 约束**：live spec `backend-candle-pipeline-observability` 的
  "Metric labels are low cardinality" 由"symbols/securityIds MUST NOT 作 label"修订为
  "skip/discard 计数允许 source+标的 label（低基数集合内，受基数护栏约束），其余指标维持原约束"。

### D2：span events → attributes 提升（A2/A3）
- attribute 命名对齐 handoff-prompts-otel-observability-gaps：finalize 用
  `verdict`/`discardReason`；snapshot 用 `skippedReason`/`bucketStartMs`/`ingestGated`。
- **vwap 校验结果不属 span**（2026-08-11 review）：backend 无 vwap 校验数据源
  （fix-tdx-vwap 的 backend 侧仅量额字段规则）；vwap 一致性检查在 deploy workflow 层
  （`read-windows-realtime-candle-closed` 的 `vwapClassification`）。
- **A（用户确认）**：关键判断点直接提升为 span attribute（`verdict`/`discardReason`/
  `bucketStartMs`/`skippedReason`），不依赖 OO 对 span events 的索引支持。
- events 保留（细节不删），attributes 是查询主路径。

### D3：日志进 OO 的实现路径（B1）
- **A（定稿 2026-08-11）**：backend pino 日志经 OTLP logs 进 OO，采用 **pino 官方组织
  `pino-opentelemetry-transport`**（v4.0.2）：
  - pino transport worker 机制（与自研方案同构，但缓冲/重试/协议/severity 官方实现）；
  - `pinoHttp.transport.target = 'pino-opentelemetry-transport'`（5 个 app）；
  - trace_id/span_id 由主线程 pinoTraceMixin 注入 → LogRecord attributes（官方包不提升
    顶层 traceId——依赖 instrumentation-pino 才能提升，webpack 场景不可用）→ OO 按
    attributes['trace_id'] 检索（gaps 2.1 验证）；
  - 可配置：OTel 标准 env（OTEL_BLRP_MAX_QUEUE_SIZE 等）。
- **D3a 资源边界（治理审计 G5，§8 并发与资源）**：
  - transport 缓冲硬上限（如 1000 条或 10MB）；满则丢弃新日志并计数（
    `log_dropped_total` 若可打点）或降级 stderr
  - OTLP 导出失败：重试 N 次（退避）→ 丢弃 + 告警计数；**不阻塞业务线程**
  - 日志流量/留存观察点（OO 侧或进程侧）随本 change 落地——设计输出供
    remediate-otel-audit-findings G5 引用（不重复设计）
- **B**：Docker logs 检索工具（`read-windows-backend-logs` workflow）——用户指出 OO 既然
  通用就不需要；仅在 A 落地前的短过渡期可用（本 change 不再实施 B）。
- A 落地前先验证：OO Rust 版 logs 流（OTLP logs 接收 + 检索 API）可用性。

### D4：查询方式与时间约定（B2）
- 文档化 OO logs/metrics 查询方式（stream 名、窗口微秒、type 参数）。
- 时间约定**引用项目既有规范**（libs/timezone：系统内部 UTC、业务边界 Asia/Shanghai）：
  脚本窗口计算统一 UTC epoch（微秒），业务时间（tradingDay/bucket/capturedAt）展示
  Asia/Shanghai——避免排查中换算错误。

### D6：SDK 初始化采用官方 register（2026-08-11 拍板，remediate G1 提前）
- 采用 `@opentelemetry/auto-instrumentations-node/register` 替代自研 `otel-preload.js`
  + `initTelemetry`——实测三路全通（traces/metrics/logs 默认 otlp，metrics 导出间隔
  `OTEL_METRIC_EXPORT_INTERVAL` 标准 env 可配）。
- 同步删除：`otel-preload.js`、`initTelemetry`/`shutdownTelemetry`（libs/otel 保留
  `pinoTraceMixin`）、6 处 main.ts 调用——**register 不设 `__MIST_OTEL_PRELOADED__`
  标记，不删 initTelemetry 会双 SDK**。
- 启动命令换 `-r @opentelemetry/auto-instrumentations-node/register`（Dockerfile/compose/
  run-mock.sh 三处）；env 全部沿用（OTEL_SERVICE_NAME/OTEL_EXPORTER_OTLP_*）。
- 与 remediate-otel-audit-findings 的关系：其 G1（单一初始化路径）随本 change 完成，
  remediate 落地时 G1 标记 done、不再重复实施。

### D5：span events 查询问题
- 本 change 不验证 OO 是否索引 span events（D2 已用 attributes 规避）；
  events 查询问题登记为已知限制（O3 或 OO 升级后复评）。

## 影响链（producer → wire → decoder → state → consumer → deploy/monitoring）

- **A1**（source+symbol label）：candle-metrics.ts gauge callback → aggregator/product
  diagnostics 数据结构（source+securityId 维）→ 单测更新（reason/source 枚举有界断言）。
- **A2/A3**（span attributes）：realtime-market-data-product.service.ts（finalize span）、
  tdx/qmt realtime.client.ts（snapshot span）→ 埋点点更新，无状态/契约改动。
- **B1**（日志进 OO）：libs/otel（preload LoggerProvider）+ pino transport（新增）→ 部署
  compose 无新 env（endpoint 复用 OTLP）→ 日志流量增加（容量/留存观察）。
- **B2**：验证脚本/文档（tools/ 或 docs/），无运行时影响。
- 消费者（OO）：logs 流检索（type=logs）、attributes 查询不变。

## 长期维护成本

- A1：label 基数受 reason×source×标的集合约束，标的集合需随 allowlist 演进观察（新增
  基数护栏：超出阈值时告警/回退 source-only）。
- A2/A3：attributes 纯增，向后兼容。
- B1：pino transport 独立于 webpack，O3 告警落地后仍是日志主路径（不退役）。
- capability 大结构：`mist-observability` 聚合 backend/datasource/日志三域，后续 O3 告警
  requirements 归入同 capability（子 spec 独立演进）。
