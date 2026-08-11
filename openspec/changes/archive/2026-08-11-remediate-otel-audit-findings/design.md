# Design: remediate-otel-audit-findings

## 决策点

### D1：initTelemetry 处置（G1）
- **A（推荐）**：删除 `libs/otel` 的 `initTelemetry`/`shutdownTelemetry`（SDK 初始化只留
  `otel-preload.js`）；6 处 main.ts 移除 `initTelemetry(...)` 调用；`pinoTraceMixin`
  保留（libs/otel 只剩 mixin 与类型）。
- **B**：保留 initTelemetry 但降级为 no-op 壳（检测 preload 标记 + 无 endpoint 双 guard），
  注释明确"SDK 初始化只经 preload"——保留调用点但消除误导。
- 权衡：A 更彻底（消除死参数），但 fallback 场景（直接 node dist 无 -r）连 manual spans
  都没有；B 保留直跑时的 manual span 能力但仍是"半可用"。**倾向 A**（直跑本就不是
  受支持路径，半可用比不可用更危险——假健康）。

### D2：G2 凭据收敛（用户拍板项）
- **A（推荐）**：compose `OO_OTLP_AUTH_BASE64` 移除默认值（`${OO_OTLP_AUTH_BASE64:?set
  OO_OTLP_AUTH_BASE64}` 必需）；`.env.example` 保留占位（空或注释）；deploy-defaults.ps1
  增加默认（从 OO_ROOT_USER_* 派生或显式变量）——**部署链显式化**。
- **B**：保留默认但改为非生产占位（mock 凭据）——生产部署必须显式传——风险：忘传则
  OTLP 401 静默（exporter 重试）。
- **C**：`OO_ROOT_USER_PASSWORD` 一并收敛（同仓明文）。
- 提交用户拍板 A/C 组合。

### D3：G3 label 词汇定稿
- **A（推荐）**：`source` + `securityCode`（Mist 领域代码，消费方归因按领域代码；
  aggregator/DB 侧已有 securityId 主键，label 用 securityCode 需从 securityId 解析——
  若解析成本高则直接 `securityId` 数字）。
- **B**：`source` + `providerSymbol`（provider 侧标识，无解析成本但跨 provider 不统一）。
- 权衡：归因消费方是排查/告警（要能对到人可读的代码）——**倾向 securityCode**；
  securityId→securityCode 解析若引入高成本（每收集周期查库）则退回 securityId。
- 与 gaps A1 共享此决策（同一定稿，两 change 引用）。

### D4：G4 monitoring 仓处置（用户拍板项）
- **A**：退役标记 + 文档对齐（README 标注"exporter/watchdog 已被 OO 白盒替代，代码保留
  供参考/回退"；metrics-overview.md 重写为 OO 现状）。
- **B**：仓级归档（移动到 archive 目录或标记只读）。
- **C**：保留现状（代码在、文档注明过时）。
- 倾向 A（保留回退能力，文档诚实）。

### D5：G5 日志 transport 资源边界（设计交付，不实施）
- 缓冲：pino transport 有界（如 1000 条或 10MB），满则丢弃新日志并计数（
  `log_dropped_total` 若可打点）或降级 stderr。
- 失败：OTLP 导出失败 → 重试 N 次（带退避）→ 丢弃 + 告警计数；不阻塞业务线程。
- 容量观察：日志流量/留存指标（OO 侧或进程侧）随 gaps B1 一并落地。

## 影响链（producer → wire → decoder → state → consumer → deploy/monitoring）

- **G1**：libs/otel（删除 initTelemetry）→ 6 个 main.ts（移除调用）→ 单测（otel.spec
  改测 mixin + preload 检测）→ 部署无变化（preload 已是主路径）——**mock/生产启动
  命令不变**。
- **G2**：deploy compose/.env/脚本 → 部署链（Set-DockerEnvValue）→ 下次部署验证 OTLP
  仍 200。
- **G3**：candle-metrics + aggregator/product diagnostics 结构 → 单测（reason/source
  有界）→ OO 查询（source 维）。
- **G4**：monitoring 文档/仓结构 → 无运行时影响。
- **G5**：设计文档 → gaps B1 实施引用。

## 长期维护成本

- G1：删除死代码后 libs/otel 更小（只剩 mixin），单一事实源。
- G2：部署链多一个必需变量（显式化成本低，防凭据漂移）。
- G3：label 基数受 source×reason×标的集合约束（护栏随 gaps）。
- G4：文档维护成本（退役标记后低）。
- G5：随 gaps 实施，本 change 不产生代码。
