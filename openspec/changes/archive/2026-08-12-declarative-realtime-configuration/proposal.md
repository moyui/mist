# Proposal: declarative-realtime-configuration

## Why

实时订阅配置（allowlist）与模式开关（lifecycle mode）的现状是**"env 文件 +
重启容器"式的命令式管理**，且 `REALTIME_SUBSCRIPTION_LIFECYCLE_MODE` 概念
承载过多能力，代码存在多处不对称。2026-08-11 探索实证（代码级）：

1. **allowlist 变更 = 改 .env + force-recreate 重启**——`set-realtime-
   business-allowlist.ps1`（deploy 仓）改 `TDX_REALTIME_ALLOWLIST` 后重启
   mist-backend；盘中调标的成本高，且 workflow_dispatch 输入 schema 缓存 422
   坑（每次部署后必踩）。
2. **mode 承载过多能力且不对称**：
   - 启动时 off → `onModuleInit` 提前 return，**事件订阅永不挂载**（之后翻 on
     也无效，协调器"死了"）；
   - 运行中 on→off → `handleAcceptedReady`/`enqueue` 不查 mode，**仍触发完整
     reset 收敛**（行为不一致）；
   - off 模式 allowlist 权威在 env，但任何写路径调用（POST /v1/realtime-
     subscriptions、activateSecurity）会经 `refreshDesiredState`→
     `applyAssignedRoutes` 把 env 条目**整体静默替换**成 DB 条目。
3. **无定时收敛**——coordinator 全仓唯一定时器是工作日 09:15 cron；desired
   state 每轮直读 DB（无缓存），但**外部改 DB 后若无事件触发，长时间不收敛**。
4. **诊断状态零可见**——`RealtimeSubscriptionLifecycleObservationStore.health()`
   数据齐全（desired/active/converged/trigger/result）但**零生产消费者**，
   无任何 OTel gauge；allowlist 状态同理（诊断只能靠 OO 里零散 spans）。

用户拍板方向（2026-08-11）：**声明式配置 + 控制面触发重载**（k8s/nginx 惯例）——
配置权威唯一 DB，协调层自动收敛，**零新增写端点**；并明确：
- **lifecycle 概念拆分**：mode 重命名为 `realtime_subscription_auto_reconcile`
  （true/false，off=不自动收敛），不再耦合 allowlist 来源；
- **allowlist env 彻底退役**：唯一来源 DB。

## What Changes

三层重构：

- **配置层（权威全在 DB）**：
  - 新表 `runtime_configs`（key-value + 审计字段），首项
    `realtime_subscription_auto_reconcile`（'true'/'false'）；
  - allowlist service 删 env 解析路径（`TDX/QMT_REALTIME_ALLOWLIST` 退役），
    唯一来源 DB（assignments）；删除 Joi 互斥校验（env 不再存在）；
  - 写通道 = OpenSSH + docker exec（Change 2 通道），保留 5 只上限/格式/
    resolveExact 校验 + 变更审计（旧值记录）。
- **协调层（瘦身 + 定时）**：
  - coordinator 删除 mode 分支（isEnabled 等）与对 allowlist service 内存的
    覆盖，职责收窄为"读 DB 期望 → 收敛实际订阅"；
  - 新增 @Interval 定时 reconcile（默认 60s 可配）——**改 DB 后自动收敛，
    免重启，纯声明式成立**；
  - 开关迁移逻辑集中：false→true 挂载事件订阅 + 全量收敛；true→false 停止
    自动收敛（现有订阅保留，手动接管）；修掉两处不对称。
- **状态层（诊断走 OO）**：
  - `ObservationStore.health()` / allowlist 状态 → OTel observable gauge 导出
    （复用 candle-metrics.ts 模式）——收敛状态在 OO 可查，无 HTTP 读端点。

### 边界（不做）

- **不新增任何 HTTP 写端点**（纯声明式，用户拍板；触发收敛靠定时）。
- **不做 OO 告警规则**（独立 O3）。
- **不恢复 shrink 删除的诊断 HTTP 端点**（诊断走 OTel+OO，与
  datasource-logs-to-openobserve 同方向）。
- **不废弃 off 语义**（auto_reconcile=false 保留为手动管理/诊断场景）。
- **不改 datasource 仓**（订阅收敛协议不变，仅 backend 配置模型变化）。
- **不引入新依赖**（@Interval 用 NestJS 内置 ScheduleModule，gauge 用现有
  @opentelemetry/api）。

## Capabilities

- **New** `declarative-realtime-configuration`（配置层 + 协调层：唯一 DB 权威、
  自动收敛、开关语义、写通道校验与审计）。
- **New** `mist-observability/realtime-lifecycle-observability`（状态层：
  lifecycle 收敛状态与 allowlist 状态 gauge 导出，诊断走 OO）。

## Assumptions

- `@nestjs/schedule` 已在项目依赖（现有 09:15 @Cron 使用中），@Interval
  同机制，无新依赖。
- runtime_configs 表走既有 migration 体系（deploy/database/migrations，
  下一序号 016）。
- 生产当前 lifecycle=on（assignments 已是权威）——迁移到 auto_reconcile=true
  行为等价，**一把梭直接切换（用户拍板 2026-08-11），无渐进迁移期**；
  auto_reconcile=false（手动管理）场景 assignments 仅记录（见 design D4）。
